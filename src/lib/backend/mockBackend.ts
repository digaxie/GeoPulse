import { nanoid } from 'nanoid'

import { collectLegacyUploadedAssetIds } from '@/features/assets/assetSnapshots'
import { seedAssets } from '@/features/assets/seedAssets'
import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { migrateScenarioDocument } from '@/features/scenario/migrate'
import { cloneScenarioDocument } from '@/features/scenario/model'
import { createInternalUserEmail, createStrongPassword, validateManagedUsername } from '@/lib/adminCredentials'
import { appEnv } from '@/lib/env'
import { createViewerSlug, readFileImageDimensions, safeJsonParse } from '@/lib/utils'
import type {
  AdminUserListResponse,
  AdminUserRecord,
  AuthSession,
  BackendClient,
  CreateScenarioInput,
  CreateUserInput,
  CreateUserResult,
  ScenarioDetailRecord,
  ScenarioLock,
  ScenarioListItem,
  ScenarioSnapshotRecord,
  ScenarioSubscriptionTarget,
  UserRole,
  AssetDefinition,
} from '@/lib/backend/types'

const STORAGE_PREFIX = 'interaktifmap:mock'
const SCENARIOS_KEY = `${STORAGE_PREFIX}:scenarios`
const ASSETS_KEY = `${STORAGE_PREFIX}:assets`
const SESSION_KEY = `${STORAGE_PREFIX}:session`
const USERS_KEY = `${STORAGE_PREFIX}:users`
const SNAPSHOTS_KEY = `${STORAGE_PREFIX}:snapshots`
const INTERNAL_EVENT = 'interaktifmap:mock:update'
const LOCK_TTL_MS = 60_000

const initialScenarioId = 'seed-afpak'
const seedAdminId = 'mock-admin'

type MockUserRecord = AdminUserRecord & {
  email: string
  password: string
}

type MockSnapshotRecord = ScenarioSnapshotRecord & {
  document: ScenarioDetailRecord['document']
}

type MockSeedCredentials = {
  username: string
  password: string
}

function nowIso() {
  return new Date().toISOString()
}

function resolveMockBackendSeedCredentials(): MockSeedCredentials {
  return {
    username: appEnv.demoUsername || 'admin',
    password: appEnv.demoPassword || 'demo123',
  }
}

export function getMockBackendSeedCredentials(): MockSeedCredentials {
  return resolveMockBackendSeedCredentials()
}

function isLockActive(lock: ScenarioLock | null) {
  return Boolean(lock && new Date(lock.expiresAt).getTime() > Date.now())
}

function getWindowStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage
}

function emitUpdate(detail: { type: 'session' | 'scenarios' | 'assets' | 'users' | 'snapshots'; id?: string }) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(new CustomEvent(INTERNAL_EVENT, { detail }))
}

function toScenarioListItem(record: ScenarioDetailRecord): ScenarioListItem {
  return {
    id: record.id,
    title: record.title,
    viewerSlug: record.viewerSlug,
    updatedAt: record.updatedAt,
    revision: record.revision,
    lock: record.lock,
  }
}

function createSeedScenario(): ScenarioDetailRecord {
  const document = createDefaultScenarioDocument()
  const updatedAt = nowIso()

  return {
    id: initialScenarioId,
    title: 'Afganistan-Pakistan Gerilim Tahtasi',
    viewerSlug: 'afpak-live',
    document,
    updatedAt,
    revision: document.revision,
    lock: null,
  }
}

function createSeedAdminUser(): MockUserRecord {
  const { username, password } = resolveMockBackendSeedCredentials()
  const createdAt = new Date(0).toISOString()

  return {
    id: seedAdminId,
    username,
    email: 'u-seed-admin@users.geopulse.invalid',
    role: 'admin',
    createdAt,
    password,
  }
}

function upgradeSeedScenario(record: ScenarioDetailRecord) {
  if (record.id !== initialScenarioId) {
    return record
  }

  const freshSeed = createSeedScenario()
  const isLegacySeed =
    record.title === freshSeed.title &&
    record.revision <= 8 &&
    record.document.elements.length <= 8

  if (!isLegacySeed) {
    return record
  }

  return {
    ...freshSeed,
    viewerSlug: record.viewerSlug || freshSeed.viewerSlug,
    lock: record.lock,
  }
}

function readScenarios(): ScenarioDetailRecord[] {
  const storage = getWindowStorage()
  if (!storage) {
    return [createSeedScenario()]
  }

  const parsed = safeJsonParse<ScenarioDetailRecord[]>(storage.getItem(SCENARIOS_KEY), [createSeedScenario()])
  return parsed.map((record) =>
    upgradeSeedScenario({
      ...record,
      document: migrateScenarioDocument(record.document),
    }),
  )
}

function writeScenarios(nextScenarios: ScenarioDetailRecord[]) {
  const storage = getWindowStorage()
  if (!storage) {
    return
  }

  storage.setItem(SCENARIOS_KEY, JSON.stringify(nextScenarios))
  emitUpdate({ type: 'scenarios' })
}

function readAssets(): AssetDefinition[] {
  const storage = getWindowStorage()
  if (!storage) {
    return seedAssets
  }

  const uploaded = safeJsonParse<AssetDefinition[]>(storage.getItem(ASSETS_KEY), [])
  return [...seedAssets, ...uploaded]
}

function writeAssets(uploadedAssets: AssetDefinition[]) {
  const storage = getWindowStorage()
  if (!storage) {
    return
  }

  storage.setItem(ASSETS_KEY, JSON.stringify(uploadedAssets))
  emitUpdate({ type: 'assets' })
}

function readUsers(): MockUserRecord[] {
  const storage = getWindowStorage()
  if (!storage) {
    return [createSeedAdminUser()]
  }

  const users = safeJsonParse<MockUserRecord[]>(storage.getItem(USERS_KEY), [createSeedAdminUser()])
  if (users.length === 0) {
    const seeded = [createSeedAdminUser()]
    writeUsers(seeded)
    return seeded
  }

  return users
}

function writeUsers(users: MockUserRecord[]) {
  const storage = getWindowStorage()
  if (!storage) {
    return
  }

  storage.setItem(USERS_KEY, JSON.stringify(users))
  emitUpdate({ type: 'users' })
}

function readSnapshots(): MockSnapshotRecord[] {
  const storage = getWindowStorage()
  if (!storage) {
    return []
  }

  return safeJsonParse<MockSnapshotRecord[]>(storage.getItem(SNAPSHOTS_KEY), []).map((snapshot) => ({
    ...snapshot,
    document: migrateScenarioDocument(snapshot.document),
  }))
}

function writeSnapshots(snapshots: MockSnapshotRecord[]) {
  const storage = getWindowStorage()
  if (!storage) {
    return
  }

  storage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots))
  emitUpdate({ type: 'snapshots' })
}

function readSession(): AuthSession | null {
  const storage = getWindowStorage()
  if (!storage) {
    return null
  }

  return safeJsonParse<AuthSession | null>(storage.getItem(SESSION_KEY), null)
}

function writeSession(session: AuthSession | null) {
  const storage = getWindowStorage()
  if (!storage) {
    return
  }

  if (session) {
    storage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    storage.removeItem(SESSION_KEY)
  }

  emitUpdate({ type: 'session' })
}

function requireSession() {
  const session = readSession()
  if (!session) {
    throw new Error('Oturum bulunamadi.')
  }

  return session
}

function requireAdminSession() {
  const session = requireSession()
  if (session.role !== 'admin') {
    throw new Error('Bu islem yalnizca admin kullanicilar icindir.')
  }

  return session
}

function findScenario(target: ScenarioSubscriptionTarget) {
  const scenarios = readScenarios()
  return scenarios.find((scenario) =>
    'id' in target ? scenario.id === target.id : scenario.viewerSlug === target.viewerSlug,
  )
}

function updateScenario(
  scenarioId: string,
  updater: (record: ScenarioDetailRecord) => ScenarioDetailRecord,
) {
  const scenarios = readScenarios()
  const index = scenarios.findIndex((item) => item.id === scenarioId)

  if (index === -1) {
    throw new Error('Senaryo bulunamadi.')
  }

  scenarios[index] = updater(scenarios[index])
  writeScenarios(scenarios)
  return scenarios[index]
}

function createLock(session: AuthSession): ScenarioLock {
  return {
    holderId: session.id,
    holderUsername: session.username,
    expiresAt: new Date(Date.now() + LOCK_TTL_MS).toISOString(),
  }
}

function toAdminUserRecord(user: MockUserRecord): AdminUserRecord {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  }
}

function toScenarioSnapshotRecord(snapshot: MockSnapshotRecord): ScenarioSnapshotRecord {
  return {
    id: snapshot.id,
    scenarioId: snapshot.scenarioId,
    revision: snapshot.revision,
    createdAt: snapshot.createdAt,
  }
}

function normalizePage(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value)) {
    return fallback
  }

  return Math.max(1, Math.trunc(value))
}

async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export const mockBackend: BackendClient = {
  mode: 'mock',

  async getSession() {
    return readSession()
  },

  onSessionChange(listener) {
    const storageHandler = (event: StorageEvent) => {
      if (event.key === SESSION_KEY) {
        listener(readSession())
      }
    }

    const eventHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string }>).detail
      if (detail.type === 'session') {
        listener(readSession())
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', storageHandler)
      window.addEventListener(INTERNAL_EVENT, eventHandler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', storageHandler)
        window.removeEventListener(INTERNAL_EVENT, eventHandler)
      }
    }
  },

  async login(username, password) {
    const trimmedUsername = validateManagedUsername(username)
    const users = readUsers()
    const user = users.find((item) => item.username.toLowerCase() === trimmedUsername.toLowerCase())

    if (!user || user.password !== password) {
      throw new Error('Kullanici adi veya sifre hatali.')
    }

    const session: AuthSession = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    }

    writeSession(session)
    return session
  },

  async logout() {
    writeSession(null)
  },

  async listScenarios() {
    requireSession()
    return readScenarios()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toScenarioListItem)
  },

  async createScenario(input?: CreateScenarioInput) {
    requireSession()
    const scenarios = readScenarios()
    const document = migrateScenarioDocument(input?.document ?? createDefaultScenarioDocument())
    const scenario: ScenarioDetailRecord = {
      id: nanoid(10),
      title: input?.title?.trim() || 'Yeni Senaryo',
      viewerSlug: createViewerSlug(),
      document,
      updatedAt: nowIso(),
      revision: document.revision,
      lock: null,
    }

    writeScenarios([scenario, ...scenarios])
    return scenario
  },

  async deleteScenario(id) {
    requireSession()
    const scenarios = readScenarios()
    const nextScenarios = scenarios.filter((scenario) => scenario.id !== id)

    if (nextScenarios.length === scenarios.length) {
      throw new Error('Senaryo bulunamadi.')
    }

    writeScenarios(nextScenarios)
  },

  async getScenarioById(id) {
    requireSession()
    return readScenarios().find((scenario) => scenario.id === id) ?? null
  },

  async getScenarioByViewerSlug(viewerSlug) {
    return readScenarios().find((scenario) => scenario.viewerSlug === viewerSlug) ?? null
  },

  async saveScenario(scenarioId, document) {
    requireSession()
    return updateScenario(scenarioId, (record) => ({
      ...record,
      document: migrateScenarioDocument(document),
      updatedAt: nowIso(),
      revision: document.revision,
    }))
  },

  async updateTitle(scenarioId, title) {
    requireSession()
    updateScenario(scenarioId, (record) => ({
      ...record,
      title,
      updatedAt: nowIso(),
    }))
  },

  subscribeToScenario(target, listener, handlers) {
    handlers?.onStatusChange?.('subscribed')

    const notify = () => {
      const record = findScenario(target)
      if (record) {
        listener(record)
      }
    }

    const storageHandler = (event: StorageEvent) => {
      if (event.key === SCENARIOS_KEY) {
        notify()
      }
    }

    const eventHandler = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string }>).detail
      if (detail.type === 'scenarios') {
        notify()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', storageHandler)
      window.addEventListener(INTERNAL_EVENT, eventHandler)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', storageHandler)
        window.removeEventListener(INTERNAL_EVENT, eventHandler)
      }
    }
  },

  async claimEditorLock(scenarioId, session) {
    const updated = updateScenario(scenarioId, (record) => {
      if (isLockActive(record.lock) && record.lock?.holderId !== session.id) {
        throw new Error(
          `${record.lock?.holderUsername ?? 'Baska bir kullanici'} su an editor olarak bagli.`,
        )
      }

      return {
        ...record,
        lock: createLock(session),
      }
    })

    return updated.lock as ScenarioLock
  },

  async refreshEditorLock(scenarioId, session) {
    const updated = updateScenario(scenarioId, (record) => {
      if (record.lock?.holderId && record.lock.holderId !== session.id && isLockActive(record.lock)) {
        throw new Error('Editor kilidi baska bir kullanicida.')
      }

      return {
        ...record,
        lock: createLock(session),
      }
    })

    return updated.lock as ScenarioLock
  },

  async releaseEditorLock(scenarioId, session) {
    updateScenario(scenarioId, (record) => {
      if (record.lock?.holderId !== session.id) {
        return record
      }

      return {
        ...record,
        lock: null,
      }
    })
  },

  async rotateViewerSlug(scenarioId) {
    requireSession()
    const updated = updateScenario(scenarioId, (record) => ({
      ...record,
      viewerSlug: createViewerSlug(),
    }))

    return updated.viewerSlug
  },

  async listAssets() {
    requireSession()
    return readAssets()
  },

  async listLegacyViewerAssets(viewerSlug) {
    const record = await this.getScenarioByViewerSlug(viewerSlug)
    if (!record) {
      return []
    }

    const legacyIds = new Set(collectLegacyUploadedAssetIds(record.document))
    return readAssets().filter(
      (asset) => asset.sourceType === 'upload' && legacyIds.has(asset.id),
    )
  },

  async uploadAsset(input) {
    requireSession()
    const uploadedAssets = readAssets().filter((asset) => asset.sourceType === 'upload')
    const dataUrl = await fileToDataUrl(input.file)
    const dimensions = await readFileImageDimensions(input.file)
    const asset: AssetDefinition = {
      id: nanoid(10),
      kind: input.kind,
      label: input.label.trim() || input.file.name.replace(/\.[^/.]+$/, ''),
      sourceType: 'upload',
      storagePath: dataUrl,
      thumbnailPath: dataUrl,
      tags: input.tags,
      defaultSize: 48,
      defaultRotation: 0,
      intrinsicWidth: dimensions.width,
      intrinsicHeight: dimensions.height,
      scope: input.scenarioId ? 'scenario' : 'global',
      createdAt: nowIso(),
    }

    writeAssets([asset, ...uploadedAssets])
    return asset
  },

  async listUsers(page = 1, pageSize = 50) {
    requireAdminSession()
    const users = readUsers().sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    const normalizedPage = normalizePage(page, 1)
    const normalizedPageSize = Math.min(100, normalizePage(pageSize, 50))
    const startIndex = (normalizedPage - 1) * normalizedPageSize
    const items = users
      .slice(startIndex, startIndex + normalizedPageSize)
      .map(toAdminUserRecord)

    return {
      items,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total: users.length,
    } satisfies AdminUserListResponse
  },

  async createUser(input: CreateUserInput) {
    requireAdminSession()
    const username = validateManagedUsername(input.username)
    const users = readUsers()
    if (users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('Bu kullanici adi zaten kullaniliyor.')
    }

    const password = createStrongPassword()
    const user: MockUserRecord = {
      id: nanoid(12),
      username,
      email: await createInternalUserEmail(username),
      role: input.role ?? 'user',
      createdAt: nowIso(),
      password,
    }

    writeUsers([...users, user])

    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
      },
      password,
    } satisfies CreateUserResult
  },

  async rotateUserPassword(userId: string) {
    requireAdminSession()
    const users = readUsers()
    const index = users.findIndex((user) => user.id === userId)

    if (index === -1) {
      throw new Error('Kullanici bulunamadi.')
    }

    const password = createStrongPassword()
    users[index] = { ...users[index], password }
    writeUsers(users)

    return { password }
  },

  async updateUserRole(userId: string, role: UserRole) {
    const session = requireAdminSession()
    const users = readUsers()
    const index = users.findIndex((user) => user.id === userId)

    if (index === -1) {
      throw new Error('Kullanici bulunamadi.')
    }

    const adminCount = users.filter((user) => user.role === 'admin').length
    if (users[index].role === 'admin' && role === 'user' && adminCount <= 1) {
      throw new Error('Son admin kullanici user rolune dusurulemez.')
    }

    if (users[index].id === session.id && users[index].role === 'admin' && role === 'user' && adminCount <= 1) {
      throw new Error('Kendi admin hesabinizi son admin olarak dusuremezsiniz.')
    }

    users[index] = {
      ...users[index],
      role,
    }
    writeUsers(users)

    const user = toAdminUserRecord(users[index])
    const currentSession = readSession()
    if (currentSession?.id === user.id) {
      writeSession({
        ...currentSession,
        role,
      })
    }

    return user
  },

  async listSnapshots(scenarioId: string) {
    requireSession()
    return readSnapshots()
      .filter((snapshot) => snapshot.scenarioId === scenarioId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(toScenarioSnapshotRecord)
  },

  async createSnapshot(scenarioId: string) {
    const session = requireSession()
    const scenario = await this.getScenarioById(scenarioId)
    if (!scenario) {
      throw new Error('Senaryo bulunamadi.')
    }

    if (scenario.lock?.holderId !== session.id || !isLockActive(scenario.lock)) {
      throw new Error('Aktif editor kilidi gerekli.')
    }

    const snapshot: MockSnapshotRecord = {
      id: nanoid(12),
      scenarioId,
      revision: scenario.revision,
      createdAt: nowIso(),
      document: cloneScenarioDocument(scenario.document),
    }

    writeSnapshots([snapshot, ...readSnapshots()])
    return toScenarioSnapshotRecord(snapshot)
  },

  async restoreSnapshot(snapshotId: string) {
    const session = requireSession()
    const snapshot = readSnapshots().find((item) => item.id === snapshotId)
    if (!snapshot) {
      throw new Error('Snapshot bulunamadi.')
    }

    const scenario = await this.getScenarioById(snapshot.scenarioId)
    if (!scenario) {
      throw new Error('Senaryo bulunamadi.')
    }

    if (scenario.lock?.holderId !== session.id || !isLockActive(scenario.lock)) {
      throw new Error('Aktif editor kilidi gerekli.')
    }

    return updateScenario(snapshot.scenarioId, (record) => {
      const nextRevision = record.revision + 1
      const document = migrateScenarioDocument({
        ...cloneScenarioDocument(snapshot.document),
        revision: nextRevision,
      })

      return {
        ...record,
        document,
        revision: nextRevision,
        updatedAt: nowIso(),
      }
    })
  },
}
