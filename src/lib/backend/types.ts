import type { ScenarioDocument } from '@/features/scenario/model'

export type BackendMode = 'mock' | 'supabase'
export type AssetKind =
  | 'flag'
  | 'air'
  | 'ground'
  | 'sea'
  | 'explosion'
  | 'danger'
  | 'custom'

export type AssetSourceType = 'seed' | 'upload'
export type AssetScope = 'global' | 'scenario'
export type UserRole = 'user' | 'admin'

export type AuthSession = {
  id: string
  username: string
  email?: string
  role: UserRole
}

export type ScenarioLock = {
  holderId: string
  holderUsername: string
  expiresAt: string
}

export type ScenarioRecord = {
  id: string
  title: string
  viewerSlug: string
  updatedAt: string
  revision: number
  lock: ScenarioLock | null
}

export type ScenarioListItem = ScenarioRecord

export type ScenarioDetailRecord = ScenarioRecord & {
  document: ScenarioDocument
}

export type AssetDefinition = {
  id: string
  kind: AssetKind
  label: string
  sourceType: AssetSourceType
  storagePath: string
  thumbnailPath: string
  tags: string[]
  defaultSize: number
  defaultRotation: number
  intrinsicWidth?: number
  intrinsicHeight?: number
  scope: AssetScope
  createdAt: string
}

export type CreateScenarioInput = {
  title?: string
  document?: ScenarioDocument
}

export type UploadAssetInput = {
  file: File
  kind: AssetKind
  label: string
  tags: string[]
  scenarioId?: string
}

export type AdminUserRecord = {
  id: string
  username: string
  role: UserRole
  createdAt: string
}

export type AdminUserListResponse = {
  items: AdminUserRecord[]
  page: number
  pageSize: number
  total: number
}

export type CreateUserInput = {
  username: string
  role?: UserRole
}

export type CreateUserResult = {
  user: AdminUserRecord
  password: string
}

export type ScenarioSnapshotRecord = {
  id: string
  scenarioId: string
  revision: number
  createdAt: string
}

export type ScenarioSubscriptionTarget =
  | { id: string; viewerSlug?: never }
  | { id?: never; viewerSlug: string }

export type ScenarioSubscriptionStatus = 'connecting' | 'subscribed' | 'closed' | 'error'

export type ScenarioSubscriptionHandlers = {
  onError?: (error: Error) => void
  onStatusChange?: (status: ScenarioSubscriptionStatus) => void
}

export interface BackendClient {
  readonly mode: BackendMode
  getSession(): Promise<AuthSession | null>
  onSessionChange(listener: (session: AuthSession | null) => void): () => void
  login(username: string, password: string): Promise<AuthSession>
  logout(): Promise<void>
  listScenarios(): Promise<ScenarioListItem[]>
  createScenario(input?: CreateScenarioInput): Promise<ScenarioDetailRecord>
  deleteScenario(id: string): Promise<void>
  getScenarioById(id: string): Promise<ScenarioDetailRecord | null>
  getScenarioByViewerSlug(viewerSlug: string): Promise<ScenarioDetailRecord | null>
  saveScenario(scenarioId: string, document: ScenarioDocument): Promise<ScenarioDetailRecord>
  updateTitle(scenarioId: string, title: string): Promise<void>
  subscribeToScenario(
    target: ScenarioSubscriptionTarget,
    listener: (record: ScenarioDetailRecord) => void,
    handlers?: ScenarioSubscriptionHandlers,
  ): () => void
  claimEditorLock(scenarioId: string, session: AuthSession): Promise<ScenarioLock>
  refreshEditorLock(scenarioId: string, session: AuthSession): Promise<ScenarioLock>
  releaseEditorLock(scenarioId: string, session: AuthSession): Promise<void>
  rotateViewerSlug(scenarioId: string): Promise<string>
  listAssets(): Promise<AssetDefinition[]>
  listLegacyViewerAssets(viewerSlug: string): Promise<AssetDefinition[]>
  uploadAsset(input: UploadAssetInput): Promise<AssetDefinition>
  listUsers(page?: number, pageSize?: number): Promise<AdminUserListResponse>
  createUser(input: CreateUserInput): Promise<CreateUserResult>
  rotateUserPassword(userId: string): Promise<{ password: string }>
  updateUserRole(userId: string, role: UserRole): Promise<AdminUserRecord>
  listSnapshots(scenarioId: string): Promise<ScenarioSnapshotRecord[]>
  createSnapshot(scenarioId: string): Promise<ScenarioSnapshotRecord>
  restoreSnapshot(snapshotId: string): Promise<ScenarioDetailRecord>
}
