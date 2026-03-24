import {
  createRateLimiter,
  createServiceRoleClient,
  getCorsHeaders,
  jsonResponse,
  normalizePagination,
  readJsonBody,
  requireAdminContext,
  toAdminUserRecord,
  writeAuditLog,
} from '../_shared/admin.ts'

const rateLimit = createRateLimiter({
  maxAttempts: 60,
  windowMs: 60 * 1000,
  blockDurationMs: 60 * 1000,
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) })
  }

  const supabaseAdmin = createServiceRoleClient()
  const authResult = await requireAdminContext(request, supabaseAdmin, 'list_users')
  if (!authResult.ok) {
    return authResult.response
  }

  const { actor, ip } = authResult
  const limitKey = `${actor.id}:${ip}`
  const limitResult = rateLimit(limitKey)
  if (!limitResult.allowed) {
    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'list_users',
      status: 'denied',
      metadata: { reason: 'rate_limited', ip },
    })

    return jsonResponse(
      request,
      { error: 'Cok fazla istek. Lutfen daha sonra tekrar deneyin.' },
      429,
      { 'Retry-After': String(limitResult.retryAfterSeconds) },
    )
  }

  try {
    const body = await readJsonBody<{ page?: number; pageSize?: number }>(request)
    const { page, pageSize, from, to } = normalizePagination(body.page, body.pageSize)

    const { data, error, count } = await supabaseAdmin
      .from('profiles')
      .select('user_id,username,role,created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      throw error
    }

    return jsonResponse(request, {
      items: (data ?? []).map((item) =>
        toAdminUserRecord(
          item as {
            user_id: string
            username: string
            role: 'user' | 'admin'
            created_at: string
          },
        ),
      ),
      page,
      pageSize,
      total: count ?? 0,
    })
  } catch (error) {
    console.error(error)
    return jsonResponse(request, { error: 'Kullanicilar listelenemedi.' }, 500)
  }
})
