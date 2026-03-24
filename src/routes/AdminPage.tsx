import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'
import { useAuth } from '@/features/auth/useAuth'
import { backendClient } from '@/lib/backend'
import type { AdminUserRecord, UserRole } from '@/lib/backend/types'
import { formatRelativeDate } from '@/lib/utils'

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

        setError(loadError instanceof Error ? loadError.message : 'Kullanicilar yuklenemedi.')
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
        submitError instanceof Error ? submitError.message : 'Kullanici olusturulamadi.',
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
        rotateError instanceof Error ? rotateError.message : 'Sifre yenilenemedi.',
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

  return (
    <main className="admin-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">GeoPulse Admin</p>
          <h1>Kullanici Yonetimi</h1>
          <p className="lede">
            Yeni hesap olusturun, rollerini guncelleyin ve ihtiyac halinde guclu sifre uretin.
          </p>
        </div>

        <div className="dashboard-actions">
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
              {revealedPassword.reason === 'create' ? 'Yeni Sifre' : 'Rotate Edilen Sifre'}
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
              Sifreyi kopyala
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
            Bu sifre yalnizca bir kez gosterilir. Mevcut access tokenlar suresi dolana kadar aktif kalabilir.
          </p>
        </section>
      ) : null}

      <section className="admin-grid">
        <section className="admin-card">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Yeni Kullanici</p>
              <h2>Hesap olustur</h2>
            </div>
          </div>

          <form className="admin-form" onSubmit={handleCreateUser}>
            <label>
              <span>Kullanici adi</span>
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
              {submittingCreate ? 'Olusturuluyor...' : 'Kullanici olustur'}
            </button>
          </form>
        </section>

        <section className="admin-card admin-card-wide">
          <div className="admin-card-header">
            <div>
              <p className="eyebrow">Kullanicilar</p>
              <h2>Liste</h2>
            </div>
            <p className="panel-empty">{total} kayit</p>
          </div>

          {loadingUsers ? (
            <p className="panel-empty">Kullanicilar yukleniyor...</p>
          ) : (
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Kullanici</th>
                    <th>Rol</th>
                    <th>Olusturma</th>
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
                          {busyUserId === user.id ? 'Bekleniyor...' : 'Sifre rotate et'}
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

      <SiteCredit className="page-credit" />
    </main>
  )
}
