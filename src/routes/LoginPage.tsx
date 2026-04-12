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
        submitError instanceof Error ? submitError.message : 'Giriş sırasında bir hata oluştu.',
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
    <main className="modern-auth-layout">
      {/* Left part: Hero Visual */}
      <section className="modern-auth-hero">
        <div className="hero-background-wrapper">
          <img
            alt="GeoPulse Command Center Background"
            className="hero-background-image"
            src={withBasePath('/geopulse-login-hero-modern.png')}
          />
          <div className="hero-background-overlay"></div>
        </div>

        <div className="hero-content">
          <div className="brand-header">
            <ModeBadge className="modern-mode-badge" />
          </div>

          <div className="hero-text-content">
            <p className="hero-eyebrow">GeoPulse Tactical System</p>
            <h1 className="hero-title">
              Strategic Control<br />
              <span className="text-glow">Intelligence.</span>
            </h1>
            <p className="hero-subtitle">
              Unified command center operations. Briefing, scenarios, and live deck management synchronized in real-time.
            </p>
          </div>

          <div className="hero-stats">
            <div className="stat-card">
              <div className="stat-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              </div>
              <div className="stat-info">
                <span className="stat-value">Live Sync</span>
                <span className="stat-label">Sub-second latency</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon-wrapper">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              </div>
              <div className="stat-info">
                <span className="stat-value">Global Watch</span>
                <span className="stat-label">Coverage Map</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right part: Form */}
      <section className="modern-auth-form-container">
        <div className="form-wrapper">
          <div className="form-header">
            <div className="logo-placeholder">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <h2>Access Portal</h2>
            <p>Enter your credentials to connect to the tactical network.</p>
          </div>

          <form className="modern-form" onSubmit={handleSubmit}>
            <div className="input-group">
               <label htmlFor="username">Operator ID</label>
               <div className="input-with-icon">
                 <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                 <input
                   id="username"
                   autoComplete="username"
                   value={username}
                   onChange={(event) => setUsername(event.target.value)}
                   placeholder="admin"
                 />
               </div>
            </div>

            <div className="input-group">
               <label htmlFor="password">Passkey</label>
               <div className="input-with-icon">
                 <svg className="input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                 <input
                   id="password"
                   autoComplete="current-password"
                   value={password}
                   onChange={(event) => setPassword(event.target.value)}
                   placeholder="••••••••"
                   type="password"
                 />
               </div>
            </div>

            {error && <div className="form-error-toast">{error}</div>}

            <div className="form-actions">
               <button 
                 className="modern-submit-btn" 
                 disabled={submitting || isLoading} 
                 type="submit"
               >
                 <span>{submitting ? 'Authenticating...' : 'Initialize Uplink'}</span>
                 <div className="btn-glow"></div>
               </button>
            </div>

            {isDemoMode && (
              <div className="demo-actions">
                <p className="demo-hint">Demo mode active. Use preconfigured credentials.</p>
                <button
                  className="modern-demo-btn"
                  disabled={submitting || isLoading}
                  onClick={fillDemoCredentials}
                  type="button"
                >
                  Load Demo Profile
                </button>
              </div>
            )}
          </form>

          <SiteCredit className="modern-footer-credit" />
        </div>
      </section>
    </main>
  )
}
