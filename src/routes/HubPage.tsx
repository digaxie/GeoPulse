import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ModeBadge } from '@/components/layout/ModeBadge'
import { SiteCredit } from '@/components/layout/SiteCredit'
import { beginDeckLogout } from '@/features/auth/deckLogout'
import { useAuth } from '@/features/auth/useAuth'
import { useAppTheme } from '@/hooks/useAppTheme'
import {
  createHubModules,
  type HubModuleDefinition,
} from '@/features/hub/modules'
import { backendClient, getDeckLaunchAccessToken } from '@/lib/backend'
import type { ScenarioListItem, ScenarioLock } from '@/lib/backend/types'
import { appEnv } from '@/lib/env'
import { withBasePath } from '@/lib/paths'
import { formatRelativeDate } from '@/lib/utils'

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

async function pingExternalEntry(url: string) {
  await fetch(url, {
    method: 'GET',
    mode: 'no-cors',
    cache: 'no-store',
  })
}

function openExternalModuleWindow() {
  const popup = window.open('', '_blank')
  if (!popup) {
    throw new Error('POPUP_BLOCKED')
  }

  try {
    popup.opener = null
  } catch {
    // noop
  }

  return popup
}

function buildDeckHandoffUrl(baseUrl: string, accessToken: string) {
  const target = new URL('/auth/handoff', baseUrl)
  target.searchParams.set('token', accessToken)
  target.searchParams.set('returnTo', '/')
  return target.toString()
}

export function HubPage() {
  const navigate = useNavigate()
  const { session, isLoading, logout } = useAuth()
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const [launchingModuleId, setLaunchingModuleId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const { uiTheme, setUiTheme, isDarkTheme } = useAppTheme()

  const modules = useMemo(
    () =>
      createHubModules({
        enableLocalHub: appEnv.enableLocalHub,
        deckLocalUrl: appEnv.deckLocalUrl,
      }),
    [appEnv.deckLocalUrl, appEnv.enableLocalHub],
  )

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
          setError(null)
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Senaryolar yuklenemedi.')
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

  const recentScenarios = scenarios.slice(0, 4)

  async function handleCreateScenario() {
    setError(null)
    try {
      const scenario = await backendClient.createScenario({
        title: 'Yeni GeoPulse Brifingi',
      })
      navigate(`/scenario/${scenario.id}`)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Senaryo olusturulamadi.')
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

  async function handleOpenExternalModule(module: HubModuleDefinition) {
    if (!module.href) {
      return
    }

    setLaunchError(null)
    setLaunchingModuleId(module.id)
    let popup: Window | null = null

    try {
      popup = openExternalModuleWindow()

      let targetUrl = module.href
      if (module.healthCheckUrl) {
        await pingExternalEntry(module.healthCheckUrl)
      }

      if (module.id === 'deck' && backendClient.mode === 'supabase') {
        const accessToken = await getDeckLaunchAccessToken()
        if (!accessToken) {
          throw new Error('DECK_TOKEN_UNAVAILABLE')
        }
        targetUrl = buildDeckHandoffUrl(module.href, accessToken)
      }

      popup.location.replace(targetUrl)
      popup.focus()
    } catch (launchIssue) {
      popup?.close()

      if (launchIssue instanceof Error && launchIssue.message === 'POPUP_BLOCKED') {
        setLaunchError('Deck yeni sekmede acilamadi. Tarayici popup engelini kontrol edin.')
      } else if (
        launchIssue instanceof Error &&
        launchIssue.message === 'DECK_TOKEN_UNAVAILABLE'
      ) {
        setLaunchError('Deck oturumu olusturulamadi. Lutfen tekrar giris yapin.')
      } else if (module.healthCheckUrl) {
        setLaunchError(
          'Deck servisine erisilemedi. `twitter-canli-deneme` localde acik mi kontrol edin.',
        )
      } else {
        setLaunchError('Deck yeni sekmede acilamadi.')
      }
    } finally {
      setLaunchingModuleId(null)
    }
  }

  return (
    <main className="modern-hub-page" data-theme={uiTheme}>
      <header className="modern-hub-hero">
        <div className="modern-hub-hero-copy">
          <p className="modern-eyebrow">GeoPulse Tactical Hub</p>
          <h1>Kontrol Merkezi</h1>
          <p className="modern-lede">
            Senaryolar, operasyonlar ve saha modülleri sistemde yüklendi.
          </p>
          <div className="modern-hub-stats">
            <span className="modern-hub-stat">
              <strong>{loadingScenarios ? '...' : scenarios.length}</strong>
              <span>Senaryo</span>
            </span>
            <span className="modern-hub-stat">
              <strong>{session?.username ?? '-'}</strong>
              <span>Operatör</span>
            </span>
            <span className="modern-hub-stat">
              <strong>{backendClient.mode}</strong>
              <span>Bağlantı</span>
            </span>
          </div>
        </div>

        <div className="modern-hub-hero-actions">
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
          {session?.role === 'admin' ? (
            <Link className="modern-secondary-button" to="/admin">
              Yönetim
            </Link>
          ) : null}
          <button className="modern-ghost-button" onClick={() => void handleLogout()} type="button">
            Çıkış
          </button>
        </div>
      </header>

      {error ? <p className="workspace-alert">{error}</p> : null}
      {launchError ? <p className="workspace-alert">{launchError}</p> : null}

      <section className="modern-hub-grid">
        {modules.map((module) => {
          const isLaunching = launchingModuleId === module.id
          const internalHref =
            module.entryKind === 'internal' && module.href?.startsWith('/')
              ? withBasePath(module.href)
              : module.href

          return (
            <article
              className={`modern-hub-card modern-hub-card--${module.accent}`}
              key={module.id}
            >
              <div className="modern-hub-card-decor" />
              <div className="modern-hub-card-inner">
                <div className="modern-hub-card-top">
                  <span className="modern-hub-card-badge">{module.badge}</span>
                  <span className={`modern-hub-card-status modern-hub-card-status--${module.status}`}>
                    {module.status === 'active' ? 'Aktif' : 'Beklemede'}
                  </span>
                </div>

                <div className="modern-hub-card-body">
                  <h2>{module.title}</h2>
                  <p>{module.description}</p>
                  {module.helperText ? (
                    <p className="modern-hub-card-helper">{module.helperText}</p>
                  ) : null}
                </div>

                <div className="modern-hub-card-actions">
                  {module.entryKind === 'internal' && internalHref ? (
                    <Link className="modern-primary-button" to={internalHref}>
                      {module.ctaLabel}
                    </Link>
                  ) : null}

                  {module.entryKind === 'external' && module.href ? (
                    <button
                      className="modern-primary-button"
                      disabled={isLaunching}
                      onClick={() => void handleOpenExternalModule(module)}
                      type="button"
                    >
                      {isLaunching ? 'Bağlanıyor...' : module.ctaLabel}
                    </button>
                  ) : null}

                  {module.entryKind === 'disabled' ? (
                    <button className="modern-secondary-button" disabled type="button">
                      {module.ctaLabel}
                    </button>
                  ) : null}

                  {module.id === 'scenarios' ? (
                    <button
                      className="modern-secondary-button"
                      onClick={() => void handleCreateScenario()}
                      type="button"
                    >
                      + Yeni senaryo
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          )
        })}
      </section>

      <section className="modern-hub-panel">
        <div className="modern-hub-panel-head">
          <div>
            <p className="modern-eyebrow">Hızlı Giriş</p>
            <h2>Son Senaryolar</h2>
          </div>
          <Link className="modern-secondary-button" to="/app/scenarios">
            Tüm senaryolar
          </Link>
        </div>

        {loadingScenarios ? <p className="panel-empty">Senaryolar yükleniyor...</p> : null}
        {!loadingScenarios && recentScenarios.length === 0 ? (
          <div className="modern-hub-empty">
            <p className="panel-empty">Sistemde hazirda senaryo bulunmamaktadir.</p>
            <button className="modern-primary-button" onClick={() => void handleCreateScenario()} type="button">
              + İlk senaryoyu oluştur
            </button>
          </div>
        ) : null}

        {recentScenarios.length > 0 ? (
          <div className="modern-hub-recent-list">
            {recentScenarios.map((scenario) => {
              const activeLock = getActiveScenarioLock(scenario.lock, nowMs)

              return (
                <article className="modern-hub-recent-card" key={scenario.id}>
                  <div className="modern-hub-recent-copy">
                    <h3>{scenario.title}</h3>
                    <p>
                      Rev. {scenario.revision} · {formatRelativeDate(scenario.updatedAt)}
                    </p>
                    {activeLock ? (
                      <span className="modern-scenario-lock">
                        {activeLock.holderUsername} düzenliyor
                      </span>
                    ) : null}
                  </div>

                  <div className="modern-hub-recent-actions">
                    <Link className="modern-secondary-button" to={`/scenario/${scenario.id}`}>
                      Düzenle
                    </Link>
                    <Link className="modern-ghost-button" to={`/view/${scenario.viewerSlug}`}>
                      Görüntüle
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>

      <SiteCredit className="page-credit" />
    </main>
  )
}
