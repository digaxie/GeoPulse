import {
  createRateLimiter,
  createServiceRoleClient,
  createStrongPassword,
  getCorsHeaders,
  jsonResponse,
  readJsonBody,
  requireAdminContext,
  writeAuditLog,
} from '../_shared/admin.ts'

const rateLimit = createRateLimiter({
  maxAttempts: 10,
  windowMs: 10 * 60 * 1000,
  blockDurationMs: 10 * 60 * 1000,
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(request) })
  }

  const supabaseAdmin = createServiceRoleClient()
  const authResult = await requireAdminContext(request, supabaseAdmin, 'rotate_password')
  if (!authResult.ok) {
    return authResult.response
  }

  const { actor, ip } = authResult
  const limitKey = `${actor.id}:${ip}`
  const limitResult = rateLimit(limitKey)
  if (!limitResult.allowed) {
    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'rotate_password',
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

  let targetUserId: string | null = null
  let targetUsername: string | null = null

  try {
    const body = await readJsonBody<{ userId?: unknown }>(request)
    if (typeof body.userId !== 'string' || body.userId.trim().length === 0) {
      return jsonResponse(request, { error: 'Gecerli userId gerekli.' }, 400)
    }

    targetUserId = body.userId.trim()

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,username')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (targetProfileError) {
      throw targetProfileError
    }

    if (!targetProfile) {
      return jsonResponse(request, { error: 'Kullanici bulunamadi.' }, 404)
    }

    targetUsername = String(targetProfile.username)
    const password = createStrongPassword()
    const { error: rotateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      password,
    })

    if (rotateError) {
      throw rotateError
    }

    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'rotate_password',
      targetUserId,
      targetUsername,
      status: 'success',
      metadata: { ip },
    })

    return jsonResponse(request, { password })
  } catch (error) {
    console.error(error)

    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'rotate_password',
      targetUserId,
      targetUsername,
      status: 'failed',
      metadata: {
        ip,
        error: error instanceof Error ? error.message : 'unknown',
      },
    })

    return jsonResponse(request, { error: 'Sifre rotate edilemedi.' }, 500)
  }
})
