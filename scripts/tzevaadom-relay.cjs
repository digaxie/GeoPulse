/**
 * Tzeva Adom WebSocket Relay Server
 *
 * Tarayıcı doğrudan wss://ws.tzevaadom.co.il'e bağlanamaz (custom header gerekiyor).
 * Bu relay, upstream'e Node.js WebSocket ile bağlanır ve local WebSocket server
 * üzerinden tarayıcıya iletir.
 *
 * Pikud HaOref şehir veritabanını başlangıçta yükler ve her ALERT'teki İbranice
 * şehir adlarını İngilizce isim + koordinata dönüştürür.
 *
 * Ayrıca her event'i Supabase'e yazar (24 saatlik geçmiş).
 *
 * Kullanım: node scripts/tzevaadom-relay.cjs
 * Tarayıcı bağlantısı: ws://localhost:3001
 *
 * Env vars (opsiyonel — yoksa Supabase'e yazma atlanır):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const { WebSocketServer, WebSocket } = require('ws')
const crypto = require('crypto')

const UPSTREAM_URL = 'wss://ws.tzevaadom.co.il/socket?platform=ANDROID'
const LOCAL_PORT = Number(process.env.PORT) || 3001
const PING_INTERVAL_MS = 55_000
const RECONNECT_BASE_MS = 2_000
const RECONNECT_MAX_MS = 30_000
const PRUNE_INTERVAL_MS = 10 * 60 * 1000

const CITIES_URL = 'https://raw.githubusercontent.com/eladnava/pikud-haoref-api/master/cities.json'

let upstream = null
let reconnectAttempts = 0
let pingTimer = null
const clients = new Set()

// ---------- City Lookup ----------

/** @type {Map<string, {name_en: string, lat: number, lng: number, zone_en: string, countdown: number}>} */
const cityLookup = new Map()

/** @type {Map<number, {name_he: string, name_en: string, lat: number, lng: number, zone_en: string, countdown: number}>} */
const cityLookupById = new Map()

function normalizeCityLookupKey(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .normalize('NFKC')
    .replace(/[\u05F3\u05F4"'`´’‘“”„‟]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function registerCityLookupEntry(key, payload) {
  if (typeof key !== 'string' || !key.trim()) {
    return
  }

  cityLookup.set(key, payload)

  const normalizedKey = normalizeCityLookupKey(key)
  if (normalizedKey && normalizedKey !== key) {
    cityLookup.set(normalizedKey, payload)
  }
}

async function loadCityDatabase() {
  try {
    const response = await fetch(CITIES_URL)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const cities = await response.json()

    for (const city of cities) {
      if (city.name && city.lat && city.lng) {
        registerCityLookupEntry(city.name, {
          name_en: city.name_en || city.name,
          lat: city.lat,
          lng: city.lng,
          zone_en: city.zone_en || '',
          countdown: city.countdown || 0,
        })
      }
      // value alanı da bazen farklı olabiliyor
      if (city.value && city.value !== city.name && city.lat && city.lng) {
        registerCityLookupEntry(city.value, {
          name_en: city.name_en || city.name,
          lat: city.lat,
          lng: city.lng,
          zone_en: city.zone_en || '',
          countdown: city.countdown || 0,
        })
      }
      // ID'ye göre de lookup
      if (typeof city.id === 'number' && city.id > 0 && city.lat && city.lng) {
        cityLookupById.set(city.id, {
          name_he: city.name || '',
          name_en: city.name_en || city.name || '',
          lat: city.lat,
          lng: city.lng,
          zone_en: city.zone_en || '',
          countdown: city.countdown || 0,
        })
      }
    }

    log('INFO', `Sehir veritabani yuklendi: ${cityLookup.size} bolge (isim), ${cityLookupById.size} bolge (id)`)
  } catch (err) {
    log('WARN', `Sehir veritabani yuklenemedi: ${err.message} — Ingilizce ceviri devre disi`)
  }
}

function enrichCities(hebrewCities) {
  if (!Array.isArray(hebrewCities)) return []

  return hebrewCities.map((cityHe) => {
    const info = cityLookup.get(cityHe) || cityLookup.get(normalizeCityLookupKey(cityHe))
    if (info) {
      return {
        he: cityHe,
        en: info.name_en,
        lat: info.lat,
        lng: info.lng,
        zone_en: info.zone_en,
        countdown: info.countdown,
      }
    }
    return { he: cityHe, en: cityHe, lat: null, lng: null, zone_en: '', countdown: 0 }
  })
}

function enrichCitiesByIds(cityIds) {
  if (!Array.isArray(cityIds)) return []

  return cityIds
    .map((id) => {
      const info = cityLookupById.get(id)
      if (!info) return null
      return {
        he: info.name_he,
        en: info.name_en,
        lat: info.lat,
        lng: info.lng,
        zone_en: info.zone_en,
        countdown: info.countdown,
      }
    })
    .filter(Boolean)
}

// ---------- Supabase (opsiyonel) ----------

let supabase = null
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
  try {
    const { createClient } = require('@supabase/supabase-js')
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    log('INFO', 'Supabase baglantisi kuruldu — eventler veritabanina yazilacak')
  } catch (err) {
    log('WARN', `Supabase client olusturulamadi: ${err.message}`)
  }
} else {
  log('INFO', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY yok — sadece relay modu (DB yazma yok)')
}

async function writeToSupabase(eventType, payload) {
  if (!supabase) return

  try {
    const { error } = await supabase
      .from('tzevaadom_events')
      .insert({ event_type: eventType, payload })

    if (error) {
      log('WARN', `Supabase yazma hatasi: ${error.message}`)
    }
  } catch (err) {
    log('WARN', `Supabase yazma exception: ${err.message}`)
  }
}

async function pruneOldEvents() {
  if (!supabase) return

  try {
    const { error } = await supabase.rpc('prune_old_tzevaadom_events')
    if (error) {
      log('WARN', `Prune hatasi: ${error.message}`)
    } else {
      log('INFO', '24 saatten eski eventler temizlendi')
    }
  } catch (err) {
    log('WARN', `Prune exception: ${err.message}`)
  }
}

// ---------- Logging ----------

function log(level, msg, data) {
  const ts = new Date().toLocaleTimeString('tr-TR', { hour12: false })
  const suffix = data ? ` ${JSON.stringify(data)}` : ''
  console.log(`[${ts}] [${level}] ${msg}${suffix}`)
}

// ---------- Broadcast ----------

function broadcast(message) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

// ---------- Upstream ----------

function connectUpstream() {
  if (upstream && (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING)) {
    return
  }

  log('INFO', 'Upstream baglantisi kuruluyor...', { url: UPSTREAM_URL })

  upstream = new WebSocket(UPSTREAM_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N)',
      Referer: 'https://www.tzevaadom.co.il',
      Origin: 'https://www.tzevaadom.co.il',
      tzofar: crypto.randomBytes(16).toString('hex'),
    },
  })

  upstream.on('open', () => {
    reconnectAttempts = 0
    log('INFO', 'Upstream baglandi')
    startPing()
  })

  upstream.on('message', (data) => {
    const msg = data.toString()
    if (msg.length === 0) return

    try {
      const parsed = JSON.parse(msg)

      // ALERT mesajlarını zenginleştir
      if (parsed.type === 'ALERT' && parsed.data && Array.isArray(parsed.data.cities)) {
        const enrichedCities = enrichCities(parsed.data.cities)
        parsed.data.citiesEnriched = enrichedCities

        log('DATA', 'ALERT', {
          cities: enrichedCities.map((c) => c.en).join(', '),
          threat: parsed.data.threat,
        })

        // Zenginleştirilmiş veriyi Supabase'e yaz
        writeToSupabase('ALERT', parsed.data)

        // Zenginleştirilmiş mesajı tarayıcılara gönder
        broadcast(JSON.stringify(parsed))
        return
      }

      if (parsed.type === 'SYSTEM_MESSAGE') {
        let enriched = []

        // Önce citiesIds ile dene (early_warning genelde bunu kullanır)
        if (parsed.data && Array.isArray(parsed.data.citiesIds) && parsed.data.citiesIds.length > 0) {
          enriched = enrichCitiesByIds(parsed.data.citiesIds)
        }

        // citiesIds yoksa veya boşsa, cities string array'i ile dene (incident_ended genelde bunu kullanır)
        if (enriched.length === 0 && parsed.data && Array.isArray(parsed.data.cities) && parsed.data.cities.length > 0) {
          enriched = enrichCities(parsed.data.cities)
        }

        if (enriched.length > 0) {
          parsed.data.citiesEnriched = enriched
          log('DATA', 'SYSTEM_MESSAGE (enriched)', {
            count: enriched.length,
            titleEn: parsed.data.titleEn?.substring(0, 60),
          })
        } else {
          log('DATA', 'SYSTEM_MESSAGE', parsed.data ? { preview: JSON.stringify(parsed.data).substring(0, 120) } : undefined)
        }

        writeToSupabase('SYSTEM_MESSAGE', parsed.data)
        broadcast(JSON.stringify(parsed))
        return
      } else {
        log('DATA', `${parsed.type}`, parsed.data ? { preview: JSON.stringify(parsed.data).substring(0, 120) } : undefined)
      }
    } catch {
      log('DATA', 'raw message', { length: msg.length })
    }

    broadcast(msg)
  })

  upstream.on('error', (err) => {
    log('ERROR', `Upstream hata: ${err.message}`)
  })

  upstream.on('close', (code, reason) => {
    log('WARN', `Upstream kapandi: ${code}`, { reason: reason.toString() })
    stopPing()
    scheduleReconnect()
  })

  upstream.on('pong', () => {
    log('DEBUG', 'Upstream pong')
  })
}

function startPing() {
  stopPing()
  pingTimer = setInterval(() => {
    if (upstream && upstream.readyState === WebSocket.OPEN) {
      upstream.ping()
    }
  }, PING_INTERVAL_MS)
}

function stopPing() {
  if (pingTimer) {
    clearInterval(pingTimer)
    pingTimer = null
  }
}

function scheduleReconnect() {
  reconnectAttempts++
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts - 1), RECONNECT_MAX_MS)
  log('INFO', `${delay}ms sonra tekrar denenecek`, { attempt: reconnectAttempts })
  setTimeout(connectUpstream, delay)
}

// ---------- Local WebSocket Server ----------

const wss = new WebSocketServer({ port: LOCAL_PORT, host: '0.0.0.0' })

wss.on('listening', async () => {
  log('INFO', `Relay server calisiyor: 0.0.0.0:${LOCAL_PORT}`)

  // Şehir veritabanını yükle, sonra upstream'e bağlan
  await loadCityDatabase()
  connectUpstream()
})

wss.on('connection', (ws) => {
  clients.add(ws)
  log('INFO', `Tarayici baglandi (toplam: ${clients.size})`)

  ws.on('close', () => {
    clients.delete(ws)
    log('INFO', `Tarayici ayrildi (toplam: ${clients.size})`)
  })

  ws.on('error', () => {
    clients.delete(ws)
  })
})

wss.on('error', (err) => {
  log('ERROR', `Server hata: ${err.message}`)
})

// ---------- Periyodik temizlik ----------

const pruneTimer = setInterval(pruneOldEvents, PRUNE_INTERVAL_MS)

// ---------- Graceful shutdown ----------

process.on('SIGINT', () => {
  log('INFO', 'Kapatiliyor...')
  stopPing()
  clearInterval(pruneTimer)
  if (upstream) upstream.close()
  wss.close()
  process.exit(0)
})
