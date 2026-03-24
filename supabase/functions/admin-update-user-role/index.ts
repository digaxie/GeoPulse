import {
  createRateLimiter,
  createServiceRoleClient,
  getCorsHeaders,
  isUserRole,
  jsonResponse,
  readJsonBody,
  requireAdminContext,
  toAdminUserRecord,
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
  const authResult = await requireAdminContext(request, supabaseAdmin, 'update_role')
  if (!authResult.ok) {
    return authResult.response
  }

  const { actor, ip } = authResult
  const limitKey = `${actor.id}:${ip}`
  const limitResult = rateLimit(limitKey)
  if (!limitResult.allowed) {
    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'update_role',
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
    const body = await readJsonBody<{ userId?: unknown; role?: unknown }>(request)
    if (typeof body.userId !== 'string' || body.userId.trim().length === 0) {
      return jsonResponse(request, { error: 'Gecerli userId gerekli.' }, 400)
    }

    if (!isUserRole(body.role)) {
      return jsonResponse(request, { error: 'Gecersiz rol.' }, 400)
    }

    targetUserId = body.userId.trim()
    const nextRole = body.role

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,username,role,created_at')
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (targetProfileError) {
      throw targetProfileError
    }

    if (!targetProfile) {
      return jsonResponse(request, { error: 'Kullanici bulunamadi.' }, 404)
    }

    targetUsername = String(targetProfile.username)
    const currentRole = targetProfile.role as 'user' | 'admin'
    if (currentRole === nextRole) {
      return jsonResponse(request, {
        user: toAdminUserRecord(
          targetProfile as {
            user_id: string
            username: string
            role: 'user' | 'admin'
            created_at: string
          },
        ),
      })
    }

    if (currentRole === 'admin' && nextRole === 'user') {
      const { count, error: countError } = await supabaseAdmin
        .from('profiles')
        .select('user_id', { count: 'exact', head: true })
        .eq('role', 'admin')

      if (countError) {
        throw countError
      }

      if ((count ?? 0) <= 1) {
        return jsonResponse(request, { error: 'Son admin kullanici user rolune dusurulemez.' }, 409)
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ role: nextRole })
      .eq('user_id', targetUserId)

    if (updateError) {
      throw updateError
    }

    const { data: updatedProfile, error: updatedProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,username,role,created_at')
      .eq('user_id', targetUserId)
      .single()

    if (updatedProfileError || !updatedProfile) {
      throw updatedProfileError ?? new Error('Guncellenen profil okunamadi.')
    }

    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'update_role',
      targetUserId,
      targetUsername,
      status: 'success',
      metadata: { nextRole, ip },
    })

    return jsonResponse(request, {
      user: toAdminUserRecord(
        updatedProfile as {
          user_id: string
          username: string
          role: 'user' | 'admin'
          created_at: string
        },
      ),
    })
  } catch (error) {
    console.error(error)

    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'update_role',
      targetUserId,
      targetUsername,
      status: 'failed',
      metadata: {
        ip,
        error: error instanceof Error ? error.message : 'unknown',
      },
    })

    return jsonResponse(request, { error: 'Kullanici rolu guncellenemedi.' }, 500)
  }
})
