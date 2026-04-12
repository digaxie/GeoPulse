import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'
import { useAuth } from '@/features/auth/useAuth'
import { createDefaultHubModuleConfigs } from '@/features/hub/modules'
import { useAppTheme } from '@/hooks/useAppTheme'
import { backendClient } from '@/lib/backend'
import { getSupabaseAccessToken } from '@/lib/backend/supabaseBackend'
import type {
  AdminUserRecord,
  HubModuleConfigRecord,
  UpdateHubModuleConfigInput,
  UserRole,
} from '@/lib/backend/types'
import { appEnv } from '@/lib/env'
import { formatRelativeDate } from '@/lib/utils'

type DeckAccountStatus = {
  label: string
  active: boolean
  cooldownUntil: number
  lastError: string | null
}

type DeckServiceInfo = {
  slug: string
  running: boolean
}

type DeckUserStat = {
  user_id: string
  username: string
  listCount: number
}

type DeckStats = {
  twitterAccounts: DeckAccountStatus[]
  activeServices: DeckServiceInfo[]
  userStats: DeckUserStat[]
} | null

const PAGE_SIZE = 25

type RevealedPassword = {
  username: string
  password: string
  reason: 'create' | 'rotate'
}

type HubModuleAdminDraft = UpdateHubModuleConfigInput & {
  updatedAt: string | null
}

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value)
}

function mergeHubModuleDrafts(
  defaults: UpdateHubModuleConfigInput[],
  records: HubModuleConfigRecord[],
): HubModuleAdminDraft[] {
  const recordMap = new Map(records.map((record) => [record.id, record]))

  return defaults.map((defaultConfig) => {
    const record = recordMap.get(defaultConfig.id)

    return {
      ...defaultConfig,
      ...(record ?? {}),
      updatedAt: record?.updatedAt ?? null,
    }
  })
}

export function AdminPage() {
  const { session, isLoading } = useAuth()
  const defaultHubModuleConfigs = useMemo(
    () =>
      createDefaultHubModuleConfigs({
        enableLocalHub: appEnv.enableLocalHub,
        deckLocalUrl: appEnv.deckLocalUrl,
      }),
    [],
  )
  const [users, setUsers] = useState<AdminUserRecord[]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE)
  const [total, setTotal] = useState(0)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createUsername, setCreateUsername] = useState('')
  const [createRole, setCreateRole] = useState<UserRole>('user')
  const [submittingCreate, setSubmittingCreate] = useState(false)
  const [revealedPassword, setRevealedPassword] = useState<RevealedPassword | null>(null)
  const [busyUserId, setBusyUserId] = useState<string | null>(null)
  const [deckStats, setDeckStats] = useState<DeckStats>(null)
  const [deckError, setDeckError] = useState<string | null>(null)
  const [deckLoading, setDeckLoading] = useState(true)
  const [hubModules, setHubModules] = useState<HubModuleAdminDraft[]>(
    mergeHubModuleDrafts(defaultHubModuleConfigs, []),
  )
  const [hubModuleLoading, setHubModuleLoading] = useState(true)
  const [hubModuleError, setHubModuleError] = useState<string | null>(null)
  const [hubModuleNotice, setHubModuleNotice] = useState<string | null>(null)
  const [busyModuleId, setBusyModuleId] = useState<string | null>(null)

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total])

  useEffect(() => {
    if (!session || session.role !== 'admin') {
      return
    }

    let active = true
    setLoadingUsers(true)
    setError(null)

    void backendClient
      .listUsers(page, pageSize)
      .then((response) => {
        if (!active) {
          return
        }

        setUsers(response.items)
        setPage(response.page)
        setPageSize(response.pageSize)
        setTotal(response.total)
      })
      .catch((loadError) => {
        if (!active) {
          return
        }

      setError(loadError instanceof Error ? loadError.message : 'Kullanıcılar yüklenemedi.')
      })
      .finally(() => {
        if (active) {
          setLoadingUsers(false)
        }
      })

    return () => {
      active = false
    }
  }, [page, pageSize, session])

  useEffect(() => {
    if (!session || session.role !== 'admin') return

    let active = true
    setDeckLoading(true)
    setDeckError(null)

    const deckUrl = appEnv.deckLocalUrl.replace(/\/+$/u, '')

    void getSupabaseAccessToken()
      .then((token: string) =>
        fetch(`${deckUrl}/api/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      .then(async (r: Response) => {
        if (!r.ok) throw new Error(`Deck API: ${r.status}`)
        return r.json() as Promise<NonNullable<DeckStats>>
      })
      .then((data: NonNullable<DeckStats>) => { if (active) setDeckStats(data) })
      .catch((e: unknown) => { if (active) setDeckError(e instanceof Error ? e.message : 'Deck bilgileri alinamadi') })
      .finally(() => { if (active) setDeckLoading(false) })

    return () => { active = false }
  }, [session])

  useEffect(() => {
    if (!session || session.role !== 'admin') {
      return
    }

    let active = true
    setHubModuleLoading(true)
    setHubModuleError(null)

    void backendClient
      .listHubModuleConfigs()
      .then((records) => {
        if (!active) {
          return
        }

        setHubModules(mergeHubModuleDrafts(defaultHubModuleConfigs, records))
      })
      .catch((loadError) => {
        if (!active) {
          return
        }

        setHubModuleError(
          loadError instanceof Error ? loadError.message : 'Hub kart ayarlari yuklenemedi.',
        )
        setHubModules(mergeHubModuleDrafts(defaultHubModuleConfigs, []))
      })
      .finally(() => {
        if (active) {
          setHubModuleLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [defaultHubModuleConfigs, session])

  if (!isLoading && !session) {
    return <Navigate to="/login" replace />
  }

  if (!isLoading && session?.role !== 'admin') {
    return <Navigate to="/app" replace />
  }

  async function refreshUsers() {
    const response = await backendClient.listUsers(page, pageSize)
    setUsers(response.items)
    setPage(response.page)
    setPageSize(response.pageSize)
    setTotal(response.total)
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmittingCreate(true)
    setError(null)
    setRevealedPassword(null)

    try {
      const result = await backendClient.createUser({
        username: createUsername,
        role: createRole,
      })
      setCreateUsername('')
      setCreateRole('user')
      setRevealedPassword({
        username: result.user.username,
        password: result.password,
        reason: 'create',
      })
      await refreshUsers()
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Kullanıcı oluşturulamadı.',
      )
    } finally {
      setSubmittingCreate(false)
    }
  }

  async function handleRotatePassword(user: AdminUserRecord) {
    setBusyUserId(user.id)
    setError(null)
    setRevealedPassword(null)

    try {
      const result = await backendClient.rotateUserPassword(user.id)
      setRevealedPassword({
        username: user.username,
        password: result.password,
        reason: 'rotate',
      })
    } catch (rotateError) {
      setError(
        rotateError instanceof Error ? rotateError.message : 'Şifre yenilenemedi.',
      )
    } finally {
      setBusyUserId(null)
    }
  }

  async function handleRoleChange(user: AdminUserRecord, nextRole: UserRole) {
    if (user.role === nextRole) {
      return
    }

    setBusyUserId(user.id)
    setError(null)

    try {
      const updated = await backendClient.updateUserRole(user.id, nextRole)
      setUsers((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (roleError) {
      setError(
        roleError instanceof Error ? roleError.message : 'Rol guncellenemedi.',
      )
    } finally {
      setBusyUserId(null)
    }
  }

  function handleHubModuleChange(
    moduleId: string,
    field: keyof UpdateHubModuleConfigInput,
    value: string,
  ) {
    setHubModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...module,
              [field]: value,
            }
          : module,
      ),
    )
    setHubModuleNotice(null)
    setHubModuleError(null)
  }

  function handleResetHubModule(moduleId: string) {
    const fallback = defaultHubModuleConfigs.find((module) => module.id === moduleId)
    if (!fallback) {
      return
    }

    setHubModules((current) =>
      current.map((module) =>
        module.id === moduleId
          ? {
              ...fallback,
              updatedAt: module.updatedAt,
            }
          : module,
      ),
    )
    setHubModuleNotice(null)
    setHubModuleError(null)
  }

  async function handleSaveHubModule(
    event: React.FormEvent<HTMLFormElement>,
    moduleId: string,
  ) {
    event.preventDefault()
    const draft = hubModules.find((module) => module.id === moduleId)
    if (!draft) {
      return
    }

    setBusyModuleId(moduleId)
    setHubModuleError(null)
    setHubModuleNotice(null)

    try {
      const saved = await backendClient.updateHubModuleConfig({
        id: draft.id,
        controlState: draft.controlState,
        title: draft.title,
        description: draft.description,
        ctaLabel: draft.ctaLabel,
        secondaryCtaLabel: draft.secondaryCtaLabel,
        badge: draft.badge,
        helperText: draft.helperText,
        warningText: draft.warningText,
        statusLabel: draft.statusLabel,
      })

      setHubModules((current) =>
        current.map((module) =>
          module.id === moduleId
            ? {
                ...module,
                ...saved,
                updatedAt: saved.updatedAt,
              }
            : module,
        ),
      )
      setHubModuleNotice(`${saved.title} karti kaydedildi.`)
    } catch (saveError) {
      setHubModuleError(
        saveError instanceof Error ? saveError.message : 'Hub kart ayari kaydedilemedi.',
      )
    } finally {
      setBusyModuleId(null)
    }
  }

  const { uiTheme, setUiTheme, isDarkTheme } = useAppTheme()

  return (
    <main className="admin-page" data-theme={uiTheme}>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">GeoPulse Admin</p>
          <h1>Kullanıcı Yönetimi</h1>
          <p className="lede">
            Yeni hesap oluşturun, rollerini güncelleyin ve ihtiyaç halinde güçlü şifre üretin.
          </p>
        </div>

        <div className="dashboard-actions">
          <button
            aria-pressed={isDarkTheme}
            className={`secondary-button theme-toggle-button${isDarkTheme ? ' theme-toggle-button--active' : ''}`}
            onClick={() => setUiTheme(isDarkTheme ? 'light' : 'dark')}
            type="button"
          >
            <span aria-hidden="true" className="theme-toggle-button-track">
              <span className="theme-toggle-button-thumb" />
              <span className="theme-toggle-button-glow" />
            </span>
            <span className="theme-toggle-button-copy">
              <span className="theme-toggle-button-label">Tema</span>
              <span className="theme-toggle-button-mode">{isDarkTheme ? 'Koyu' : 'Açık'}</span>
            </span>
          </button>
          <Link className="secondary-button" to="/app">
            Senaryolara don
          </Link>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {hubModuleError ? <p className="form-error">{hubModuleError}</p> : null}
      {hubModuleNotice ? <p className="status-note">{hubModuleNotice}</p> : null}

      {revealedPassword ? (
        <section className="status-note status-note-warning admin-password-card">
          <div>
            <p className="eyebrow">
                {revealedPassword.reason === 'create' ? 'Yeni Şifre' : 'Yenilenen Şifre'}
            </p>
            <strong>{revealedPassword.username}</strong>
            <p className="lede admin-password-value">{revealedPassword.password}</p>
          </div>
          <div className="admin-password-actions">
            <button
              className="secondary-button"
              onClick={() => void copyToClipboard(revealedPassword.password)}
              type="button"
            >
              Şifreyi kopyala
            </button>
            <button
              className="ghost-button"
              onClick={() => setRevealedPassword(null)}
              type="button"
            >
              Gizle
            </button>
          </div>
          <p className="panel-empty">
            Bu şifre yalnızca bir kez gösterilir. Mevcut access token'lar süresi dolana kadar aktif kalabilir.
          </p>
        </section>
      ) : null}

      <section className="admin-grid">
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Yeni Kullanıcı</p>
              <h2>Hesap oluştur</h2>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleCreateUser}>
            <label>
              <span>Kullanıcı adı</span>
              <input
                value={createUsername}
                onChange={(event) => setCreateUsername(event.target.value)}
                placeholder="analist"
              />
            </label>

            <label>
              <span>Rol</span>
              <select
                value={createRole}
                onChange={(event) => setCreateRole(event.target.value as UserRole)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </label>

            <button
              className="primary-button"
              disabled={submittingCreate}
              type="submit"
            >
              {submittingCreate ? 'Oluşturuluyor...' : 'Kullanıcı oluştur'}
            </button>
          </form>
        </section>

        <section className="admin-card admin-card-wide">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Kullanıcılar</p>
              <h2>Liste</h2>
            </div>
            <p className="panel-empty">{total} kayıt</p>
          </div>

          {loadingUsers ? (
            <p className="panel-empty">Kullanıcılar yükleniyor...</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                  <th>Kullanıcı</th>
                    <th>Rol</th>
                  <th>Oluşturma</th>
                    <th>Aksiyonlar</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username}</td>
                      <td>
                        <select
                          disabled={busyUserId === user.id}
                          value={user.role}
                          onChange={(event) =>
                            void handleRoleChange(user, event.target.value as UserRole)
                          }
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td>{formatRelativeDate(user.createdAt)}</td>
                      <td>
                        <button
                          className="secondary-button"
                          disabled={busyUserId === user.id}
                          onClick={() => void handleRotatePassword(user)}
                          type="button"
                        >
                      {busyUserId === user.id ? 'Bekleniyor...' : 'Şifreyi yenile'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="admin-pagination">
            <button
              className="ghost-button"
              disabled={page <= 1 || loadingUsers}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              Onceki
            </button>
            <span className="panel-empty">
              Sayfa {page} / {totalPages}
            </span>
            <button
              className="ghost-button"
              disabled={page >= totalPages || loadingUsers}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              type="button"
            >
              Sonraki
            </button>
          </div>
        </section>
      </section>

      <section className="admin-card admin-card-full" style={{ marginTop: '2rem' }}>
        <div className="admin-card-header">
          <div>
            <p className="eyebrow">Hub Modulleri</p>
            <h2>Kart Kontrolleri</h2>
          </div>
          <p className="panel-empty">
            Hub uzerindeki kartlari gizle, pasife al veya metinlerini degistir.
          </p>
        </div>

        {hubModuleLoading ? (
          <p className="panel-empty">Kart ayarlari yukleniyor...</p>
        ) : (
          <div className="admin-module-grid">
            {hubModules.map((module) => {
              const isBusy = busyModuleId === module.id

              return (
                <form
                  className="admin-module-editor"
                  key={module.id}
                  onSubmit={(event) => void handleSaveHubModule(event, module.id)}
                >
                  <div className="admin-module-editor-head">
                    <div>
                      <p className="eyebrow">{module.id}</p>
                      <h3>{module.title}</h3>
                    </div>
                    <span className="panel-empty">
                      {module.updatedAt ? `Son kayit ${formatRelativeDate(module.updatedAt)}` : 'Varsayilan'}
                    </span>
                  </div>

                  <div className="admin-module-editor-grid">
                    <label>
                      <span>Durum</span>
                      <select
                        value={module.controlState}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'controlState', event.target.value)
                        }
                      >
                        <option value="enabled">enabled</option>
                        <option value="disabled">disabled</option>
                        <option value="hidden">hidden</option>
                      </select>
                    </label>

                    <label>
                      <span>Durum etiketi</span>
                      <input
                        value={module.statusLabel}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'statusLabel', event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Kart basligi</span>
                      <input
                        value={module.title}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'title', event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Badge</span>
                      <input
                        value={module.badge}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'badge', event.target.value)
                        }
                      />
                    </label>

                    <label className="admin-module-editor-span-2">
                      <span>Aciklama</span>
                      <textarea
                        value={module.description}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'description', event.target.value)
                        }
                      />
                    </label>

                    <label className="admin-module-editor-span-2">
                      <span>Yardimci metin</span>
                      <textarea
                        value={module.helperText}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'helperText', event.target.value)
                        }
                      />
                    </label>

                    <label className="admin-module-editor-span-2">
                      <span>Uyari metni</span>
                      <textarea
                        value={module.warningText}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'warningText', event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Ana buton</span>
                      <input
                        value={module.ctaLabel}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'ctaLabel', event.target.value)
                        }
                      />
                    </label>

                    <label>
                      <span>Ikincil buton</span>
                      <input
                        value={module.secondaryCtaLabel}
                        onChange={(event) =>
                          handleHubModuleChange(module.id, 'secondaryCtaLabel', event.target.value)
                        }
                        placeholder={module.id === 'scenarios' ? '+ Yeni senaryo' : 'Opsiyonel'}
                      />
                    </label>
                  </div>

                  <div className="admin-module-editor-actions">
                    <button
                      className="ghost-button"
                      onClick={() => handleResetHubModule(module.id)}
                      type="button"
                    >
                      Varsayilana don
                    </button>
                    <button className="primary-button" disabled={isBusy} type="submit">
                      {isBusy ? 'Kaydediliyor...' : 'Kaydet'}
                    </button>
                  </div>
                </form>
              )
            })}
          </div>
        )}
      </section>

      <section className="admin-grid" style={{ marginTop: '2rem' }}>
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">GeoPulse Deck</p>
              <h2>Twitter Hesaplari</h2>
            </div>
          </div>

          {deckLoading ? (
            <p className="panel-empty">Deck bilgileri yukleniyor...</p>
          ) : deckError ? (
            <p className="form-error">{deckError}</p>
          ) : !deckStats ? (
            <p className="panel-empty">Deck verisi alinamadi.</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Hesap</th>
                    <th>Durum</th>
                    <th>Son Hata</th>
                  </tr>
                </thead>
                <tbody>
                  {deckStats.twitterAccounts.map((account) => (
                    <tr key={account.label}>
                      <td>{account.label}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: account.active ? '#22c55e' : '#ef4444',
                            marginRight: 6,
                          }}
                        />
                        {account.active
                          ? 'Aktif'
                          : `Cooldown (${Math.ceil(Math.max(0, account.cooldownUntil - Date.now()) / 1000)}s)`}
                      </td>
                      <td style={{ fontSize: '0.85em', opacity: 0.7 }}>
                        {account.lastError ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-card admin-card-wide">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">GeoPulse Deck</p>
              <h2>Servisler & Kullanicilar</h2>
            </div>
          </div>

          {deckLoading ? (
            <p className="panel-empty">Yukleniyor...</p>
          ) : deckError ? (
            <p className="form-error">{deckError}</p>
          ) : !deckStats ? (
            <p className="panel-empty">Veri yok.</p>
          ) : (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
                  Aktif Servisler ({deckStats.activeServices.filter((s) => s.running).length}/{deckStats.activeServices.length})
                </p>
                {deckStats.activeServices.length === 0 ? (
                  <p className="panel-empty">Aktif servis yok — kullanici baglaninca baslar.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {deckStats.activeServices.map((service) => (
                      <span
                        key={service.slug}
                        style={{
                          padding: '0.25rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.85em',
                          background: service.running
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(239,68,68,0.15)',
                          color: service.running ? '#22c55e' : '#ef4444',
                          border: `1px solid ${service.running ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        }}
                      >
                        {service.slug}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <p className="eyebrow" style={{ marginBottom: '0.5rem' }}>
                Kullanici Liste Sayilari
              </p>
              {deckStats.userStats.length === 0 ? (
                <p className="panel-empty">Henuz kullanici listesi yok.</p>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Kullanici</th>
                        <th>Liste Sayisi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deckStats.userStats.map((stat) => (
                        <tr key={stat.user_id}>
                          <td>{stat.username}</td>
                          <td>{stat.listCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </section>

      <SiteCredit className="page-credit" />
    </main>
  )
}
