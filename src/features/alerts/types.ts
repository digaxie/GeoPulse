export type AlertFeedStatus = 'disconnected' | 'connecting' | 'live' | 'error'
export type AlertFeedTransport = 'none' | 'stream' | 'polling'
export type AlertAudioRole = 'editor' | 'presentation'
export type AlertEventSoundFamily = 'rocket' | 'drone' | 'earlyWarning' | 'incidentEnded'
export type AlertEventSoundDurationMode = 'short' | 'long'

export type ScenarioAlertEventSoundSetting = {
  enabled: boolean
  mode: AlertEventSoundDurationMode
}

export type ScenarioAlertEventSoundSettings = Record<
  AlertEventSoundFamily,
  ScenarioAlertEventSoundSetting
>

export type RocketAlertTypeId = 1 | 2

export type ScenarioAlertSettings = {
  enabled: boolean
  autoZoomEnabled: boolean
  editorSoundEnabled: boolean
  editorVolume: number
  presentationSoundEnabled: boolean
  presentationVolume: number
  bannerAutoDismissSec: number
  sharedSelectedAlertId: string | null
  sharedFocusedSystemMessageKey: string | null
  sharedDrawerSelectionKey: string | null
  eventSounds: ScenarioAlertEventSoundSettings
}

export const DEFAULT_SCENARIO_ALERT_SETTINGS: ScenarioAlertSettings = {
  enabled: false,
  autoZoomEnabled: true,
  editorSoundEnabled: false,
  editorVolume: 0.55,
  presentationSoundEnabled: false,
  presentationVolume: 0.55,
  bannerAutoDismissSec: 15,
  sharedSelectedAlertId: null,
  sharedFocusedSystemMessageKey: null,
  sharedDrawerSelectionKey: null,
  eventSounds: {
    rocket: { enabled: true, mode: 'long' },
    drone: { enabled: true, mode: 'long' },
    earlyWarning: { enabled: true, mode: 'long' },
    incidentEnded: { enabled: false, mode: 'long' },
  },
}

export const MIN_ALERT_RETENTION_MS = 30_000
export const DEFAULT_ALERT_RETENTION_MS = 2 * 60 * 1000
export const MAX_ALERT_RETENTION_MS = 5 * 60 * 1000
export const ALERT_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
export const ALERT_HISTORY_LIMIT = 1000

export interface AlertCityDetail {
  name: string
  lat: number
  lon: number
  zone: string
  countdown: number
}

export interface AlertCityGroup {
  zone: string
  cities: AlertCityDetail[]
}

export type AlertIncidentStreamItem =
  | {
      key: string
      kind: 'alert'
      alertId: string
      receivedAtMs: number
      expiresAtMs: number
    }
  | {
      key: string
      kind: 'system'
      systemMessageKey: string
      receivedAtMs: number
      expiresAtMs: number
    }

export interface RocketAlert {
  id: string
  name: string
  englishName: string
  lat: number
  lon: number
  alertTypeId: RocketAlertTypeId
  countdownSec: number
  areaNameEn: string
  timeStampRaw: string
  occurredAtMs: number
  fetchedAtMs: number
  taCityId: number | null
  /** Her şehrin ayrı koordinatı — haritada ayrı pin için */
  citiesDetail?: AlertCityDetail[]
}

export const ALERT_RECENT_MS = 5 * 60 * 1000

export function getAlertTypeLabel(alertTypeId: RocketAlertTypeId) {
  return alertTypeId === 2 ? 'İHA' : 'Roket'
}

export function getAlertAgeMinutes(alert: Pick<RocketAlert, 'occurredAtMs'>, now = Date.now()) {
  return Math.max(0, Math.floor((now - alert.occurredAtMs) / 60_000))
}

export function isAlertRecent(alert: Pick<RocketAlert, 'occurredAtMs'>, now = Date.now()) {
  return now - alert.occurredAtMs <= ALERT_RECENT_MS
}

export function formatAlertShelterInstruction(countdownSec: number) {
  return countdownSec <= 0
    ? 'Hemen sığınağa gidin!'
    : `${countdownSec} sn içinde sığınağa gidin!`
}

export function formatAlertOccurredAtTr(alert: Pick<RocketAlert, 'occurredAtMs'>) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(alert.occurredAtMs)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'day' | 'month' | 'year' | 'hour' | 'minute' | 'second', string>>

  return `${values.day ?? '00'}.${values.month ?? '00'}.${values.year ?? '0000'} ${values.hour ?? '00'}:${values.minute ?? '00'}:${values.second ?? '00'}`
}

export function formatAlertTimeOnlyTr(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestampMs)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'hour' | 'minute' | 'second', string>>

  return `${values.hour ?? '00'}:${values.minute ?? '00'}:${values.second ?? '00'}`
}

export function isGroupedIncidentAlert(alert: Pick<RocketAlert, 'citiesDetail'> | null | undefined) {
  return (alert?.citiesDetail?.length ?? 0) >= 2
}

export function getAlertCityCount(alert: Pick<RocketAlert, 'citiesDetail'>) {
  return alert.citiesDetail?.length ?? 1
}

export function groupAlertCitiesByZone(
  alert: Pick<RocketAlert, 'citiesDetail' | 'areaNameEn'>,
): AlertCityGroup[] {
  const cities = alert.citiesDetail
  if (!cities || cities.length === 0) {
    return []
  }

  const groups = new Map<string, AlertCityDetail[]>()

  for (const city of cities) {
    const zone = city.zone.trim() || alert.areaNameEn.trim() || 'Bilinmeyen bolge'
    const existing = groups.get(zone)
    if (existing) {
      existing.push(city)
      continue
    }

    groups.set(zone, [city])
  }

  return Array.from(groups.entries()).map(([zone, groupedCities]) => ({
    zone,
    cities: groupedCities,
  }))
}

export function getAlertZoneCount(alert: Pick<RocketAlert, 'citiesDetail' | 'areaNameEn'>) {
  const groups = groupAlertCitiesByZone(alert)
  if (groups.length > 0) {
    return groups.length
  }

  return alert.areaNameEn ? 1 : 0
}

export function getSystemMessageStreamKey(
  message: Pick<TzevaadomSystemMessage, 'id' | 'type' | 'receivedAtMs'>,
) {
  return `${message.id}:${message.type}:${message.receivedAtMs}`
}

export function isIncidentStreamSystemMessage(
  message: Pick<TzevaadomSystemMessage, 'type'> | null | undefined,
) {
  return message?.type === 'incident_ended' || message?.type === 'early_warning'
}

export function getAlertAudioSettingsForRole(
  settings: ScenarioAlertSettings,
  role: AlertAudioRole,
) {
  if (role === 'editor') {
    return {
      soundEnabled: settings.editorSoundEnabled,
      volume: settings.editorVolume,
    }
  }

  return {
    soundEnabled: settings.presentationSoundEnabled,
    volume: settings.presentationVolume,
  }
}

// ---------- Timeline ----------

import type { TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

export type AlertIncidentDockItem =
  | {
      key: string
      kind: 'alert'
      receivedAtMs: number
      expiresAtMs: number | null
      isLive: boolean
      alert: RocketAlert
    }
  | {
      key: string
      kind: 'system'
      receivedAtMs: number
      expiresAtMs: number | null
      isLive: boolean
      message: TzevaadomSystemMessage
    }

export type TimelineItem =
  | { kind: 'alert'; alert: RocketAlert; timestampMs: number; isActive: boolean }
  | { kind: 'system'; message: TzevaadomSystemMessage; timestampMs: number }

export function formatTimelineDualTime(timestampMs: number, now: number): string {
  const ageMin = Math.max(0, Math.floor((now - timestampMs) / 60_000))
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestampMs)
  const v = Object.fromEntries(
    parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>
  return `${ageMin} dk önce | ${v.day}.${v.month}.${v.year} (${v.hour}:${v.minute})`
}

export function getTimelineItemColor(item: TimelineItem): 'red' | 'green' | 'orange' | 'blue' {
  if (item.kind === 'alert') return 'red'
  switch (item.message.type) {
    case 'incident_ended':
      return 'green'
    case 'early_warning':
      return 'orange'
    default:
      return 'blue'
  }
}

export function getTimelineItemIcon(item: TimelineItem): string {
  if (item.kind === 'alert') {
    return item.alert.alertTypeId === 2 ? '\uD83D\uDEE9' : '\uD83D\uDE80'
  }
  switch (item.message.type) {
    case 'incident_ended':
      return '\u2705'
    case 'early_warning':
      return '\u26A0\uFE0F'
    default:
      return '\u2139\uFE0F'
  }
}

export function getAlertSirenThrottleWindowMs(sirenDurationMs: number | null | undefined) {
  const normalizedDuration =
    typeof sirenDurationMs === 'number' && Number.isFinite(sirenDurationMs) && sirenDurationMs > 0
      ? Math.round(sirenDurationMs)
      : 0

  return Math.max(normalizedDuration, 1000)
}
