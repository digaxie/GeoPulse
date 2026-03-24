import {
  createInternalUserEmail,
  createRateLimiter,
  createServiceRoleClient,
  createStrongPassword,
  getCorsHeaders,
  isUserRole,
  jsonResponse,
  readJsonBody,
  requireAdminContext,
  toAdminUserRecord,
  validateManagedUsername,
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
  const authResult = await requireAdminContext(request, supabaseAdmin, 'create_user')
  if (!authResult.ok) {
    return authResult.response
  }

  const { actor, ip } = authResult
  const limitKey = `${actor.id}:${ip}`
  const limitResult = rateLimit(limitKey)
  if (!limitResult.allowed) {
    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'create_user',
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

  let createdUserId: string | null = null
  let targetUsername: string | null = null

  try {
    const body = await readJsonBody<{ username?: unknown; role?: unknown }>(request)
    const username = validateManagedUsername(body.username)
    const role = body.role === undefined ? 'user' : body.role

    if (!isUserRole(role)) {
      return jsonResponse(request, { error: 'Gecersiz rol.' }, 400)
    }

    targetUsername = username

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id')
      .ilike('username', username)
      .limit(1)
      .maybeSingle()

    if (existingProfileError) {
      throw existingProfileError
    }

    if (existingProfile) {
      return jsonResponse(request, { error: 'Bu kullanici adi zaten kullaniliyor.' }, 409)
    }

    const email = await createInternalUserEmail(username)
    const password = createStrongPassword()
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username,
      },
    })

    if (createUserError || !createdUser.user) {
      throw createUserError ?? new Error('Auth user olusturulamadi.')
    }

    createdUserId = createdUser.user.id

    const { error: insertProfileError } = await supabaseAdmin.from('profiles').insert({
      user_id: createdUser.user.id,
      username,
      email,
      role,
    })

    if (insertProfileError) {
      await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id)
      throw insertProfileError
    }

    const { data: createdProfile, error: createdProfileError } = await supabaseAdmin
      .from('profiles')
      .select('user_id,username,role,created_at')
      .eq('user_id', createdUser.user.id)
      .single()

    if (createdProfileError || !createdProfile) {
      throw createdProfileError ?? new Error('Olusturulan profil bulunamadi.')
    }

    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'create_user',
      targetUserId: createdUser.user.id,
      targetUsername: username,
      status: 'success',
      metadata: { role, ip },
    })

    return jsonResponse(request, {
      user: toAdminUserRecord(
        createdProfile as {
          user_id: string
          username: string
          role: 'user' | 'admin'
          created_at: string
        },
      ),
      password,
    })
  } catch (error) {
    console.error(error)

    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId).catch((cleanupError) => {
        console.error('create_user cleanup failed', cleanupError)
      })
    }

    await writeAuditLog(supabaseAdmin, {
      actorUserId: actor.id,
      action: 'create_user',
      targetUserId: createdUserId,
      targetUsername,
      status: 'failed',
      metadata: {
        ip,
        error: error instanceof Error ? error.message : 'unknown',
      },
    })

    return jsonResponse(request, { error: 'Kullanici olusturulamadi.' }, 500)
  }
})
