import { create } from 'zustand'

import {
  ALERT_HISTORY_LIMIT,
  ALERT_HISTORY_WINDOW_MS,
  DEFAULT_ALERT_RETENTION_MS,
  MAX_ALERT_RETENTION_MS,
  MIN_ALERT_RETENTION_MS,
  type AlertIncidentQueueItem,
  type AlertFeedStatus,
  type AlertFeedTransport,
  type RocketAlert,
} from '@/features/alerts/types'
import type { TzevaadomConnectionStatus, TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

const MAX_SYSTEM_MESSAGES = 200
const SYSTEM_MESSAGE_RETENTION_MS = 24 * 60 * 60 * 1000 // 24 hours
const MAX_PENDING_INCIDENT_QUEUE_ITEMS = 100

type AlertStore = {
  alerts: RocketAlert[]
  historyAlerts: RocketAlert[]
  feedStatus: AlertFeedStatus
  feedTransport: AlertFeedTransport
  lastFetchedAt: number | null
  selectedAlertId: string | null
  dismissedBeforeMs: number | null
  retentionMs: number
  tzevaadomStatus: TzevaadomConnectionStatus
  systemMessages: TzevaadomSystemMessage[]
  focusedSystemMessageId: number | null
  focusedIncidentAlertId: string | null
  focusedIncidentPinnedAtMs: number | null
  pendingIncidentQueue: AlertIncidentQueueItem[]
  alertsPanelRevealNonce: number
  focusCoordinate: { lat: number; lon: number; name: string } | null
  setAlerts: (alerts: RocketAlert[], fetchedAt?: number | null) => void
  setHistoryAlerts: (alerts: RocketAlert[], now?: number) => void
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
  focusIncident: (alertId: string, pinnedAtMs?: number) => void
  enqueuePendingIncident: (alertId: string, receivedAtMs: number) => void
  promotePendingIncident: (alertId: string) => void
  clearFocusedIncident: () => void
  requestRevealAlertsPanel: () => void
  setFocusedSystemMessageId: (id: number | null) => void
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

function arePendingIncidentQueueItemsEqual(
  left: AlertIncidentQueueItem[],
  right: AlertIncidentQueueItem[],
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
      leftItem.alertId !== rightItem.alertId ||
      leftItem.receivedAtMs !== rightItem.receivedAtMs
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

function resolveFocusedIncidentAlertId(
  focusedIncidentAlertId: string | null,
  alerts: RocketAlert[],
  historyAlerts: RocketAlert[],
) {
  if (!focusedIncidentAlertId) {
    return null
  }

  return alerts.some((alert) => alert.id === focusedIncidentAlertId) ||
    historyAlerts.some((alert) => alert.id === focusedIncidentAlertId)
    ? focusedIncidentAlertId
    : null
}

function normalizePendingIncidentQueue(
  queue: AlertIncidentQueueItem[],
  alerts: RocketAlert[],
  historyAlerts: RocketAlert[],
  focusedIncidentAlertId: string | null,
) {
  const availableIds = new Set<string>([
    ...alerts.map((alert) => alert.id),
    ...historyAlerts.map((alert) => alert.id),
  ])
  const seenIds = new Set<string>()
  const nextQueue: AlertIncidentQueueItem[] = []

  for (const item of queue) {
    if (
      item.alertId === focusedIncidentAlertId ||
      !availableIds.has(item.alertId) ||
      seenIds.has(item.alertId)
    ) {
      continue
    }

    seenIds.add(item.alertId)
    nextQueue.push(item)

    if (nextQueue.length >= MAX_PENDING_INCIDENT_QUEUE_ITEMS) {
      break
    }
  }

  return nextQueue
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

function normalizeActiveAlerts(alerts: RocketAlert[], retentionMs: number, dismissedBeforeMs: number | null, now = Date.now()) {
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

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  historyAlerts: [],
  feedStatus: 'disconnected',
  feedTransport: 'none',
  lastFetchedAt: null,
  selectedAlertId: null,
  dismissedBeforeMs: null,
  retentionMs: DEFAULT_ALERT_RETENTION_MS,
  tzevaadomStatus: 'disconnected',
  systemMessages: [],
  focusedSystemMessageId: null,
  focusedIncidentAlertId: null,
  focusedIncidentPinnedAtMs: null,
  pendingIncidentQueue: [],
  alertsPanelRevealNonce: 0,
  focusCoordinate: null,
  focusTrigger: 0,

  setAlerts(alerts, fetchedAt = null) {
    set((current) => {
      const visibleAlerts = normalizeActiveAlerts(
        alerts,
        current.retentionMs,
        current.dismissedBeforeMs,
        fetchedAt ?? Date.now(),
      )
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        visibleAlerts,
        current.historyAlerts,
      )
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        visibleAlerts,
        current.historyAlerts,
      )
      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        current.pendingIncidentQueue,
        visibleAlerts,
        current.historyAlerts,
        nextFocusedIncidentAlertId,
      )
      const nextLastFetchedAt = fetchedAt ?? current.lastFetchedAt
      const sameAlerts = areAlertsEqual(current.alerts, visibleAlerts)

      if (
        sameAlerts &&
        current.lastFetchedAt === nextLastFetchedAt &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentAlertId === nextFocusedIncidentAlertId &&
        arePendingIncidentQueueItemsEqual(current.pendingIncidentQueue, nextPendingIncidentQueue)
      ) {
        return current
      }

      return {
        alerts: sameAlerts ? current.alerts : visibleAlerts,
        lastFetchedAt: nextLastFetchedAt,
        selectedAlertId: nextSelectedAlertId,
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        pendingIncidentQueue: nextPendingIncidentQueue,
        focusedIncidentPinnedAtMs:
          nextFocusedIncidentAlertId === current.focusedIncidentAlertId
            ? current.focusedIncidentPinnedAtMs
            : nextFocusedIncidentAlertId
              ? current.focusedIncidentPinnedAtMs
              : null,
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
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        current.alerts,
        nextHistoryAlerts,
      )
      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        current.pendingIncidentQueue,
        current.alerts,
        nextHistoryAlerts,
        nextFocusedIncidentAlertId,
      )

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentAlertId === nextFocusedIncidentAlertId &&
        arePendingIncidentQueueItemsEqual(current.pendingIncidentQueue, nextPendingIncidentQueue)
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        selectedAlertId: nextSelectedAlertId,
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        pendingIncidentQueue: nextPendingIncidentQueue,
        focusedIncidentPinnedAtMs:
          nextFocusedIncidentAlertId === current.focusedIncidentAlertId
            ? current.focusedIncidentPinnedAtMs
            : nextFocusedIncidentAlertId
              ? current.focusedIncidentPinnedAtMs
              : null,
      }
    })
  },

  mergeHistoryAlerts(alerts, now = Date.now()) {
    set((current) => {
      const nextHistoryAlerts = normalizeHistoryAlerts([...current.historyAlerts, ...alerts], now)
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        current.alerts,
        nextHistoryAlerts,
      )
      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        current.pendingIncidentQueue,
        current.alerts,
        nextHistoryAlerts,
        nextFocusedIncidentAlertId,
      )

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.focusedIncidentAlertId === nextFocusedIncidentAlertId &&
        arePendingIncidentQueueItemsEqual(current.pendingIncidentQueue, nextPendingIncidentQueue)
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        pendingIncidentQueue: nextPendingIncidentQueue,
        focusedIncidentPinnedAtMs:
          nextFocusedIncidentAlertId === current.focusedIncidentAlertId
            ? current.focusedIncidentPinnedAtMs
            : nextFocusedIncidentAlertId
              ? current.focusedIncidentPinnedAtMs
              : null,
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
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        current.alerts,
        nextHistoryAlerts,
      )
      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        current.pendingIncidentQueue,
        current.alerts,
        nextHistoryAlerts,
        nextFocusedIncidentAlertId,
      )

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentAlertId === nextFocusedIncidentAlertId &&
        arePendingIncidentQueueItemsEqual(current.pendingIncidentQueue, nextPendingIncidentQueue)
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        selectedAlertId: nextSelectedAlertId,
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        pendingIncidentQueue: nextPendingIncidentQueue,
        focusedIncidentPinnedAtMs:
          nextFocusedIncidentAlertId === current.focusedIncidentAlertId
            ? current.focusedIncidentPinnedAtMs
            : nextFocusedIncidentAlertId
              ? current.focusedIncidentPinnedAtMs
              : null,
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
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        nextAlerts,
        current.historyAlerts,
      )
      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        current.pendingIncidentQueue,
        nextAlerts,
        current.historyAlerts,
        nextFocusedIncidentAlertId,
      )

      return {
        retentionMs: nextRetentionMs,
        alerts: nextAlerts,
        selectedAlertId: nextSelectedAlertId,
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        pendingIncidentQueue: nextPendingIncidentQueue,
        focusedIncidentPinnedAtMs: nextFocusedIncidentAlertId
          ? current.focusedIncidentPinnedAtMs
          : null,
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
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        nextAlerts,
        current.historyAlerts,
      )
      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        current.pendingIncidentQueue,
        nextAlerts,
        current.historyAlerts,
        nextFocusedIncidentAlertId,
      )

      if (
        areAlertsEqual(current.alerts, nextAlerts) &&
        current.selectedAlertId === nextSelectedAlertId &&
        current.focusedIncidentAlertId === nextFocusedIncidentAlertId &&
        arePendingIncidentQueueItemsEqual(current.pendingIncidentQueue, nextPendingIncidentQueue)
      ) {
        return current
      }

      return {
        alerts: nextAlerts,
        selectedAlertId: nextSelectedAlertId,
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        pendingIncidentQueue: nextPendingIncidentQueue,
        focusedIncidentPinnedAtMs:
          nextFocusedIncidentAlertId === current.focusedIncidentAlertId
            ? current.focusedIncidentPinnedAtMs
            : nextFocusedIncidentAlertId
              ? current.focusedIncidentPinnedAtMs
              : null,
      }
    })
  },

  dismissCurrentAlerts(cutoffMs = Date.now()) {
    set((current) => {
      const nextFocusedIncidentAlertId = resolveFocusedIncidentAlertId(
        current.focusedIncidentAlertId,
        [],
        current.historyAlerts,
      )

      return {
        alerts: [],
        selectedAlertId: resolveSelectedAlertId(current.selectedAlertId, [], current.historyAlerts),
        focusedIncidentAlertId: nextFocusedIncidentAlertId,
        focusedIncidentPinnedAtMs: nextFocusedIncidentAlertId
          ? current.focusedIncidentPinnedAtMs
          : null,
        pendingIncidentQueue: normalizePendingIncidentQueue(
          current.pendingIncidentQueue,
          [],
          current.historyAlerts,
          nextFocusedIncidentAlertId,
        ),
        dismissedBeforeMs: cutoffMs,
      }
    })
  },

  clearAlerts() {
    set({
      alerts: [],
      historyAlerts: [],
      feedTransport: 'none',
      lastFetchedAt: null,
      selectedAlertId: null,
      focusedIncidentAlertId: null,
      focusedIncidentPinnedAtMs: null,
      pendingIncidentQueue: [],
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
      // Deduplicate by id+type
      const isDuplicate = current.systemMessages.some(
        (m) => m.id === message.id && m.type === message.type,
      )
      if (isDuplicate) return current

      // Prune old messages
      const fresh = current.systemMessages.filter(
        (m) => now - m.receivedAtMs < SYSTEM_MESSAGE_RETENTION_MS,
      )
      fresh.unshift(message)

      return { systemMessages: fresh.slice(0, MAX_SYSTEM_MESSAGES) }
    })
  },

  dismissSystemMessage(id) {
    set((current) => ({
      systemMessages: current.systemMessages.map((m) =>
        m.id === id ? { ...m, dismissed: true } : m,
      ),
    }))
  },

  clearSystemMessages() {
    set({ systemMessages: [], focusedSystemMessageId: null })
  },

  focusIncident(alertId, pinnedAtMs = Date.now()) {
    set((current) => {
      const nextPendingIncidentQueue = current.pendingIncidentQueue.filter(
        (item) => item.alertId !== alertId,
      )

      if (
        current.focusedIncidentAlertId === alertId &&
        current.selectedAlertId === alertId &&
        current.focusedSystemMessageId === null &&
        current.focusedIncidentPinnedAtMs === pinnedAtMs &&
        current.pendingIncidentQueue.length === nextPendingIncidentQueue.length
      ) {
        return current
      }

      return {
        focusedIncidentAlertId: alertId,
        focusedIncidentPinnedAtMs: pinnedAtMs,
        pendingIncidentQueue: nextPendingIncidentQueue,
        selectedAlertId: alertId,
        focusedSystemMessageId: null,
      }
    })
  },

  enqueuePendingIncident(alertId, receivedAtMs) {
    set((current) => {
      if (current.focusedIncidentAlertId === alertId) {
        return current
      }

      const nextPendingIncidentQueue = normalizePendingIncidentQueue(
        [{ alertId, receivedAtMs }, ...current.pendingIncidentQueue],
        current.alerts,
        current.historyAlerts,
        current.focusedIncidentAlertId,
      )

      return nextPendingIncidentQueue.length === current.pendingIncidentQueue.length &&
        nextPendingIncidentQueue.every((item, index) => {
          const currentItem = current.pendingIncidentQueue[index]
          return currentItem?.alertId === item.alertId && currentItem.receivedAtMs === item.receivedAtMs
        })
        ? current
        : { pendingIncidentQueue: nextPendingIncidentQueue }
    })
  },

  promotePendingIncident(alertId) {
    set((current) => {
      const queuedItem = current.pendingIncidentQueue.find((item) => item.alertId === alertId)
      if (!queuedItem && current.focusedIncidentAlertId === alertId) {
        return current
      }

      return {
        focusedIncidentAlertId: alertId,
        focusedIncidentPinnedAtMs: queuedItem?.receivedAtMs ?? Date.now(),
        pendingIncidentQueue: current.pendingIncidentQueue.filter((item) => item.alertId !== alertId),
        selectedAlertId: alertId,
        focusedSystemMessageId: null,
      }
    })
  },

  clearFocusedIncident() {
    set((current) =>
      current.focusedIncidentAlertId === null &&
      current.focusedIncidentPinnedAtMs === null &&
      current.pendingIncidentQueue.length === 0
        ? current
        : {
            focusedIncidentAlertId: null,
            focusedIncidentPinnedAtMs: null,
            pendingIncidentQueue: [],
          },
    )
  },

  requestRevealAlertsPanel() {
    set((current) => ({
      alertsPanelRevealNonce: current.alertsPanelRevealNonce + 1,
    }))
  },

  setFocusedSystemMessageId(id) {
    set((current) => (current.focusedSystemMessageId === id ? current : { focusedSystemMessageId: id, selectedAlertId: id === null ? current.selectedAlertId : null }))
  },

  setFocusCoordinate(coord) {
    set((current) => ({ focusCoordinate: coord, focusTrigger: current.focusTrigger + 1 }))
  },
}))
