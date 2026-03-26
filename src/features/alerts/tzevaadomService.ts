/**
 * Tzeva Adom WebSocket Client
 *
 * Local relay server (ws://localhost:3001) üzerinden Tzeva Adom'a bağlanır.
 * ALERT ve SYSTEM_MESSAGE tiplerini parse eder.
 */

// ---------- Types ----------

export type TzevaadomThreatId = 0 | 2 | 5 | 7

export interface EnrichedCity {
  he: string
  en: string
  lat: number | null
  lng: number | null
  zone_en: string
  countdown: number
}

export interface TzevaadomAlert {
  notificationId: string
  time: number
  threat: TzevaadomThreatId
  isDrill: boolean
  cities: string[]
  citiesEnriched?: EnrichedCity[]
}

export type SystemMessageType = 'early_warning' | 'incident_ended' | 'alert' | 'unknown'

export interface TzevaadomSystemMessage {
  id: number
  time: string
  type: SystemMessageType
  titleEn: string
  titleHe: string
  bodyEn: string
  bodyHe: string
  bodyAr: string
  receivedAtMs: number
  /** Banner'dan kapatıldı — listede kalır ama banner'da gözükmez */
  dismissed?: boolean
  /** Zenginleştirilmiş şehir verileri (early_warning/incident_ended için) */
  citiesEnriched?: EnrichedCity[]
}

export type TzevaadomConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

// ---------- Constants ----------

const EARLY_WARNING_KEYWORDS_HE = [
  'בדקות הקרובות',
  'צפויות להתקבל התרעות',
  'ייתכן ויופעלו התרעות',
  'זיהוי שיגורים',
  'שיגורים לעבר ישראל',
  'בעקבות זיהוי שיגורים',
]

const EARLY_WARNING_KEYWORDS_EN = [
  'early warning',
  'missile launches',
  'alerts may be activated',
  'in the coming minutes',
]

const INCIDENT_ENDED_KEYWORDS_HE = [
  'האירוע הסתיים',
  'הסתיים באזורים',
  'האירוע הסתיים באזורים',
]

const INCIDENT_ENDED_KEYWORDS_EN = [
  'incident ended',
  'incident has ended',
]

const THREAT_LABELS: Record<TzevaadomThreatId, string> = {
  0: 'Roket/Füze',
  2: 'Terörist Sızma',
  5: 'Düşman Hava Aracı',
  7: 'Non-Conventional Füze',
}

export function getThreatLabel(threatId: TzevaadomThreatId): string {
  return THREAT_LABELS[threatId] ?? `Bilinmeyen (${threatId})`
}

function normalizeAlertCityTokens(alert: Pick<TzevaadomAlert, 'cities' | 'citiesEnriched'>) {
  const enriched = alert.citiesEnriched ?? []
  if (enriched.length > 0) {
    return [...enriched]
      .map((city) => {
        const name = (city.en || city.he || '').trim().toLowerCase()
        const lat = city.lat === null ? 'na' : city.lat.toFixed(5)
        const lng = city.lng === null ? 'na' : city.lng.toFixed(5)
        return `${name}:${lat}:${lng}`
      })
      .sort()
  }

  return [...alert.cities]
    .map((city) => city.trim().toLowerCase())
    .filter(Boolean)
    .sort()
}

export function getTzevaadomAlertInstanceId(
  alert: Pick<TzevaadomAlert, 'notificationId' | 'time' | 'threat' | 'isDrill' | 'cities' | 'citiesEnriched'>,
) {
  const sourceId = alert.notificationId.trim() || 'no-notification-id'
  const cityTokens = normalizeAlertCityTokens(alert)
  const cityKey = cityTokens.length > 0 ? cityTokens.join('|') : 'no-city'

  return `${sourceId}:${alert.time}:${alert.threat}:${alert.isDrill ? 1 : 0}:${cityKey}`
}

// ---------- Message Classification ----------

function classifySystemMessage(data: Record<string, unknown>): SystemMessageType {
  const bodyHe = typeof data.bodyHe === 'string' ? data.bodyHe : ''
  const bodyEn = typeof data.bodyEn === 'string' ? data.bodyEn : ''
  const titleEn = typeof data.titleEn === 'string' ? data.titleEn : ''
  const combined = `${bodyHe} ${bodyEn} ${titleEn}`.toLowerCase()

  for (const kw of EARLY_WARNING_KEYWORDS_HE) {
    if (bodyHe.includes(kw)) return 'early_warning'
  }
  for (const kw of EARLY_WARNING_KEYWORDS_EN) {
    if (combined.includes(kw)) return 'early_warning'
  }

  for (const kw of INCIDENT_ENDED_KEYWORDS_HE) {
    if (bodyHe.includes(kw)) return 'incident_ended'
  }
  for (const kw of INCIDENT_ENDED_KEYWORDS_EN) {
    if (combined.includes(kw)) return 'incident_ended'
  }

  return 'unknown'
}

// ---------- Supabase History ----------

export interface TzevaadomEventRow {
  id: number
  event_type: 'ALERT' | 'SYSTEM_MESSAGE'
  payload: Record<string, unknown>
  received_at: string
}

/**
 * Supabase'den son N saatteki Tzeva Adom eventlerini çeker.
 * Supabase client dışarıdan verilir (import döngüsünden kaçınmak için).
 */
export async function fetchTzevaadomHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient: any,
  hoursBack = 1,
): Promise<{ alerts: TzevaadomAlert[]; systemMessages: TzevaadomSystemMessage[] }> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseClient
    .from('tzevaadom_events')
    .select('id,event_type,payload,received_at')
    .gte('received_at', since)
    .order('received_at', { ascending: false })
    .limit(200)

  if (error || !data) {
    return { alerts: [], systemMessages: [] }
  }

  const alerts: TzevaadomAlert[] = []
  const systemMessages: TzevaadomSystemMessage[] = []

  for (const row of data as TzevaadomEventRow[]) {
    const d = row.payload
    const receivedAtMs = new Date(row.received_at).getTime()

    if (row.event_type === 'ALERT') {
      alerts.push({
        notificationId: typeof d.notificationId === 'string' ? d.notificationId : String(row.id),
        time: typeof d.time === 'number' ? d.time : Math.floor(receivedAtMs / 1000),
        threat: (typeof d.threat === 'number' ? d.threat : 0) as TzevaadomThreatId,
        isDrill: d.isDrill === true,
        cities: Array.isArray(d.cities) ? d.cities.filter((c): c is string => typeof c === 'string') : [],
        citiesEnriched: Array.isArray(d.citiesEnriched) ? d.citiesEnriched as EnrichedCity[] : undefined,
      })
    }

    if (row.event_type === 'SYSTEM_MESSAGE') {
      const msgType = classifySystemMessage(d)
      systemMessages.push({
        id: typeof d.id === 'number' ? d.id : row.id,
        time: typeof d.time === 'string' ? d.time : String(d.time ?? ''),
        type: msgType,
        titleEn: typeof d.titleEn === 'string' ? d.titleEn : '',
        titleHe: typeof d.titleHe === 'string' ? d.titleHe : '',
        bodyEn: typeof d.bodyEn === 'string' ? d.bodyEn : '',
        bodyHe: typeof d.bodyHe === 'string' ? d.bodyHe : '',
        bodyAr: typeof d.bodyAr === 'string' ? d.bodyAr : '',
        receivedAtMs,
        citiesEnriched: Array.isArray(d.citiesEnriched) ? d.citiesEnriched as EnrichedCity[] : undefined,
      })
    }
  }

  return { alerts, systemMessages }
}

// ---------- Service ----------

export interface TzevaadomFeedOptions {
  url: string
  onAlert: (alert: TzevaadomAlert) => void
  onSystemMessage: (message: TzevaadomSystemMessage) => void
  onStatusChange: (status: TzevaadomConnectionStatus) => void
}

export function createTzevaadomFeed(options: TzevaadomFeedOptions) {
  let ws: WebSocket | null = null
  let running = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  const RECONNECT_BASE_MS = 2_000
  const RECONNECT_MAX_MS = 30_000

  function connect() {
    if (!running) return

    options.onStatusChange('connecting')

    try {
      ws = new WebSocket(options.url)
    } catch {
      options.onStatusChange('error')
      scheduleReconnect()
      return
    }

    ws.onopen = () => {
      if (!running) {
        ws?.close()
        return
      }
      reconnectAttempts = 0
      options.onStatusChange('connected')
    }

    ws.onmessage = (event) => {
      if (!running) return

      try {
        const parsed = JSON.parse(typeof event.data === 'string' ? event.data : '')

        if (parsed.type === 'ALERT' && parsed.data) {
          const d = parsed.data as Record<string, unknown>
          const enriched = Array.isArray(d.citiesEnriched) ? d.citiesEnriched as EnrichedCity[] : undefined
          const alert: TzevaadomAlert = {
            notificationId: typeof d.notificationId === 'string' ? d.notificationId : crypto.randomUUID(),
            time: typeof d.time === 'number' ? d.time : Math.floor(Date.now() / 1000),
            threat: (typeof d.threat === 'number' ? d.threat : 0) as TzevaadomThreatId,
            isDrill: d.isDrill === true,
            cities: Array.isArray(d.cities) ? d.cities.filter((c): c is string => typeof c === 'string') : [],
            citiesEnriched: enriched,
          }
          options.onAlert(alert)
        }

        if (parsed.type === 'SYSTEM_MESSAGE' && parsed.data) {
          const d = parsed.data as Record<string, unknown>
          const msgType = classifySystemMessage(d)
          const message: TzevaadomSystemMessage = {
            id: typeof d.id === 'number' ? d.id : 0,
            time: typeof d.time === 'string' ? d.time : String(d.time ?? ''),
            type: msgType,
            titleEn: typeof d.titleEn === 'string' ? d.titleEn : '',
            titleHe: typeof d.titleHe === 'string' ? d.titleHe : '',
            bodyEn: typeof d.bodyEn === 'string' ? d.bodyEn : '',
            bodyHe: typeof d.bodyHe === 'string' ? d.bodyHe : '',
            bodyAr: typeof d.bodyAr === 'string' ? d.bodyAr : '',
            receivedAtMs: Date.now(),
            citiesEnriched: Array.isArray(d.citiesEnriched) ? d.citiesEnriched as EnrichedCity[] : undefined,
          }
          options.onSystemMessage(message)
        }
      } catch {
        // Invalid JSON — ignore
      }
    }

    ws.onerror = () => {
      options.onStatusChange('error')
    }

    ws.onclose = () => {
      ws = null
      if (running) {
        options.onStatusChange('disconnected')
        scheduleReconnect()
      }
    }
  }

  function scheduleReconnect() {
    if (!running || reconnectTimer) return
    reconnectAttempts++
    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_MS)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  return {
    start() {
      if (running) return
      running = true
      reconnectAttempts = 0
      connect()
    },

    stop() {
      running = false
      clearReconnect()
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        ws.close()
        ws = null
      }
      options.onStatusChange('disconnected')
    },
  }
}
