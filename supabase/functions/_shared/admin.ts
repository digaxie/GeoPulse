import { createClient } from 'jsr:@supabase/supabase-js@2'

export type UserRole = 'user' | 'admin'

type RateLimitRecord = {
  count: number
  firstAttempt: number
  blockedUntil?: number
}

type RateLimitConfig = {
  maxAttempts: number
  windowMs: number
  blockDurationMs: number
}

type AdminProfile = {
  user_id: string
  username: string
  role: UserRole
}

type AuditStatus = 'success' | 'denied' | 'failed'

const USERNAME_PATTERN = /^[a-zA-Z0-9_.\-@]+$/
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const DIGITS = '23456789'
const SYMBOLS = '!@#$%^&*-_=+'
const ALL_PASSWORD_CHARS = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`

const ALLOWED_ORIGINS = [
  'https://www.geopulse.com.tr',
  'https://geopulse.com.tr',
  'http://localhost:5173',
  'http://localhost:4173',
] as const

export const UNKNOWN_ACTOR_USER_ID = '00000000-0000-0000-0000-000000000000'

export function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin as (typeof ALLOWED_ORIGINS)[number])
    ? origin
    : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

export function jsonResponse(
  request: Request,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(request),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  })
}

export function getClientIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}

export function createServiceRoleClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.')
  }

  return createClient(url, serviceRoleKey)
}

export function validateManagedUsername(username: unknown) {
  if (typeof username !== 'string') {
    throw new Error('Kullanici adi string olmali.')
  }

  const trimmed = username.trim()
  if (!trimmed) {
    throw new Error('Kullanici adi gerekli.')
  }

  if (trimmed.length > 50) {
    throw new Error('Kullanici adi en fazla 50 karakter olabilir.')
  }

  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error('Kullanici adi gecersiz karakter iceriyor.')
  }

  return trimmed
}

export function isUserRole(value: unknown): value is UserRole {
  return value === 'user' || value === 'admin'
}

function normalizeUsername(username: string) {
  return validateManagedUsername(username).trim().toLowerCase()
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join(
    '',
  )
}

export async function createInternalUserEmail(username: string) {
  const digest = (await sha256Hex(normalizeUsername(username))).slice(0, 24)
  return `u-${digest}@users.geopulse.invalid`
}

function randomChar(source: string) {
  const bytes = new Uint32Array(1)
  crypto.getRandomValues(bytes)
  return source[bytes[0] % source.length]
}

function shuffle<T>(items: T[]) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    const swapIndex = bytes[0] % (index + 1)
    ;[items[index], items[swapIndex]] = [items[swapIndex], items[index]]
  }

  return items
}

export function createStrongPassword(length = 24) {
  const effectiveLength = Math.max(12, length)
  const characters = [
    randomChar(UPPER),
    randomChar(LOWER),
    randomChar(DIGITS),
    randomChar(SYMBOLS),
  ]

  while (characters.length < effectiveLength) {
    characters.push(randomChar(ALL_PASSWORD_CHARS))
  }

  return shuffle(characters).join('')
}

export function createRateLimiter(config: RateLimitConfig) {
  const attempts = new Map<string, RateLimitRecord>()

  return (key: string) => {
    const now = Date.now()
    const record = attempts.get(key)

    if (!record || now - record.firstAttempt > config.windowMs) {
      attempts.set(key, { count: 1, firstAttempt: now })
      return { allowed: true } as const
    }

    if (record.blockedUntil && now < record.blockedUntil) {
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil((record.blockedUntil - now) / 1000),
      } as const
    }

    if (record.count >= config.maxAttempts) {
      record.blockedUntil = now + config.blockDurationMs
      attempts.set(key, record)
      return {
        allowed: false,
        retryAfterSeconds: Math.ceil(config.blockDurationMs / 1000),
      } as const
    }

    record.count += 1
    attempts.set(key, record)
    return { allowed: true } as const
  }
}

export async function writeAuditLog(
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  input: {
    actorUserId?: string
    action: string
    targetUserId?: string | null
    targetUsername?: string | null
    status: AuditStatus
    metadata?: Record<string, unknown>
  },
) {
  const { error } = await supabaseAdmin.from('admin_audit_log').insert({
    actor_user_id: input.actorUserId ?? UNKNOWN_ACTOR_USER_ID,
    action: input.action,
    target_user_id: input.targetUserId ?? null,
    target_username: input.targetUsername ?? null,
    status: input.status,
    metadata_json: input.metadata ?? {},
  })

  if (error) {
    console.error('admin_audit_log insert failed', error)
  }
}

export async function requireAdminContext(
  request: Request,
  supabaseAdmin: ReturnType<typeof createServiceRoleClient>,
  action: string,
) {
  const ip = getClientIp(request)
  const authorizationHeader = request.headers.get('authorization') ?? ''
  const jwt = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length).trim()
    : ''

  if (!jwt) {
    await writeAuditLog(supabaseAdmin, {
      action,
      status: 'denied',
      metadata: { reason: 'missing_token', ip },
    })

    return {
      ok: false as const,
      response: jsonResponse(request, { error: 'Yetkisiz istek.' }, 401),
    }
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(jwt)
  const actorUser = authData.user

  if (authError || !actorUser) {
    await writeAuditLog(supabaseAdmin, {
      action,
      status: 'denied',
      metadata: { reason: 'invalid_token', ip },
    })

    return {
      ok: false as const,
      response: jsonResponse(request, { error: 'Yetkisiz istek.' }, 401),
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('user_id,username,role')
    .eq('user_id', actorUser.id)
    .maybeSingle()

  if (profileError || !profile) {
    await writeAuditLog(supabaseAdmin, {
      actorUserId: actorUser.id,
      action,
      status: 'denied',
      metadata: { reason: profileError ? 'profile_lookup_failed' : 'profile_missing', ip },
    })

    return {
      ok: false as const,
      response: jsonResponse(request, { error: 'Admin yetkisi gerekli.' }, 403),
    }
  }

  const actorProfile = profile as AdminProfile
  if (actorProfile.role !== 'admin') {
    await writeAuditLog(supabaseAdmin, {
      actorUserId: actorProfile.user_id,
      action,
      targetUsername: actorProfile.username,
      status: 'denied',
      metadata: { reason: 'role_mismatch', ip },
    })

    return {
      ok: false as const,
      response: jsonResponse(request, { error: 'Admin yetkisi gerekli.' }, 403),
    }
  }

  return {
    ok: true as const,
    actor: {
      id: actorProfile.user_id,
      username: actorProfile.username,
      role: actorProfile.role,
    },
    ip,
  }
}

export async function readJsonBody<TBody extends Record<string, unknown>>(request: Request) {
  try {
    return (await request.json()) as TBody
  } catch {
    throw new Error('Gecersiz JSON govdesi.')
  }
}

export function normalizePagination(page: unknown, pageSize: unknown) {
  const normalizedPage =
    typeof page === 'number' && Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1
  const normalizedPageSize =
    typeof pageSize === 'number' && Number.isFinite(pageSize)
      ? Math.min(100, Math.max(1, Math.trunc(pageSize)))
      : 50

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    from: (normalizedPage - 1) * normalizedPageSize,
    to: normalizedPage * normalizedPageSize - 1,
  }
}

export function toAdminUserRecord(profile: {
  user_id: string
  username: string
  role: UserRole
  created_at: string
}) {
  return {
    id: profile.user_id,
    username: profile.username,
    role: profile.role,
    createdAt: profile.created_at,
  }
}
