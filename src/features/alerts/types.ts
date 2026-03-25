export type AlertFeedStatus = 'disconnected' | 'connecting' | 'live' | 'error'
export type AlertFeedTransport = 'none' | 'stream' | 'polling'
export type AlertAudioRole = 'editor' | 'presentation'

export type RocketAlertTypeId = 1 | 2

export type ScenarioAlertSettings = {
  enabled: boolean
  autoZoomEnabled: boolean
  editorSoundEnabled: boolean
  editorVolume: number
  presentationSoundEnabled: boolean
  presentationVolume: number
  bannerAutoDismissSec: number
}

export const DEFAULT_SCENARIO_ALERT_SETTINGS: ScenarioAlertSettings = {
  enabled: false,
  autoZoomEnabled: true,
  editorSoundEnabled: false,
  editorVolume: 0.55,
  presentationSoundEnabled: false,
  presentationVolume: 0.55,
  bannerAutoDismissSec: 15,
}

export const MIN_ALERT_RETENTION_MS = 30_000
export const DEFAULT_ALERT_RETENTION_MS = 2 * 60 * 1000
export const MAX_ALERT_RETENTION_MS = 5 * 60 * 1000
export const ALERT_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000
export const ALERT_HISTORY_LIMIT = 250

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

export function getAlertSirenThrottleWindowMs(sirenDurationMs: number | null | undefined) {
  const normalizedDuration =
    typeof sirenDurationMs === 'number' && Number.isFinite(sirenDurationMs) && sirenDurationMs > 0
      ? Math.round(sirenDurationMs)
      : 0

  return Math.max(normalizedDuration, 1000)
}
