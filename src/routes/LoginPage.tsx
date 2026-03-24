import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { ModeBadge } from '@/components/layout/ModeBadge'
import { SiteCredit } from '@/components/layout/SiteCredit'
import { useAuth } from '@/features/auth/useAuth'
import { appEnv } from '@/lib/env'
import { withBasePath } from '@/lib/paths'

export function LoginPage() {
  const navigate = useNavigate()
  const { session, isLoading, login, backendMode } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isDemoMode = backendMode === 'mock'

  if (!isLoading && session) {
    return <Navigate to="/app" replace />
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await login(username, password)
      navigate('/app')
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Giriş sırasında hata oluştu.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  function fillDemoCredentials() {
    setUsername(appEnv.demoUsername || 'admin')
    setPassword(appEnv.demoPassword || 'demo123')
  }

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <div className="auth-hero-visual">
          <img
            alt="GeoPulse harita arayüzü görseli"
            className="auth-hero-image"
            src={withBasePath('/geopulse-login-hero.svg')}
          />
        </div>

        <div className="auth-hero-copy">
          <p className="eyebrow">GeoPulse</p>
          <h1>Canlı gündem ve jeopolitik yayınlar için harita masası.</h1>
          <p className="lede">
            Senaryoları yönetin, sembolleri yerleştirin ve canlı sunum bağlantısıyla aynı harita
            üzerinden briefing akışını yönetin.
          </p>

          <div className="auth-hero-tags">
            <span className="auth-hero-tag">Canlı senaryo yönetimi</span>
            <span className="auth-hero-tag">Harita üstü briefing</span>
            <span className="auth-hero-tag">Anlık viewer senkronu</span>
          </div>
        </div>

        <ModeBadge />

        {isDemoMode ? (
          <div className="status-note status-note-warning">
            Bu yayın şu an demo modunda. Giriş ve senaryolar bu cihazdaki tarayıcı hafızasında
            çalışır; cihaz değişikliği için JSON dışa aktar kullanın.
          </div>
        ) : null}
      </section>

      <section className="auth-card">
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-form-heading">
            <p className="eyebrow">GeoPulse Access</p>
            <h2>Kontrol merkezine giriş yapın</h2>
            <p className="lede">
              Editör, senaryo yönetimi ve canlı sunum akışına tek noktadan erişin.
            </p>
          </div>

          <label>
            <span>Kullanıcı adı</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="admin"
            />
          </label>

          <label>
            <span>Şifre</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="********"
              type="password"
            />
          </label>

          {isDemoMode ? (
            <p className="panel-empty">
              Demo modunda herhangi bir kullanıcı adı ve şifre kullanabilirsiniz.
            </p>
          ) : null}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="button-row">
            <button className="primary-button" disabled={submitting || isLoading} type="submit">
              {submitting ? 'Bağlanılıyor...' : 'Editör paneline gir'}
            </button>
            {isDemoMode ? (
              <button
                className="secondary-button"
                disabled={submitting || isLoading}
                onClick={fillDemoCredentials}
                type="button"
              >
                Demo bilgilerini doldur
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <SiteCredit className="auth-page-footer" />
    </main>
  )
}
