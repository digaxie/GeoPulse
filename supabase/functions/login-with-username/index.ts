import { createClient } from 'jsr:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'https://www.geopulse.com.tr',
  'https://geopulse.com.tr',
  'http://localhost:5173',
  'http://localhost:4173',
]

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// ─── In-memory rate limiter (Deno isolate başına çalışır) ────────────────────
const loginAttempts = new Map<string, { count: number; firstAttempt: number; blockedUntil?: number }>()

const RATE_LIMIT = {
  maxAttempts: 5,       // 5 başarısız deneme
  windowMs: 15 * 60 * 1000,  // 15 dakika pencere
  blockDurationMs: 30 * 60 * 1000, // 30 dakika blok
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now()
  const record = loginAttempts.get(key)

  if (!record) {
    return { allowed: true }
  }

  // Blok süresi devam ediyor mu?
  if (record.blockedUntil && now < record.blockedUntil) {
    const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  // Pencere süresi dolmuşsa sıfırla
  if (now - record.firstAttempt > RATE_LIMIT.windowMs) {
    loginAttempts.delete(key)
    return { allowed: true }
  }

  // Limit aşıldı mı?
  if (record.count >= RATE_LIMIT.maxAttempts) {
    // Blok başlat
    record.blockedUntil = now + RATE_LIMIT.blockDurationMs
    loginAttempts.set(key, record)
    const retryAfterSeconds = Math.ceil(RATE_LIMIT.blockDurationMs / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  return { allowed: true }
}

function recordFailedAttempt(key: string): void {
  const now = Date.now()
  const record = loginAttempts.get(key)

  if (!record || now - record.firstAttempt > RATE_LIMIT.windowMs) {
    loginAttempts.set(key, { count: 1, firstAttempt: now })
  } else {
    record.count += 1
    loginAttempts.set(key, record)
  }
}

function clearAttempts(key: string): void {
  loginAttempts.delete(key)
}

// ─── Input doğrulama ─────────────────────────────────────────────────────────
function validateInput(username: unknown, password: unknown): string | null {
  if (typeof username !== 'string' || typeof password !== 'string') {
    return 'Kullanici adi ve sifre string olmali.'
  }

  const trimmedUsername = username.trim()
  const trimmedPassword = password.trim()

  if (!trimmedUsername || !trimmedPassword) {
    return 'Kullanici adi ve sifre gerekli.'
  }

  if (trimmedUsername.length > 50) {
    return 'Kullanici adi en fazla 50 karakter olabilir.'
  }

  if (trimmedPassword.length < 6) {
    return 'Sifre en az 6 karakter olmali.'
  }

  if (trimmedPassword.length > 128) {
    return 'Sifre en fazla 128 karakter olabilir.'
  }

  // Sadece güvenli karakterlere izin ver
  if (!/^[a-zA-Z0-9_.\-@]+$/.test(trimmedUsername)) {
    return 'Kullanici adi gecersiz karakter iceriyor.'
  }

  return null
}

Deno.serve(async (request) => {
  const corsHeaders = getCorsHeaders(request)

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const clientIp = getClientIp(request)
  let username = ''

  try {
    const body = (await request.json()) as {
      username?: string
      password?: string
    }

    username = body.username?.trim() ?? ''
    const password = body.password?.trim() ?? ''

    // ─── Input doğrulama ───────────────────────────────────────────────────
    const validationError = validateInput(body.username, body.password)
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ─── Rate limiting: IP + username kombinasyonu ─────────────────────────
    const rateLimitKey = `${clientIp}:${username.toLowerCase()}`
    const rateCheck = checkRateLimit(rateLimitKey)

    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: `Cok fazla deneme. ${rateCheck.retryAfterSeconds} saniye sonra tekrar deneyin.`,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Retry-After': String(rateCheck.retryAfterSeconds),
          },
        },
      )
    }

    // ─── Supabase admin client ─────────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ─── Username → email lookup ───────────────────────────────────────────
    const { data: email, error: lookupError } = await supabaseAdmin.rpc(
      'lookup_login_email',
      { login_username: username },
    )

    if (lookupError || !email) {
      recordFailedAttempt(rateLimitKey)
      return new Response(
        JSON.stringify({ error: 'Kullanici adi veya sifre hatali.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // ─── Email + password ile giriş ────────────────────────────────────────
    const { data: signInData, error: signInError } =
      await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      })

    if (signInError || !signInData.session) {
      recordFailedAttempt(rateLimitKey)
      return new Response(
        JSON.stringify({ error: 'Kullanici adi veya sifre hatali.' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // ─── Başarılı giriş ────────────────────────────────────────────────────
    clearAttempts(rateLimitKey)

    return new Response(
      JSON.stringify({
        session: signInData.session,
        user: signInData.user,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch {
    return new Response(
      JSON.stringify({ error: 'Sunucu hatasi. Lutfen tekrar deneyin.' }),
      {
        status: 500,
        headers: { ...getCorsHeaders(request), 'Content-Type': 'application/json' },
      },
    )
  }
})
