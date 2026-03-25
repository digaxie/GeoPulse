/**
 * Tzeva Adom WebSocket Relay Server
 *
 * Tarayıcı doğrudan wss://ws.tzevaadom.co.il'e bağlanamaz (custom header gerekiyor).
 * Bu relay, upstream'e Node.js WebSocket ile bağlanır ve local WebSocket server
 * üzerinden tarayıcıya iletir.
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
const PRUNE_INTERVAL_MS = 10 * 60 * 1000 // 10 dakikada bir eski kayıtları temizle

let upstream = null
let reconnectAttempts = 0
let pingTimer = null
const clients = new Set()

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
      log('DATA', `${parsed.type}`, parsed.data ? { preview: JSON.stringify(parsed.data).substring(0, 120) } : undefined)

      // Supabase'e yaz (ALERT ve SYSTEM_MESSAGE)
      if (parsed.type === 'ALERT' || parsed.type === 'SYSTEM_MESSAGE') {
        writeToSupabase(parsed.type, parsed.data)
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

const wss = new WebSocketServer({ port: LOCAL_PORT })

wss.on('listening', () => {
  log('INFO', `Relay server calisiyor: ws://localhost:${LOCAL_PORT}`)
  log('INFO', 'Tarayicidan ws://localhost:3001 ile baglanabilirsiniz')
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
