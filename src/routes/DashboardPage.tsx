import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ModeBadge } from '@/components/layout/ModeBadge'
import { SiteCredit } from '@/components/layout/SiteCredit'
import { beginDeckLogout } from '@/features/auth/deckLogout'
import { useAuth } from '@/features/auth/useAuth'
import { useAppTheme } from '@/hooks/useAppTheme'
import { migrateScenarioDocument } from '@/features/scenario/migrate'
import { parseScenarioTransfer } from '@/features/scenario/transfer'
import { backendClient } from '@/lib/backend'
import type { ScenarioListItem, ScenarioLock } from '@/lib/backend/types'
import { appEnv } from '@/lib/env'
import { withBasePath } from '@/lib/paths'
import { formatRelativeDate, readTextFile } from '@/lib/utils'

function getActiveScenarioLock(lock: ScenarioLock | null, nowMs: number) {
  if (!lock) {
    return null
  }

  const expiresAtMs = Date.parse(lock.expiresAt)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return null
  }

  return lock
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { session, isLoading, logout } = useAuth()
  const { uiTheme, setUiTheme, isDarkTheme } = useAppTheme()
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [deletingScenarioId, setDeletingScenarioId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const importInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 10_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  useEffect(() => {
    if (!session) {
      return
    }

    let active = true
    const load = async () => {
      try {
        const records = await backendClient.listScenarios()
        if (active) {
          setScenarios(records)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Senaryolar yüklenemedi.')
        }
      } finally {
        if (active) {
          setLoadingScenarios(false)
        }
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [session])

  if (!isLoading && !session) {
    return <Navigate to="/login" replace />
  }

  async function handleCreateScenario() {
    const scenario = await backendClient.createScenario({
      title: 'Yeni GeoPulse Brifingi',
    })
    navigate(`/scenario/${scenario.id}`)
  }

  async function handleImportScenario(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setImporting(true)
    setImportError(null)

    try {
      const raw = await readTextFile(file)
      const parsed = parseScenarioTransfer(raw)
      const scenario = await backendClient.createScenario({
        title: parsed.title,
        document: migrateScenarioDocument(parsed.document),
      })
      navigate(`/scenario/${scenario.id}`)
    } catch (loadError) {
      setImportError(
        loadError instanceof Error ? loadError.message : 'Senaryo JSON dosyası içe aktarılamadı.',
      )
    } finally {
      event.target.value = ''
      setImporting(false)
    }
  }

  async function handleDeleteScenario(scenario: ScenarioListItem) {
    const activeLock = getActiveScenarioLock(scenario.lock, nowMs)
    const lockNote = activeLock
      ? ` Bu senaryoda editör kilidi ${activeLock.holderUsername} üzerinde görünüyor.`
      : ''
    const confirmed = window.confirm(
      `"${scenario.title}" senaryosunu silmek istiyor musunuz? Bu işlem geri alınmaz.${lockNote}`,
    )

    if (!confirmed) {
      return
    }

    setDeletingScenarioId(scenario.id)
    setError(null)

    try {
      await backendClient.deleteScenario(scenario.id)
      setScenarios((current) => current.filter((item) => item.id !== scenario.id))
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Senaryo silinemedi.')
    } finally {
      setDeletingScenarioId(null)
    }
  }

  async function handleLogout() {
    const deckLogoutPopup = beginDeckLogout()

    try {
      await logout()
    } finally {
      window.setTimeout(() => {
        if (deckLogoutPopup && !deckLogoutPopup.closed) {
          deckLogoutPopup.close()
        }
      }, 2_000)
    }
  }

  return (
    <main className="dashboard-page" data-theme={uiTheme}>
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">GeoPulse Kontrol Merkezi</p>
          <h1>Senaryo kutuphanesi</h1>
          <p className="lede">
            Editör modu tek kullanıcı için kilitlenir. İzleyiciler public read-only link ile
            canlı güncellemeleri görür.
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
          <ModeBadge />
          {appEnv.enableLocalHub ? (
            <Link className="secondary-button" to="/app">
              Hub
            </Link>
          ) : null}
          {session?.role === 'admin' ? (
            <Link className="secondary-button" to="/admin">
              Admin
            </Link>
          ) : null}
          <button className="ghost-button" onClick={() => void handleLogout()}>
            Çıkış
          </button>
          <button
            className="secondary-button"
            disabled={importing}
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            {importing ? 'JSON alınıyor...' : 'JSON yükle'}
          </button>
          <button className="primary-button" onClick={() => void handleCreateScenario()}>
            Yeni senaryo
          </button>
          <input
            accept=".json,application/json"
            hidden
            onChange={(event) => void handleImportScenario(event)}
            ref={importInputRef}
            type="file"
          />
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}
      {importError ? <p className="form-error">{importError}</p> : null}
      {backendClient.mode === 'mock' ? (
        <section className="status-note status-note-warning">
          Demo modunda senaryolar yalnızca bu tarayıcıda saklanır. Cihazlar arası taşıma veya
          yedek için senaryo ekranından JSON dışa aktar kullanın.
        </section>
      ) : null}

      <section className="scenario-grid">
        {loadingScenarios ? <p className="panel-empty">Senaryolar yükleniyor...</p> : null}
        {scenarios.map((scenario) => {
          const activeLock = getActiveScenarioLock(scenario.lock, nowMs)
          const viewerPath = withBasePath(`/view/${scenario.viewerSlug}`)

          return (
            <article className="scenario-card" key={scenario.id}>
              <div className="scenario-card-top">
                <div>
                  <h2>{scenario.title}</h2>
                  <p>Revizyon {scenario.revision}</p>
                </div>
                <span className="scenario-updated">{formatRelativeDate(scenario.updatedAt)}</span>
              </div>

              <div className="scenario-card-body">
                <p>Public izleme:</p>
                <Link className="inline-link" to={`/view/${scenario.viewerSlug}`}>
                  {viewerPath}
                </Link>
                {activeLock ? (
                  <p className="scenario-lock">{activeLock.holderUsername} editör olarak bağlı.</p>
                ) : (
                  <p className="scenario-lock scenario-lock-free">Editör kilidi boş.</p>
                )}
              </div>

              <div className="scenario-card-actions">
                <Link className="secondary-button" to={`/scenario/${scenario.id}`}>
                  Editöre gir
                </Link>
                <Link className="ghost-button" to={`/view/${scenario.viewerSlug}`}>
                  Sunumu aç
                </Link>
                <button
                  className="secondary-button danger-button"
                  disabled={deletingScenarioId === scenario.id}
                  onClick={() => void handleDeleteScenario(scenario)}
                  type="button"
                >
                  {deletingScenarioId === scenario.id ? 'Siliniyor...' : 'Sil'}
                </button>
              </div>
            </article>
          )
        })}
      </section>

      <SiteCredit className="page-credit" />
    </main>
  )
}
