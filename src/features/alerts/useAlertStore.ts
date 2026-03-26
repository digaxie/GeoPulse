import { create } from 'zustand'

import {
  ALERT_HISTORY_LIMIT,
  ALERT_HISTORY_WINDOW_MS,
  DEFAULT_ALERT_RETENTION_MS,
  MAX_ALERT_RETENTION_MS,
  MIN_ALERT_RETENTION_MS,
  getSystemMessageStreamKey,
  type AlertFeedStatus,
  type AlertFeedTransport,
  type AlertIncidentStreamItem,
  type RocketAlert,
} from '@/features/alerts/types'
import type { TzevaadomConnectionStatus, TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

const MAX_SYSTEM_MESSAGES = 200
const SYSTEM_MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000
const MAX_INCIDENT_STREAM_ITEMS = 100

type AlertStore = {
  alerts: RocketAlert[]
  historyAlerts: RocketAlert[]
  historyTruncated: boolean
  feedStatus: AlertFeedStatus
  feedTransport: AlertFeedTransport
  lastFetchedAt: number | null
  selectedAlertId: string | null
  dismissedBeforeMs: number | null
  retentionMs: number
  tzevaadomStatus: TzevaadomConnectionStatus
  systemMessages: TzevaadomSystemMessage[]
  focusedSystemMessageKey: string | null
  incidentStreamItems: AlertIncidentStreamItem[]
  focusedIncidentStreamKey: string | null
  alertsPanelRevealNonce: number
  focusCoordinate: { lat: number; lon: number; name: string } | null
  setAlerts: (alerts: RocketAlert[], fetchedAt?: number | null) => void
  setHistoryAlerts: (alerts: RocketAlert[], now?: number) => void
  setHistoryTruncated: (truncated: boolean) => void
  mergeHistoryAlerts: (alerts: RocketAlert[], now?: number) => void
  pruneHistoryAlerts: (now?: number) => void
  setFeedStatus: (status: AlertFeedStatus) => void
  setFeedTransport: (transport: AlertFeedTransport) => void
  setSelectedAlertId: (alertId: string | null) => void
  setRetentionMs: (retentionMs: number) => void
  pruneActiveAlerts: (now?: number) => void
  dismissCurrentAlerts: (cutoffMs?: number) => void
  clearAlerts: () => void
  setTzevaadomStatus: (status: TzevaadomConnectionStatus) => void
  addSystemMessage: (message: TzevaadomSystemMessage) => void
  dismissSystemMessage: (id: number) => void
  clearSystemMessages: () => void
  appendIncidentStreamAlert: (alertId: string, receivedAtMs: number) => void
  appendIncidentStreamSystem: (systemMessageKey: string, receivedAtMs: number) => void
  focusIncidentStreamItem: (key: string) => void
  clearIncidentStream: () => void
  pruneIncidentStream: (now?: number) => void
  requestRevealAlertsPanel: () => void
  setFocusedSystemMessageKey: (key: string | null) => void
  setFocusCoordinate: (coord: { lat: number; lon: number; name: string } | null) => void
  focusTrigger: number
}

function sortAlertsByNewest(alerts: RocketAlert[]) {
  return [...alerts].sort((left, right) => {
    if (right.occurredAtMs !== left.occurredAtMs) {
      return right.occurredAtMs - left.occurredAtMs
    }

    return right.timeStampRaw.localeCompare(left.timeStampRaw, 'en')
  })
}

function areAlertsEqual(left: RocketAlert[], right: RocketAlert[]) {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftAlert = left[index]
    const rightAlert = right[index]
    if (
      !leftAlert ||
      !rightAlert ||
      leftAlert.id !== rightAlert.id ||
      leftAlert.occurredAtMs !== rightAlert.occurredAtMs ||
      leftAlert.lat !== rightAlert.lat ||
      leftAlert.lon !== rightAlert.lon ||
      leftAlert.countdownSec !== rightAlert.countdownSec
    ) {
      return false
    }
  }

  return true
}

function areIncidentStreamItemsEqual(
  left: AlertIncidentStreamItem[],
  right: AlertIncidentStreamItem[],
) {
  if (left === right) {
    return true
  }

  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index]
    const rightItem = right[index]
    if (
      !leftItem ||
      !rightItem ||
      leftItem.key !== rightItem.key ||
      leftItem.kind !== rightItem.kind ||
      leftItem.receivedAtMs !== rightItem.receivedAtMs ||
      leftItem.expiresAtMs !== rightItem.expiresAtMs
    ) {
      return false
    }

    if (leftItem.kind === 'alert' && leftItem.alertId !== (rightItem.kind === 'alert' ? rightItem.alertId : null)) {
      return false
    }

    if (
      leftItem.kind === 'system' &&
      leftItem.systemMessageKey !== (rightItem.kind === 'system' ? rightItem.systemMessageKey : null)
    ) {
      return false
    }
  }

  return true
}

function resolveSelectedAlertId(
  selectedAlertId: string | null,
  alerts: RocketAlert[],
  historyAlerts: RocketAlert[],
) {
  if (!selectedAlertId) {
    return null
  }

  return alerts.some((alert) => alert.id === selectedAlertId) ||
    historyAlerts.some((alert) => alert.id === selectedAlertId)
    ? selectedAlertId
    : null
}

function normalizeHistoryAlerts(alerts: RocketAlert[], now = Date.now()) {
  const merged = new Map<string, RocketAlert>()

  for (const alert of alerts) {
    if (now - alert.occurredAtMs > ALERT_HISTORY_WINDOW_MS || alert.occurredAtMs > now) {
      continue
    }

    merged.set(alert.id, alert)
  }

  return sortAlertsByNewest(Array.from(merged.values())).slice(0, ALERT_HISTORY_LIMIT)
}

function normalizeActiveAlerts(
  alerts: RocketAlert[],
  retentionMs: number,
  dismissedBeforeMs: number | null,
  now = Date.now(),
) {
  const visibleAlerts = alerts.filter((alert) => {
    if (alert.occurredAtMs > now) {
      return false
    }

    if (now - alert.occurredAtMs > retentionMs) {
      return false
    }

    if (dismissedBeforeMs !== null && alert.occurredAtMs <= dismissedBeforeMs) {
      return false
    }

    return true
  })

  return sortAlertsByNewest(visibleAlerts)
}

function retimeIncidentStream(items: AlertIncidentStreamItem[], retentionMs: number) {
  return items.map((item) => ({
    ...item,
    expiresAtMs: item.receivedAtMs + retentionMs,
  }))
}

function normalizeIncidentStream(
  items: AlertIncidentStreamItem[],
  alerts: RocketAlert[],
  historyAlerts: RocketAlert[],
  systemMessages: TzevaadomSystemMessage[],
  focusedIncidentStreamKey: string | null,
  now = Date.now(),
) {
  const availableAlertIds = new Set<string>([
    ...alerts.map((alert) => alert.id),
    ...historyAlerts.map((alert) => alert.id),
  ])
  const availableSystemMessageKeys = new Set<string>(
    systemMessages.map((message) => getSystemMessageStreamKey(message)),
  )
  const seenKeys = new Set<string>()
  const nextItems = [...items]
    .sort((left, right) => {
      if (right.receivedAtMs !== left.receivedAtMs) {
        return right.receivedAtMs - left.receivedAtMs
      }

      return right.key.localeCompare(left.key, 'en')
    })
    .filter((item) => {
      if (item.expiresAtMs <= now) {
        return false
      }

      if (seenKeys.has(item.key)) {
        return false
      }

      if (item.kind === 'alert' && !availableAlertIds.has(item.alertId)) {
        return false
      }

      if (item.kind === 'system' && !availableSystemMessageKeys.has(item.systemMessageKey)) {
        return false
      }

      seenKeys.add(item.key)
      return true
    })
    .slice(0, MAX_INCIDENT_STREAM_ITEMS)

  const nextFocusedIncidentStreamKey = nextItems.some((item) => item.key === focusedIncidentStreamKey)
    ? focusedIncidentStreamKey
    : (nextItems[0]?.key ?? null)

  return {
    items: nextItems,
    focusedIncidentStreamKey: nextFocusedIncidentStreamKey,
  }
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  historyAlerts: [],
  historyTruncated: false,
  feedStatus: 'disconnected',
  feedTransport: 'none',
  lastFetchedAt: null,
  selectedAlertId: null,
  dismissedBeforeMs: null,
  retentionMs: DEFAULT_ALERT_RETENTION_MS,
  tzevaadomStatus: 'disconnected',
  systemMessages: [],
  focusedSystemMessageKey: null,
  incidentStreamItems: [],
  focusedIncidentStreamKey: null,
  alertsPanelRevealNonce: 0,
  focusCoordinate: null,
  focusTrigger: 0,

  setAlerts(alerts, fetchedAt = null) {
    set((current) => {
      const now = fetchedAt ?? Date.now()
      const visibleAlerts = normalizeActiveAlerts(
        alerts,
        current.retentionMs,
        current.dismissedBeforeMs,
        now,
      )
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        visibleAlerts,
        current.historyAlerts,
      )
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        visibleAlerts,
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )
      const nextLastFetchedAt = fetchedAt ?? current.lastFetchedAt
      const sameAlerts = areAlertsEqual(current.alerts, visibleAlerts)

      if (
        sameAlerts &&
        current.lastFetchedAt === nextLastFetchedAt &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey &&
        areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items)
      ) {
        return current
      }

      return {
        alerts: sameAlerts ? current.alerts : visibleAlerts,
        lastFetchedAt: nextLastFetchedAt,
        selectedAlertId: nextSelectedAlertId,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  setHistoryAlerts(alerts, now = Date.now()) {
    set((current) => {
      const nextHistoryAlerts = normalizeHistoryAlerts(alerts, now)
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        current.alerts,
        nextHistoryAlerts,
      )
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        current.alerts,
        nextHistoryAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey &&
        areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items)
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        selectedAlertId: nextSelectedAlertId,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  setHistoryTruncated(historyTruncated) {
    set((current) => (current.historyTruncated === historyTruncated ? current : { historyTruncated }))
  },

  mergeHistoryAlerts(alerts, now = Date.now()) {
    set((current) => {
      const nextHistoryAlerts = normalizeHistoryAlerts([...current.historyAlerts, ...alerts], now)
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        current.alerts,
        nextHistoryAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey &&
        areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items)
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  pruneHistoryAlerts(now = Date.now()) {
    set((current) => {
      const nextHistoryAlerts = normalizeHistoryAlerts(current.historyAlerts, now)
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        current.alerts,
        nextHistoryAlerts,
      )
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        current.alerts,
        nextHistoryAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey &&
        areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items)
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        selectedAlertId: nextSelectedAlertId,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  setFeedStatus(feedStatus) {
    set((current) => (current.feedStatus === feedStatus ? current : { feedStatus }))
  },

  setFeedTransport(feedTransport) {
    set((current) => (current.feedTransport === feedTransport ? current : { feedTransport }))
  },

  setSelectedAlertId(selectedAlertId) {
    set((current) => (current.selectedAlertId === selectedAlertId ? current : { selectedAlertId }))
  },

  setRetentionMs(retentionMs) {
    const nextRetentionMs = Math.round(
      Math.min(MAX_ALERT_RETENTION_MS, Math.max(MIN_ALERT_RETENTION_MS, retentionMs)),
    )
    set((current) => {
      if (current.retentionMs === nextRetentionMs) {
        return current
      }

      const now = Date.now()
      const nextAlerts = normalizeActiveAlerts(
        current.alerts,
        nextRetentionMs,
        current.dismissedBeforeMs,
        now,
      )
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        nextAlerts,
        current.historyAlerts,
      )
      const nextStream = normalizeIncidentStream(
        retimeIncidentStream(current.incidentStreamItems, nextRetentionMs),
        nextAlerts,
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      return {
        retentionMs: nextRetentionMs,
        alerts: nextAlerts,
        selectedAlertId: nextSelectedAlertId,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  pruneActiveAlerts(now = Date.now()) {
    set((current) => {
      const nextAlerts = normalizeActiveAlerts(
        current.alerts,
        current.retentionMs,
        current.dismissedBeforeMs,
        now,
      )
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        nextAlerts,
        current.historyAlerts,
      )
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        nextAlerts,
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      if (
        areAlertsEqual(current.alerts, nextAlerts) &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey &&
        areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items)
      ) {
        return current
      }

      return {
        alerts: nextAlerts,
        selectedAlertId: nextSelectedAlertId,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  dismissCurrentAlerts(cutoffMs = Date.now()) {
    set((current) => {
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        [],
        current.historyAlerts,
      )
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        [],
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        cutoffMs,
      )

      return {
        alerts: [],
        selectedAlertId: nextSelectedAlertId,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
        dismissedBeforeMs: cutoffMs,
      }
    })
  },

  clearAlerts() {
    set({
      alerts: [],
      historyAlerts: [],
      historyTruncated: false,
      feedTransport: 'none',
      lastFetchedAt: null,
      selectedAlertId: null,
      incidentStreamItems: [],
      focusedIncidentStreamKey: null,
      alertsPanelRevealNonce: 0,
      dismissedBeforeMs: null,
    })
  },

  setTzevaadomStatus(tzevaadomStatus) {
    set((current) => (current.tzevaadomStatus === tzevaadomStatus ? current : { tzevaadomStatus }))
  },

  addSystemMessage(message) {
    set((current) => {
      const now = Date.now()
      const isDuplicate = current.systemMessages.some(
        (existing) => getSystemMessageStreamKey(existing) === getSystemMessageStreamKey(message),
      )
      if (isDuplicate) {
        return current
      }

      const fresh = current.systemMessages.filter(
        (existing) => now - existing.receivedAtMs < SYSTEM_MESSAGE_RETENTION_MS,
      )
      fresh.unshift(message)

      const nextSystemMessages = fresh.slice(0, MAX_SYSTEM_MESSAGES)
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        current.alerts,
        current.historyAlerts,
        nextSystemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      return {
        systemMessages: nextSystemMessages,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  dismissSystemMessage(id) {
    set((current) => ({
      systemMessages: current.systemMessages.map((message) =>
        message.id === id ? { ...message, dismissed: true } : message,
      ),
    }))
  },

  clearSystemMessages() {
    set((current) => {
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        current.alerts,
        current.historyAlerts,
        [],
        current.focusedIncidentStreamKey,
      )

      return {
        systemMessages: [],
        focusedSystemMessageKey: null,
        incidentStreamItems: nextStream.items,
        focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
      }
    })
  },

  appendIncidentStreamAlert(alertId, receivedAtMs) {
    set((current) => {
      const nextStream = normalizeIncidentStream(
        [
          {
            key: `alert:${alertId}`,
            kind: 'alert',
            alertId,
            receivedAtMs,
            expiresAtMs: receivedAtMs + current.retentionMs,
          },
          ...current.incidentStreamItems,
        ],
        current.alerts,
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
      )

      return areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items) &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey
        ? current
        : {
            incidentStreamItems: nextStream.items,
            focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
          }
    })
  },

  appendIncidentStreamSystem(systemMessageKey, receivedAtMs) {
    set((current) => {
      const nextStream = normalizeIncidentStream(
        [
          {
            key: `system:${systemMessageKey}`,
            kind: 'system',
            systemMessageKey,
            receivedAtMs,
            expiresAtMs: receivedAtMs + current.retentionMs,
          },
          ...current.incidentStreamItems,
        ],
        current.alerts,
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
      )

      return areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items) &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey
        ? current
        : {
            incidentStreamItems: nextStream.items,
            focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
          }
    })
  },

  focusIncidentStreamItem(key) {
    set((current) => {
      if (
        current.focusedIncidentStreamKey === key ||
        !current.incidentStreamItems.some((item) => item.key === key)
      ) {
        return current
      }

      return {
        focusedIncidentStreamKey: key,
      }
    })
  },

  clearIncidentStream() {
    set((current) =>
      current.focusedIncidentStreamKey === null && current.incidentStreamItems.length === 0
        ? current
        : {
            focusedIncidentStreamKey: null,
            incidentStreamItems: [],
          },
    )
  },

  pruneIncidentStream(now = Date.now()) {
    set((current) => {
      const nextStream = normalizeIncidentStream(
        current.incidentStreamItems,
        current.alerts,
        current.historyAlerts,
        current.systemMessages,
        current.focusedIncidentStreamKey,
        now,
      )

      return areIncidentStreamItemsEqual(current.incidentStreamItems, nextStream.items) &&
        current.focusedIncidentStreamKey === nextStream.focusedIncidentStreamKey
        ? current
        : {
            incidentStreamItems: nextStream.items,
            focusedIncidentStreamKey: nextStream.focusedIncidentStreamKey,
          }
    })
  },

  requestRevealAlertsPanel() {
    set((current) => ({
      alertsPanelRevealNonce: current.alertsPanelRevealNonce + 1,
    }))
  },

  setFocusedSystemMessageKey(key) {
    set((current) =>
      current.focusedSystemMessageKey === key
        ? current
        : {
            focusedSystemMessageKey: key,
            selectedAlertId: key === null ? current.selectedAlertId : null,
          },
    )
  },

  setFocusCoordinate(coord) {
    set((current) => ({ focusCoordinate: coord, focusTrigger: current.focusTrigger + 1 }))
  },
}))
