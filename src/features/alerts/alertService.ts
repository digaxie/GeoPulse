import {
  ALERT_HISTORY_LIMIT,
  ALERT_HISTORY_WINDOW_MS,
  DEFAULT_ALERT_RETENTION_MS,
  type AlertFeedStatus,
  type AlertFeedTransport,
  type RocketAlert,
  type RocketAlertTypeId,
} from '@/features/alerts/types'

const ALERTS_SNAPSHOT_URL = 'https://agg.rocketalert.live/api/v2/alerts/real-time/cached'
const ALERTS_STREAM_URL = 'https://agg.rocketalert.live/api/v2/alerts/real-time'
const ALERTS_HISTORY_URL = 'https://agg.rocketalert.live/api/v1/alerts/details'
const ALERT_FALLBACK_POLL_INTERVAL_MS = 15_000
const ALERT_STREAM_RETRY_MS = 3_000
const ALERT_STREAM_UPGRADE_INTERVAL_MS = 60_000
const ALERT_STREAM_OPEN_TIMEOUT_MS = 10_000
const MAX_VISIBLE_STREAM_FAILURES = 3
const ROCKET_ALERT_TIME_ZONE = 'Asia/Jerusalem'

type RawAlert = {
  name?: unknown
  englishName?: unknown
  lat?: unknown
  lon?: unknown
  taCityId?: unknown
  alertTypeId?: unknown
  countdownSec?: unknown
  areaNameEn?: unknown
  timeStamp?: unknown
}

type RawAlertGroup = {
  alerts?: unknown
}

type RawAlertsResponse = {
  success?: unknown
  error?: unknown
  payload?: unknown
}

type RawRealtimeAlertsEvent = {
  alerts?: unknown
}

export type AlertUpdateReason = 'snapshot' | 'stream' | 'polling' | 'resync' | 'expiry'

export type AlertUpdateContext = {
  fetchedAtMs: number | null
  reason: AlertUpdateReason
  newAlerts: RocketAlert[]
}

type AlertEventSource = Pick<EventSource, 'close' | 'onerror' | 'onmessage' | 'onopen'>

function isAlertTypeId(value: unknown): value is RocketAlertTypeId {
  return value === 1 || value === 2
}

function getZonedOffsetMs(timeZone: string, date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return (
    Date.UTC(
      Number.parseInt(values.year ?? '0', 10),
      Number.parseInt(values.month ?? '1', 10) - 1,
      Number.parseInt(values.day ?? '1', 10),
      Number.parseInt(values.hour ?? '0', 10),
      Number.parseInt(values.minute ?? '0', 10),
      Number.parseInt(values.second ?? '0', 10),
    ) - date.getTime()
  )
}

function formatJerusalemApiDateTime(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROCKET_ALERT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second', string>>

  return `${values.year ?? '0000'}-${values.month ?? '00'}-${values.day ?? '00'} ${values.hour ?? '00'}:${values.minute ?? '00'}:${values.second ?? '00'}`
}

export function buildAlertHistoryQueryWindow(nowMs = Date.now()) {
  const toDate = new Date(nowMs)
  const fromDate = new Date(nowMs - ALERT_HISTORY_WINDOW_MS)

  return {
    from: formatJerusalemApiDateTime(fromDate),
    to: formatJerusalemApiDateTime(toDate),
    alertTypeId: '0',
  }
}

export function parseRocketAlertTimestamp(timeStampRaw: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(timeStampRaw)
  if (!match) {
    return null
  }

  const [, year, month, day, hour, minute, second] = match
  const utcGuess = Date.UTC(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    Number.parseInt(hour, 10),
    Number.parseInt(minute, 10),
    Number.parseInt(second, 10),
  )
  const firstOffset = getZonedOffsetMs(ROCKET_ALERT_TIME_ZONE, new Date(utcGuess))
  const firstResult = utcGuess - firstOffset
  const secondOffset = getZonedOffsetMs(ROCKET_ALERT_TIME_ZONE, new Date(firstResult))
  return utcGuess - secondOffset
}

function toStableAlertId(input: {
  englishName: string
  timeStampRaw: string
  alertTypeId: RocketAlertTypeId
  lat: number
  lon: number
  countdownSec: number
  taCityId: number | null
}) {
  return [
    input.englishName,
    input.timeStampRaw,
    input.alertTypeId,
    input.lat,
    input.lon,
    input.countdownSec,
    input.taCityId ?? 'na',
  ].join(':')
}

export function normalizeRocketAlert(raw: RawAlert, fetchedAtMs: number): RocketAlert | null {
  if (
    typeof raw.name !== 'string' ||
    typeof raw.englishName !== 'string' ||
    typeof raw.lat !== 'number' ||
    typeof raw.lon !== 'number' ||
    !isAlertTypeId(raw.alertTypeId) ||
    typeof raw.timeStamp !== 'string'
  ) {
    return null
  }

  const taCityId = typeof raw.taCityId === 'number' ? raw.taCityId : null
  const countdownSec = typeof raw.countdownSec === 'number' ? raw.countdownSec : 0
  const areaNameEn = typeof raw.areaNameEn === 'string' ? raw.areaNameEn : ''
  const parsedOccurredAtMs = parseRocketAlertTimestamp(raw.timeStamp) ?? fetchedAtMs
  const occurredAtMs = Math.min(parsedOccurredAtMs, fetchedAtMs)

  return {
    id: toStableAlertId({
      englishName: raw.englishName,
      timeStampRaw: raw.timeStamp,
      alertTypeId: raw.alertTypeId,
      lat: raw.lat,
      lon: raw.lon,
      countdownSec,
      taCityId,
    }),
    name: raw.name,
    englishName: raw.englishName,
    lat: raw.lat,
    lon: raw.lon,
    alertTypeId: raw.alertTypeId,
    countdownSec,
    areaNameEn,
    timeStampRaw: raw.timeStamp,
    occurredAtMs,
    fetchedAtMs,
    taCityId,
  }
}

function filterAlertsByMaxAge(alerts: RocketAlert[], now: number, maxAgeMs: number | null) {
  return alerts.filter((alert) => {
    if (alert.occurredAtMs > now) {
      return false
    }

    if (maxAgeMs === null) {
      return true
    }

    return now - alert.occurredAtMs <= maxAgeMs
  })
}

function normalizeRawAlerts(
  rawAlerts: unknown,
  fetchedAtMs: number,
  now = fetchedAtMs,
  maxAgeMs: number | null = DEFAULT_ALERT_RETENTION_MS,
) {
  if (!Array.isArray(rawAlerts)) {
    throw new Error('Alert payload gecersiz.')
  }

  return filterAlertsByMaxAge(
    rawAlerts
      .map((alert) => normalizeRocketAlert(alert as RawAlert, fetchedAtMs))
      .filter((alert): alert is RocketAlert => alert !== null),
    now,
    maxAgeMs,
  )
}

export function flattenAlertPayload(
  payload: unknown,
  fetchedAtMs: number,
  now = fetchedAtMs,
  maxAgeMs: number | null = DEFAULT_ALERT_RETENTION_MS,
) {
  if (!Array.isArray(payload)) {
    throw new Error('Alert payload gecersiz.')
  }

  return payload.flatMap((group) => {
    const alerts = (group as RawAlertGroup)?.alerts
    if (!Array.isArray(alerts)) {
      return []
    }

    return normalizeRawAlerts(alerts, fetchedAtMs, now, maxAgeMs)
  })
}

export function parseRealtimeAlertEventData(
  data: string,
  fetchedAtMs: number,
  now = fetchedAtMs,
  retentionMs = DEFAULT_ALERT_RETENTION_MS,
) {
  const body = JSON.parse(data) as RawRealtimeAlertsEvent
  if (!body || !Array.isArray(body.alerts)) {
    throw new Error('Realtime alert payload gecersiz.')
  }

  const firstAlert = body.alerts[0] as RawAlert | undefined
  if (firstAlert?.name === 'KEEP_ALIVE') {
    return []
  }

  return normalizeRawAlerts(body.alerts, fetchedAtMs, now, retentionMs)
}

export function sortAlerts(alerts: RocketAlert[]) {
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
      leftAlert.fetchedAtMs !== rightAlert.fetchedAtMs
    ) {
      return false
    }
  }

  return true
}

export function mergeAlerts(
  existingAlerts: RocketAlert[],
  incomingAlerts: RocketAlert[],
  now = Date.now(),
  retentionMs = DEFAULT_ALERT_RETENTION_MS,
) {
  const merged = new Map<string, RocketAlert>()

  for (const alert of existingAlerts) {
    if (now - alert.occurredAtMs <= retentionMs && alert.occurredAtMs <= now) {
      merged.set(alert.id, alert)
    }
  }

  for (const alert of incomingAlerts) {
    if (now - alert.occurredAtMs > retentionMs || alert.occurredAtMs > now) {
      continue
    }

    if (!merged.has(alert.id)) {
      merged.set(alert.id, alert)
    }
  }

  return sortAlerts(Array.from(merged.values()))
}

export function mergeAlertHistory(
  existingAlerts: RocketAlert[],
  incomingAlerts: RocketAlert[],
  now = Date.now(),
  maxAgeMs = ALERT_HISTORY_WINDOW_MS,
  limit = ALERT_HISTORY_LIMIT,
) {
  const merged = new Map<string, RocketAlert>()

  for (const alert of existingAlerts) {
    if (now - alert.occurredAtMs <= maxAgeMs && alert.occurredAtMs <= now) {
      merged.set(alert.id, alert)
    }
  }

  for (const alert of incomingAlerts) {
    if (now - alert.occurredAtMs > maxAgeMs || alert.occurredAtMs > now) {
      continue
    }

    merged.set(alert.id, alert)
  }

  return sortAlerts(Array.from(merged.values())).slice(0, limit)
}

export async function fetchRocketAlerts(
  signal?: AbortSignal,
  retentionMs = DEFAULT_ALERT_RETENTION_MS,
  fetchImpl: typeof fetch = fetch,
) {
  const response = await fetchImpl(ALERTS_SNAPSHOT_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    signal,
  })

  if (!response.ok) {
    throw new Error(`Alert feed ${response.status} ile dondu.`)
  }

  const body = (await response.json()) as RawAlertsResponse
  if (body.success !== true) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Alert feed hatasi.')
  }

  const fetchedAtMs = Date.now()
  return {
    fetchedAtMs,
    alerts: flattenAlertPayload(body.payload, fetchedAtMs, fetchedAtMs, retentionMs),
  }
}

export async function fetchRocketAlertHistory(
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
) {
  const timeoutController = new AbortController()
  const timeoutId = setTimeout(() => timeoutController.abort(), 8_000)
  const combinedSignal = signal
    ? AbortSignal.any([signal, timeoutController.signal])
    : timeoutController.signal

  try {
    const query = new URLSearchParams(buildAlertHistoryQueryWindow(nowMs))
    const response = await fetchImpl(`${ALERTS_HISTORY_URL}?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      signal: combinedSignal,
    })

    if (!response.ok) {
      throw new Error(`Alert history ${response.status} ile dondu.`)
    }

    const body = (await response.json()) as RawAlertsResponse
    if (body.success !== true) {
      throw new Error(typeof body.error === 'string' ? body.error : 'Alert history hatasi.')
    }

    const fetchedAtMs = Date.now()
    return {
      fetchedAtMs,
      alerts: mergeAlertHistory(
        [],
        flattenAlertPayload(body.payload, fetchedAtMs, fetchedAtMs, ALERT_HISTORY_WINDOW_MS),
        fetchedAtMs,
      ),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export function createAlertFeed(options: {
  retentionMs?: number
  onAlerts: (alerts: RocketAlert[], context: AlertUpdateContext) => void
  onStatusChange: (status: AlertFeedStatus) => void
  onTransportChange: (transport: AlertFeedTransport) => void
  eventSourceFactory?: (url: string) => AlertEventSource
  fetchImpl?: typeof fetch
  visibilityDocument?: Document
}) {
  const retentionMs = options.retentionMs ?? DEFAULT_ALERT_RETENTION_MS
  const eventSourceFactory = options.eventSourceFactory ?? ((url: string) => new EventSource(url))
  const fetchImpl = options.fetchImpl ?? fetch
  const visibilityDocument = options.visibilityDocument ?? document

  let running = false
  let currentAlerts: RocketAlert[] = []
  let currentTransport: AlertFeedTransport = 'none'
  let stream: AlertEventSource | null = null
  let fetchController: AbortController | null = null
  let reconnectTimerId: number | null = null
  let fallbackPollTimerId: number | null = null
  let fallbackUpgradeTimerId: number | null = null
  let streamOpenTimeoutId: number | null = null
  let expiryTimerId: number | null = null
  let visibilityResyncTimerId: number | null = null
  let visibleStreamFailures = 0
  let fallbackActive = false

  const clearTimer = (timerId: number | null) => {
    if (timerId !== null) {
      window.clearTimeout(timerId)
    }
  }

  const setTransport = (transport: AlertFeedTransport) => {
    if (currentTransport === transport) {
      return
    }

    currentTransport = transport
    options.onTransportChange(transport)
  }

  const scheduleExpiryCheck = () => {
    clearTimer(expiryTimerId)
    expiryTimerId = null

    if (!running || currentAlerts.length === 0) {
      return
    }

    const now = Date.now()
    const nextExpiryAtMs = Math.min(...currentAlerts.map((alert) => alert.occurredAtMs + retentionMs))
    const delayMs = Math.max(0, nextExpiryAtMs - now)
    expiryTimerId = window.setTimeout(() => {
      if (!running) {
        return
      }

      const nextAlerts = filterAlertsByMaxAge(currentAlerts, Date.now(), retentionMs)
      if (!areAlertsEqual(currentAlerts, nextAlerts)) {
        currentAlerts = nextAlerts
        scheduleExpiryCheck()
        options.onAlerts(currentAlerts, {
          fetchedAtMs: null,
          reason: 'expiry',
          newAlerts: [],
        })
        return
      }

      scheduleExpiryCheck()
    }, delayMs)
  }

  const pushAlerts = (
    nextAlerts: RocketAlert[],
    fetchedAtMs: number | null,
    reason: AlertUpdateReason,
  ) => {
    const previousAlerts = currentAlerts
    const previousIds = new Set(previousAlerts.map((alert) => alert.id))
    const newAlerts = nextAlerts.filter((alert) => !previousIds.has(alert.id))
    const alertsChanged = !areAlertsEqual(previousAlerts, nextAlerts)

    currentAlerts = nextAlerts
    scheduleExpiryCheck()

    if (!alertsChanged && fetchedAtMs === null) {
      return
    }

    options.onAlerts(currentAlerts, {
      fetchedAtMs,
      reason,
      newAlerts,
    })
  }

  const mergeIncomingAlerts = (
    incomingAlerts: RocketAlert[],
    fetchedAtMs: number,
    reason: Exclude<AlertUpdateReason, 'expiry'>,
  ) => {
    const nextAlerts = mergeAlerts(currentAlerts, incomingAlerts, fetchedAtMs, retentionMs)
    pushAlerts(nextAlerts, fetchedAtMs, reason)
  }

  const clearReconnectTimer = () => {
    clearTimer(reconnectTimerId)
    reconnectTimerId = null
  }

  const clearFallbackTimers = () => {
    clearTimer(fallbackPollTimerId)
    fallbackPollTimerId = null
    clearTimer(fallbackUpgradeTimerId)
    fallbackUpgradeTimerId = null
  }

  const clearStreamOpenTimeout = () => {
    clearTimer(streamOpenTimeoutId)
    streamOpenTimeoutId = null
  }

  const closeStream = () => {
    if (!stream) {
      return
    }

    stream.onopen = null
    stream.onmessage = null
    stream.onerror = null
    stream.close()
    stream = null
    clearStreamOpenTimeout()
  }

  const stopFallbackPolling = () => {
    fallbackActive = false
    clearFallbackTimers()
  }

  const executeSnapshotFetch = async (reason: 'snapshot' | 'resync' | 'polling') => {
    fetchController?.abort()
    fetchController = new AbortController()

    const result = await fetchRocketAlerts(fetchController.signal, retentionMs, fetchImpl)
    mergeIncomingAlerts(result.alerts, result.fetchedAtMs, reason)
    return result
  }

  const scheduleStreamReconnect = (delayMs: number, markConnecting: boolean) => {
    clearReconnectTimer()
    reconnectTimerId = window.setTimeout(() => {
      reconnectTimerId = null
      if (!running || fallbackActive) {
        return
      }

      openStream(markConnecting, false)
    }, delayMs)
  }

  const scheduleFallbackPoll = () => {
    clearTimer(fallbackPollTimerId)
    fallbackPollTimerId = window.setTimeout(() => {
      fallbackPollTimerId = null
      void runFallbackPoll()
    }, ALERT_FALLBACK_POLL_INTERVAL_MS)
  }

  const scheduleFallbackUpgrade = () => {
    clearTimer(fallbackUpgradeTimerId)
    fallbackUpgradeTimerId = window.setTimeout(() => {
      fallbackUpgradeTimerId = null
      if (!running || !fallbackActive) {
        return
      }

      openStream(false, true)
    }, ALERT_STREAM_UPGRADE_INTERVAL_MS)
  }

  const runFallbackPoll = async () => {
    if (!running || !fallbackActive) {
      return
    }

    try {
      const result = await executeSnapshotFetch('polling')
      options.onStatusChange('live')
      setTransport('polling')
      scheduleFallbackPoll()
      return result
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        options.onStatusChange('error')
        scheduleFallbackPoll()
      }

      return null
    }
  }

  const startFallbackPolling = () => {
    if (!running) {
      return
    }

    closeStream()
    fallbackActive = true
    setTransport('polling')
    void runFallbackPoll()
    scheduleFallbackUpgrade()
  }

  const handleStreamFailure = (upgradeAttempt: boolean) => {
    closeStream()
    if (!running) {
      return
    }

    if (upgradeAttempt) {
      scheduleFallbackUpgrade()
      return
    }

    options.onStatusChange('error')

    if (visibilityDocument.hidden) {
      scheduleStreamReconnect(ALERT_FALLBACK_POLL_INTERVAL_MS, false)
      return
    }

    visibleStreamFailures += 1
    if (visibleStreamFailures >= MAX_VISIBLE_STREAM_FAILURES) {
      startFallbackPolling()
      return
    }

    scheduleStreamReconnect(ALERT_STREAM_RETRY_MS, true)
  }

  const openStream = (markConnecting: boolean, upgradeAttempt: boolean) => {
    if (!running) {
      return
    }

    closeStream()
    clearReconnectTimer()

    if (markConnecting && !fallbackActive) {
      options.onStatusChange('connecting')
      setTransport('none')
    }

    const nextStream = eventSourceFactory(ALERTS_STREAM_URL)
    stream = nextStream
    streamOpenTimeoutId = window.setTimeout(() => {
      handleStreamFailure(upgradeAttempt)
    }, ALERT_STREAM_OPEN_TIMEOUT_MS)

    nextStream.onopen = () => {
      clearStreamOpenTimeout()
      if (!running) {
        return
      }

      visibleStreamFailures = 0
      stopFallbackPolling()
      setTransport('stream')
      options.onStatusChange('live')
    }

    nextStream.onmessage = (event) => {
      const fetchedAtMs = Date.now()

      try {
        const alerts = parseRealtimeAlertEventData(event.data, fetchedAtMs, fetchedAtMs, retentionMs)
        if (alerts.length === 0) {
          return
        }

        mergeIncomingAlerts(alerts, fetchedAtMs, 'stream')
        options.onStatusChange('live')
      } catch {
        options.onStatusChange('error')
      }
    }

    nextStream.onerror = () => {
      handleStreamFailure(upgradeAttempt)
    }
  }

  const handleVisibilityChange = () => {
    if (!running || visibilityDocument.hidden) {
      return
    }

    clearTimer(visibilityResyncTimerId)
    visibilityResyncTimerId = window.setTimeout(() => {
      visibilityResyncTimerId = null

      void executeSnapshotFetch('resync')
        .then(() => {
          if (currentTransport === 'stream' || currentTransport === 'polling') {
            options.onStatusChange('live')
          }
        })
        .catch((error) => {
          if ((error as Error).name !== 'AbortError') {
            options.onStatusChange('error')
          }
        })

      if (fallbackActive) {
        openStream(false, true)
        return
      }

      if (!stream) {
        visibleStreamFailures = 0
        openStream(true, false)
      }
    }, 300)
  }

  return {
    start() {
      if (running) {
        return
      }

      running = true
      visibilityDocument.addEventListener('visibilitychange', handleVisibilityChange)
      options.onStatusChange('connecting')
      setTransport('none')

      void executeSnapshotFetch('snapshot').catch((error) => {
        if ((error as Error).name !== 'AbortError') {
          options.onStatusChange('error')
        }
      })

      openStream(true, false)
    },

    stop() {
      running = false
      fetchController?.abort()
      fetchController = null
      clearReconnectTimer()
      clearFallbackTimers()
      clearStreamOpenTimeout()
      clearTimer(expiryTimerId)
      expiryTimerId = null
      clearTimer(visibilityResyncTimerId)
      visibilityResyncTimerId = null
      closeStream()
      stopFallbackPolling()
      visibilityDocument.removeEventListener('visibilitychange', handleVisibilityChange)
    },
  }
}
