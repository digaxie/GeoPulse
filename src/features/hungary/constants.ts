import type { HungaryCheckpoint, HungaryMapMode } from './types'

export const HUNGARY_OFFICIAL_DATA_BASE_URL = 'https://vtr.valasztas.hu/ogy2026/data'
export const HUNGARY_PROXY_ENDPOINT = '/api/hungary-proxy'
export const HUNGARY_CONFIG_POLL_MS = 30_000
export const HUNGARY_TURNOUT_POLL_MS = 120_000
export const HUNGARY_RESULTS_POLL_MS = 60_000
export const HUNGARY_FETCH_TIMEOUT_MS = 12_000
export const HUNGARY_TOTAL_CONSTITUENCIES = 106
export const HUNGARY_TOTAL_PARLIAMENT_SEATS = 199
export const HUNGARY_LIST_SEATS = 93
export const HUNGARY_CHECKPOINT_TOOLTIP =
  'Resmi NVI katilim bildirimi. Bu saatler sandik gunu icin referans kontrol noktalaridir.'

const FALLBACK_CHECKPOINTS: Array<[string, string, string]> = [
  ['1', '07:00', '08:00'],
  ['2', '09:00', '10:00'],
  ['3', '11:00', '12:00'],
  ['4', '13:00', '14:00'],
  ['5', '15:00', '16:00'],
  ['6', '17:30', '18:30'],
]

const INTEGER_FORMATTER = new Intl.NumberFormat('tr-TR')
const COMPACT_FORMATTER = new Intl.NumberFormat('tr-TR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

function normalizePartyKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

const PARTY_COLOR_RULES: Array<{ pattern: RegExp; color: string }> = [
  { pattern: /\bFIDESZ\b|\bKDNP\b/u, color: '#f28c28' },
  { pattern: /\bTISZA\b/u, color: '#0f8f87' },
  { pattern: /\bMI HAZANK\b/u, color: '#1f7a4d' },
  { pattern: /\bDK\b|DEMOKRATIKUS/u, color: '#1f5fd1' },
  { pattern: /\bMKKP\b|\bKETFARKU\b/u, color: '#7d8396' },
  { pattern: /\bJOBBIK\b/u, color: '#6f42c1' },
  { pattern: /\bMOMENTUM\b/u, color: '#4f6cff' },
  { pattern: /\bMSZP\b|\bPARBESZED\b|\bLMP\b/u, color: '#d9485f' },
  { pattern: /\bTEA\b/u, color: '#8b5e3c' },
  { pattern: /\bBULGAR\b|\bUKRAN\b|\bROMA\b|\bNEMZETI\b|\bORSZAGOS\b/u, color: '#80724f' },
]

const HASH_FALLBACK_COLORS = ['#0f8f87', '#c73d52', '#5f7adb', '#2f8f62', '#c78d2b', '#7b5bc4']

export const HUNGARY_MAP_MODE_LABELS: Record<HungaryMapMode, string> = {
  turnout: 'Katilim',
  previous: '2022',
  results: 'Canli Sonuc',
}

export const HUNGARY_FLAG_COLORS = {
  red: '#d9485f',
  white: '#f6f3ef',
  green: '#1f7a4d',
  ink: '#101f39',
}

export function buildHungaryCheckpointList(
  entries: Array<{ code: string; label: string }> | null,
): HungaryCheckpoint[] {
  if (entries && entries.length > 0) {
    return entries
      .slice()
      .sort((left, right) => Number(left.code) - Number(right.code))
      .map((entry) => {
        const fallback = FALLBACK_CHECKPOINTS.find(([code]) => code === entry.code)

        return {
          code: entry.code,
          label: entry.label,
          budapestTime: entry.label,
          istanbulTime: fallback?.[2] ?? entry.label,
          tooltip: HUNGARY_CHECKPOINT_TOOLTIP,
        }
      })
  }

  return FALLBACK_CHECKPOINTS.map(([code, budapestTime, istanbulTime]) => ({
    code,
    label: budapestTime,
    budapestTime,
    istanbulTime,
    tooltip: HUNGARY_CHECKPOINT_TOOLTIP,
  }))
}

export function formatHungaryInteger(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return INTEGER_FORMATTER.format(Math.round(value))
}

export function formatHungaryCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return COMPACT_FORMATTER.format(value)
}

export function formatHungaryPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--'
  }

  return `%${value.toFixed(digits)}`
}

export function formatHungaryThreshold(thresholdPct: number | null) {
  if (thresholdPct === null) {
    return 'Tercihli kota'
  }

  return `%${thresholdPct}`
}

export function formatHungaryTimestamp(
  value: string | null | undefined,
  timeZone: 'Europe/Budapest' | 'Europe/Istanbul' = 'Europe/Budapest',
) {
  if (!value) {
    return '--'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(parsed)
}

export function getHungaryAllianceColor(value: string | null | undefined) {
  if (!value) {
    return '#7d8799'
  }

  const normalized = normalizePartyKey(value)

  for (const rule of PARTY_COLOR_RULES) {
    if (rule.pattern.test(normalized)) {
      return rule.color
    }
  }

  let hash = 0
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return HASH_FALLBACK_COLORS[hash % HASH_FALLBACK_COLORS.length]
}

export function getHungaryTurnoutColor(turnoutPct: number | null | undefined) {
  if (turnoutPct === null || turnoutPct === undefined || Number.isNaN(turnoutPct)) {
    return 'rgba(176, 186, 202, 0.38)'
  }

  if (turnoutPct >= 60) {
    return '#1f7a4d'
  }

  if (turnoutPct >= 45) {
    return '#6aa764'
  }

  if (turnoutPct >= 30) {
    return '#d7ddd6'
  }

  if (turnoutPct >= 18) {
    return '#f0b7b7'
  }

  return '#d9485f'
}

export function formatHungarySourceMode(sourceMode: 'direct' | 'proxy') {
  return sourceMode === 'direct' ? 'Dogrudan NVI' : 'Proxy uzerinden NVI'
}
