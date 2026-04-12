import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'
import { useAuth } from '@/features/auth/useAuth'
import { useAppTheme } from '@/hooks/useAppTheme'
import { backendClient } from '@/lib/backend'
import { getSupabaseAccessToken } from '@/lib/backend/supabaseBackend'
import type { AdminUserRecord, UserRole } from '@/lib/backend/types'
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

async function copyToClipboard(value: string) {
  await navigator.clipboard.writeText(value)
}

export function AdminPage() {
  const { session, isLoading } = useAuth()
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
