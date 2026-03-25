import { create } from 'zustand'

import {
  ALERT_HISTORY_LIMIT,
  ALERT_HISTORY_WINDOW_MS,
  DEFAULT_ALERT_RETENTION_MS,
  MAX_ALERT_RETENTION_MS,
  MIN_ALERT_RETENTION_MS,
  type AlertFeedStatus,
  type AlertFeedTransport,
  type RocketAlert,
} from '@/features/alerts/types'
import type { TzevaadomConnectionStatus, TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

const MAX_SYSTEM_MESSAGES = 20
const SYSTEM_MESSAGE_RETENTION_MS = 30 * 60 * 1000 // 30 min

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
  setAlerts: (alerts: RocketAlert[], fetchedAt?: number | null) => void
  setHistoryAlerts: (alerts: RocketAlert[], now?: number) => void
  mergeHistoryAlerts: (alerts: RocketAlert[], now?: number) => void
  pruneHistoryAlerts: (now?: number) => void
  setFeedStatus: (status: AlertFeedStatus) => void
  setFeedTransport: (transport: AlertFeedTransport) => void
  setSelectedAlertId: (alertId: string | null) => void
  setRetentionMs: (retentionMs: number) => void
  dismissCurrentAlerts: (cutoffMs?: number) => void
  clearAlerts: () => void
  setTzevaadomStatus: (status: TzevaadomConnectionStatus) => void
  addSystemMessage: (message: TzevaadomSystemMessage) => void
  dismissSystemMessage: (id: number) => void
  clearSystemMessages: () => void
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

  setAlerts(alerts, fetchedAt = null) {
    set((current) => {
      const dismissedBeforeMs = current.dismissedBeforeMs
      const visibleAlerts =
        dismissedBeforeMs === null
          ? alerts
          : alerts.filter((alert) => alert.occurredAtMs > dismissedBeforeMs)
      const nextSelectedAlertId = resolveSelectedAlertId(
        current.selectedAlertId,
        visibleAlerts,
        current.historyAlerts,
      )
      const nextLastFetchedAt = fetchedAt ?? current.lastFetchedAt
      const sameAlerts = areAlertsEqual(current.alerts, visibleAlerts)

      if (
        sameAlerts &&
        current.lastFetchedAt === nextLastFetchedAt &&
        current.selectedAlertId === nextSelectedAlertId
      ) {
        return current
      }

      return {
        alerts: sameAlerts ? current.alerts : visibleAlerts,
        lastFetchedAt: nextLastFetchedAt,
        selectedAlertId: nextSelectedAlertId,
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

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.selectedAlertId === nextSelectedAlertId
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        selectedAlertId: nextSelectedAlertId,
      }
    })
  },

  mergeHistoryAlerts(alerts, now = Date.now()) {
    set((current) => {
      const nextHistoryAlerts = normalizeHistoryAlerts([...current.historyAlerts, ...alerts], now)
      if (areAlertsEqual(current.historyAlerts, nextHistoryAlerts)) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
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

      if (
        areAlertsEqual(current.historyAlerts, nextHistoryAlerts) &&
        current.selectedAlertId === nextSelectedAlertId
      ) {
        return current
      }

      return {
        historyAlerts: nextHistoryAlerts,
        selectedAlertId: nextSelectedAlertId,
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
    set((current) => (current.retentionMs === nextRetentionMs ? current : { retentionMs: nextRetentionMs }))
  },

  dismissCurrentAlerts(cutoffMs = Date.now()) {
    set((current) => ({
      alerts: [],
      selectedAlertId: resolveSelectedAlertId(current.selectedAlertId, [], current.historyAlerts),
      dismissedBeforeMs: cutoffMs,
    }))
  },

  clearAlerts() {
    set({
      alerts: [],
      historyAlerts: [],
      feedTransport: 'none',
      lastFetchedAt: null,
      selectedAlertId: null,
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
      systemMessages: current.systemMessages.filter((m) => m.id !== id),
    }))
  },

  clearSystemMessages() {
    set({ systemMessages: [] })
  },
}))
