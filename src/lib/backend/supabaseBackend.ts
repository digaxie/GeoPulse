import { createClient } from '@supabase/supabase-js'

import { seedAssets } from '@/features/assets/seedAssets'
import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { migrateScenarioDocument } from '@/features/scenario/migrate'
import { appEnv } from '@/lib/env'
import { unwrapRpcSingleRow } from '@/lib/backend/rpcRows'
import { readFileImageDimensions } from '@/lib/utils'
import type {
  AssetDefinition,
  AdminUserListResponse,
  AdminUserRecord,
  AuthSession,
  BackendClient,
  CreateUserInput,
  CreateUserResult,
  CreateScenarioInput,
  ScenarioDetailRecord,
  ScenarioListItem,
  ScenarioLock,
  ScenarioSnapshotRecord,
  ScenarioSubscriptionHandlers,
  UploadAssetInput,
  UserRole,
} from '@/lib/backend/types'

const scenarioDetailSelect =
  'id,title,viewer_slug,document_json,updated_at,revision,lock_holder_id,lock_holder_username,lock_expires_at'
const scenarioListSelect =
  'id,title,viewer_slug,updated_at,revision,lock_holder_id,lock_holder_username,lock_expires_at'
const assetSelect =
  'id,kind,label,source_type,storage_path,thumbnail_path,tags,default_size,default_rotation,intrinsic_width,intrinsic_height,scope,created_at'

const supabase = appEnv.useSupabase
  ? createClient(appEnv.supabaseUrl!, appEnv.supabaseAnonKey!)
  : null

const publicViewerSupabase = appEnv.useSupabase
  ? createClient(appEnv.supabaseUrl!, appEnv.supabaseAnonKey!, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null

type ScenarioBaseRow = {
  id: string
  title: string
  viewer_slug: string
  updated_at: string
  revision: number
  lock_holder_id: string | null
  lock_holder_username: string | null
  lock_expires_at: string | null
}

type ScenarioDetailRow = ScenarioBaseRow & {
  document_json: ScenarioDetailRecord['document']
}

type AssetRow = {
  id: string
  kind: AssetDefinition['kind']
  label: string
  source_type: AssetDefinition['sourceType']
  storage_path: string
  thumbnail_path: string
  tags: string[]
  default_size: number
  default_rotation: number
  intrinsic_width: number | null
  intrinsic_height: number | null
  scope: AssetDefinition['scope']
  created_at: string
}

type ProfileRow = {
  user_id: string
  username: string
  email: string
  role: UserRole
}

type SnapshotRow = {
  id: string
  scenario_id: string
  revision: number
  created_at: string
}

type AdminUserResponseRow = {
  id: string
  username: string
  role: UserRole
  createdAt: string
}

function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase ortam degiskenleri bulunamadi.')
  }

  return supabase
}

function getPublicViewerSupabase() {
  if (!publicViewerSupabase) {
    throw new Error('Supabase ortam degiskenleri bulunamadi.')
  }

  return publicViewerSupabase
}

function toScenarioBaseRecord(row: ScenarioBaseRow): ScenarioListItem {
  const lock: ScenarioLock | null =
    row.lock_holder_id && row.lock_holder_username && row.lock_expires_at
      ? {
          holderId: row.lock_holder_id,
          holderUsername: row.lock_holder_username,
          expiresAt: row.lock_expires_at,
        }
      : null

  return {
    id: row.id,
    title: row.title,
    viewerSlug: row.viewer_slug,
    updatedAt: row.updated_at,
    revision: row.revision,
    lock,
  }
}

function toScenarioRecord(row: ScenarioDetailRow): ScenarioDetailRecord {
  return {
    ...toScenarioBaseRecord(row),
    document: migrateScenarioDocument(row.document_json),
  }
}

function toAssetDefinition(row: AssetRow): AssetDefinition {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    sourceType: row.source_type,
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    tags: row.tags,
    defaultSize: row.default_size,
    defaultRotation: row.default_rotation,
    intrinsicWidth: row.intrinsic_width ?? undefined,
    intrinsicHeight: row.intrinsic_height ?? undefined,
    scope: row.scope,
    createdAt: row.created_at,
  }
}

function toFallbackAuthSession(user: {
  id: string
  email?: string | null
  user_metadata?: { username?: string | null } | null
}) {
  return {
    id: user.id,
    username: String(user.user_metadata?.username ?? user.email ?? 'user'),
    email: user.email ?? undefined,
    role: 'user',
  } satisfies AuthSession
}

function toSnapshotRecord(row: SnapshotRow): ScenarioSnapshotRecord {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    revision: row.revision,
    createdAt: row.created_at,
  }
}

function toAdminUserRecord(row: AdminUserResponseRow): AdminUserRecord {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.createdAt,
  }
}

async function resolveAuthSession(user: {
  id: string
  email?: string | null
  user_metadata?: { username?: string | null } | null
}): Promise<AuthSession> {
  const client = getSupabase()
  const { data, error } = await client
    .from('profiles')
    .select('user_id,username,email,role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    const roleColumnMissing =
      typeof error.message === 'string' &&
      error.message.includes("Could not find the 'role' column of 'profiles'")

    if (!roleColumnMissing) {
      throw error
    }

    const legacyProfile = await client
      .from('profiles')
      .select('user_id,username,email')
      .eq('user_id', user.id)
      .maybeSingle()

    if (legacyProfile.error) {
      throw legacyProfile.error
    }

    if (!legacyProfile.data) {
      return toFallbackAuthSession(user)
    }

    return {
      id: legacyProfile.data.user_id,
      username: legacyProfile.data.username,
      email: legacyProfile.data.email,
      role: 'user',
    }
  }

  if (!data) {
    return toFallbackAuthSession(user)
  }

  const profile = data as ProfileRow
  return {
    id: profile.user_id,
    username: profile.username,
    email: profile.email,
    role: profile.role,
  }
}

async function requireSession() {
  const client = getSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }

  if (!data.session?.user) {
    throw new Error('Oturum bulunamadi.')
  }

  return resolveAuthSession(data.session.user)
}

async function requireAccessToken() {
  const client = getSupabase()
  const { data, error } = await client.auth.getSession()
  if (error) {
    throw error
  }

  if (!data.session?.access_token) {
    throw new Error('Oturum bulunamadi.')
  }

  return data.session.access_token
}

async function callEdgeFunction<TResponse>(
  functionName: string,
  body?: Record<string, unknown>,
): Promise<TResponse> {
  const accessToken = await requireAccessToken()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)

  try {
    const response = await fetch(`${appEnv.supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: appEnv.supabaseAnonKey!,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    })

    const payload = (await response.json().catch(() => null)) as
      | (TResponse & { error?: string; message?: string })
      | null

    if (!response.ok) {
      throw new Error(payload?.error ?? payload?.message ?? `${functionName} request failed.`)
    }

    return payload as TResponse
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Baglanti zaman asimina ugradi.')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function toError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error
  }

  return new Error(fallback)
}

function emitSubscriptionStatus(
  handlers: ScenarioSubscriptionHandlers | undefined,
  status: 'connecting' | 'subscribed' | 'closed' | 'error',
) {
  handlers?.onStatusChange?.(status)
}

export const supabaseBackend: BackendClient = {
  mode: 'supabase',

  async getSession() {
    const client = getSupabase()
    const { data, error } = await client.auth.getSession()
    if (error) {
      throw error
    }

    if (!data.session?.user) {
      return null
    }

    return resolveAuthSession(data.session.user)
  },

  onSessionChange(listener) {
    const client = getSupabase()
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        listener(null)
        return
      }

      void resolveAuthSession(session.user)
        .then((nextSession) => listener(nextSession))
        .catch(() => listener(toFallbackAuthSession(session.user)))
    })

    return () => subscription.unsubscribe()
  },

  async login(username, password) {
    getSupabase()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15_000)

    let response: Response
    try {
      response = await fetch(`${appEnv.supabaseUrl}/functions/v1/login-with-username`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: appEnv.supabaseAnonKey!,
        },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error('Baglanti zaman asimina ugradi.')
      }

      throw error
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new Error((body as { error?: string } | null)?.error || 'Giris basarisiz oldu.')
    }

    const data = (await response.json()) as {
      session: {
        access_token: string
        refresh_token: string
      }
      user: { id: string; email?: string; user_metadata?: { username?: string } }
    }

    const { error } = await getSupabase().auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })

    if (error) {
      throw error
    }

    const nextSession = await this.getSession()
    if (!nextSession) {
      throw new Error('Oturum baslatilamadi.')
    }

    return nextSession
  },

  async logout() {
    const { error } = await getSupabase().auth.signOut()
    if (error) {
      throw error
    }
  },

  async listScenarios() {
    const { data, error } = await getSupabase()
      .from('scenarios')
      .select(scenarioListSelect)
      .order('updated_at', { ascending: false })

    if (error) {
      throw error
    }

    return (data as ScenarioBaseRow[]).map(toScenarioBaseRecord)
  },

  async createScenario(input?: CreateScenarioInput) {
    const session = await requireSession()
    const document = migrateScenarioDocument(input?.document ?? createDefaultScenarioDocument())
    const { data, error } = await getSupabase()
      .from('scenarios')
      .insert({
        title: input?.title ?? 'Yeni Senaryo',
        document_json: document,
        owner_id: session.id,
      })
      .select(scenarioDetailSelect)
      .single()

    if (error) {
      throw error
    }

    return toScenarioRecord(data as ScenarioDetailRow)
  },

  async deleteScenario(id) {
    const { error } = await getSupabase().from('scenarios').delete().eq('id', id)

    if (error) {
      throw error
    }
  },

  async getScenarioById(id) {
    const { data, error } = await getSupabase()
      .from('scenarios')
      .select(scenarioDetailSelect)
      .eq('id', id)
      .maybeSingle()

    if (error) {
      throw error
    }

    return data ? toScenarioRecord(data as ScenarioDetailRow) : null
  },

  async getScenarioByViewerSlug(viewerSlug) {
    const { data, error } = await getPublicViewerSupabase()
      .from('scenarios')
      .select(scenarioDetailSelect)
      .eq('viewer_slug', viewerSlug)
      .maybeSingle()

    if (error) {
      throw error
    }

    return data ? toScenarioRecord(data as ScenarioDetailRow) : null
  },

  async saveScenario(scenarioId, document) {
    const normalizedDocument = migrateScenarioDocument(document)
    const { data, error } = await getSupabase()
      .from('scenarios')
      .update({
        document_json: normalizedDocument,
        revision: normalizedDocument.revision,
      })
      .eq('id', scenarioId)
      .select(scenarioDetailSelect)
      .single()

    if (error) {
      throw error
    }

    return toScenarioRecord(data as ScenarioDetailRow)
  },

  async updateTitle(scenarioId, title) {
    const { error } = await getSupabase()
      .from('scenarios')
      .update({ title })
      .eq('id', scenarioId)

    if (error) {
      throw error
    }
  },

  subscribeToScenario(target, listener, handlers) {
    const isViewerSubscription = Boolean(target.viewerSlug)
    const client = isViewerSubscription ? getPublicViewerSupabase() : getSupabase()
    let channelName = ''
    let active = true
    let removeChannel: (() => void) | null = null

    emitSubscriptionStatus(handlers, 'connecting')

    const init = async () => {
      try {
        const record = target.id
          ? await this.getScenarioById(target.id)
          : await this.getScenarioByViewerSlug(target.viewerSlug ?? '')

        if (!record || !active) {
          return
        }

        channelName = `${isViewerSubscription ? 'viewer' : 'editor'}:scenario:${record.id}`
        const channel = client
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'scenarios',
              filter: `id=eq.${record.id}`,
            },
            (payload) => {
              listener(toScenarioRecord(payload.new as ScenarioDetailRow))
            },
          )

        channel.subscribe((status, error) => {
          if (!active) {
            return
          }

          switch (status) {
            case 'SUBSCRIBED':
              emitSubscriptionStatus(handlers, 'subscribed')
              break
            case 'CHANNEL_ERROR':
            case 'TIMED_OUT':
              emitSubscriptionStatus(handlers, 'error')
              handlers?.onError?.(
                toError(error, `Realtime channel failed for ${channelName || 'scenario'}.`),
              )
              break
            case 'CLOSED':
              emitSubscriptionStatus(handlers, 'closed')
              break
          }
        })

        removeChannel = () => {
          void client.removeChannel(channel)
        }
      } catch (error) {
        emitSubscriptionStatus(handlers, 'error')
        handlers?.onError?.(toError(error, 'Scenario subscription failed.'))
      }
    }

    void init()

    return () => {
      active = false
      removeChannel?.()
      emitSubscriptionStatus(handlers, 'closed')
    }
  },

  async claimEditorLock(scenarioId, session) {
    const { data, error } = await getSupabase().rpc('claim_editor_lock', {
      scenario_id: scenarioId,
      holder_id: session.id,
      holder_username: session.username,
    })

    if (error) {
      throw error
    }

    return data as ScenarioLock
  },

  async refreshEditorLock(scenarioId, session) {
    return this.claimEditorLock(scenarioId, session)
  },

  async releaseEditorLock(scenarioId, session) {
    const { error } = await getSupabase().rpc('release_editor_lock', {
      scenario_id: scenarioId,
      holder_id: session.id,
    })

    if (error) {
      throw error
    }
  },

  async rotateViewerSlug(scenarioId) {
    const { data, error } = await getSupabase().rpc('rotate_viewer_slug', {
      scenario_id: scenarioId,
    })

    if (error) {
      throw error
    }

    return data as string
  },

  async listAssets() {
    const session = await this.getSession()
    if (!session) {
      return seedAssets
    }

    const { data, error } = await getSupabase()
      .from('assets')
      .select(assetSelect)
      .eq('owner_id', session.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    const uploadedAssets = (data as AssetRow[]).map(toAssetDefinition)
    return [
      ...uploadedAssets,
      ...seedAssets.filter(
        (seedAsset) => !uploadedAssets.some((asset) => asset.id === seedAsset.id),
      ),
    ]
  },

  async listLegacyViewerAssets(viewerSlug) {
    const { data, error } = await getPublicViewerSupabase().rpc('get_legacy_viewer_assets', {
      viewer_slug_input: viewerSlug,
    })

    if (error) {
      throw error
    }

    return ((data ?? []) as AssetRow[]).map(toAssetDefinition)
  },

  async uploadAsset(input: UploadAssetInput) {
    const client = getSupabase()
    const session = await requireSession()
    const assetId = crypto.randomUUID()
    const extension = input.file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const storagePath = `${session.id}/${assetId}.${extension}`
    const dimensions = await readFileImageDimensions(input.file)
    const { error: uploadError } = await client.storage
      .from('symbols')
      .upload(storagePath, input.file, { upsert: true })

    if (uploadError) {
      throw uploadError
    }

    const { data: publicData } = client.storage.from('symbols').getPublicUrl(storagePath)
    const { data, error } = await client
      .from('assets')
      .insert({
        id: assetId,
        owner_id: session.id,
        scenario_id: input.scenarioId ?? null,
        kind: input.kind,
        label: input.label,
        source_type: 'upload',
        storage_path: publicData.publicUrl,
        thumbnail_path: publicData.publicUrl,
        tags: input.tags,
        default_size: 48,
        default_rotation: 0,
        intrinsic_width: dimensions.width,
        intrinsic_height: dimensions.height,
        scope: input.scenarioId ? 'scenario' : 'global',
      })
      .select(assetSelect)
      .single()

    if (error) {
      throw error
    }

    return toAssetDefinition(data as AssetRow)
  },

  async listUsers(page = 1, pageSize = 50) {
    const response = await callEdgeFunction<{
      items: AdminUserResponseRow[]
      page: number
      pageSize: number
      total: number
    }>('admin-list-users', { page, pageSize })

    return {
      ...response,
      items: response.items.map(toAdminUserRecord),
    } satisfies AdminUserListResponse
  },

  async createUser(input: CreateUserInput) {
    const response = await callEdgeFunction<{
      user: AdminUserResponseRow
      password: string
    }>('admin-create-user', input)

    return {
      user: toAdminUserRecord(response.user),
      password: response.password,
    } satisfies CreateUserResult
  },

  async rotateUserPassword(userId: string) {
    return callEdgeFunction<{ password: string }>('admin-rotate-user-password', {
      userId,
    })
  },

  async updateUserRole(userId: string, role: UserRole) {
    const response = await callEdgeFunction<{ user: AdminUserResponseRow }>(
      'admin-update-user-role',
      { userId, role },
    )

    return toAdminUserRecord(response.user)
  },

  async listSnapshots(scenarioId: string) {
    const { data, error } = await getSupabase()
      .from('scenario_snapshots')
      .select('id,scenario_id,revision,created_at')
      .eq('scenario_id', scenarioId)
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return ((data ?? []) as SnapshotRow[]).map(toSnapshotRecord)
  },

  async createSnapshot(scenarioId: string) {
    const { data, error } = await getSupabase().rpc('create_scenario_snapshot', {
      scenario_id_input: scenarioId,
    })

    if (error) {
      throw error
    }

    return toSnapshotRecord(
      unwrapRpcSingleRow(
        data as SnapshotRow | SnapshotRow[] | null,
        'Anlık görüntü kaydı alınamadı.',
      ),
    )
  },

  async restoreSnapshot(snapshotId: string) {
    const { data, error } = await getSupabase().rpc('restore_scenario_snapshot', {
      snapshot_id_input: snapshotId,
    })

    if (error) {
      throw error
    }

    return toScenarioRecord(
      unwrapRpcSingleRow(
        data as ScenarioDetailRow | ScenarioDetailRow[] | null,
        'Geri yüklenen senaryo verisi okunamadı.',
      ),
    )
  },
}
