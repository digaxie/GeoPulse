import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { ModeBadge } from '@/components/layout/ModeBadge'
import { SiteCredit } from '@/components/layout/SiteCredit'
import { useAuth } from '@/features/auth/useAuth'
import { migrateScenarioDocument } from '@/features/scenario/migrate'
import { parseScenarioTransfer } from '@/features/scenario/transfer'
import { backendClient } from '@/lib/backend'
import type { ScenarioListItem } from '@/lib/backend/types'
import { withBasePath } from '@/lib/paths'
import { formatRelativeDate, readTextFile } from '@/lib/utils'

export function DashboardPage() {
  const navigate = useNavigate()
  const { session, isLoading, logout } = useAuth()
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([])
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [deletingScenarioId, setDeletingScenarioId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

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
        loadError instanceof Error
          ? loadError.message
          : 'Senaryo JSON dosyası içe aktarılamadı.',
      )
    } finally {
      event.target.value = ''
      setImporting(false)
    }
  }

  async function handleDeleteScenario(scenario: ScenarioListItem) {
    const lockNote = scenario.lock
      ? ` Bu senaryoda editör kilidi ${scenario.lock.holderUsername} üzerinde görünüyor.`
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

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">GeoPulse Kontrol Merkezi</p>
          <h1>Senaryolar</h1>
          <p className="lede">
            Editör modu tek kullanıcı için kilitlenir. İzleyiciler public read-only link ile
            canlı güncellemeleri görür.
          </p>
        </div>

        <div className="dashboard-actions">
          <ModeBadge />
          {session?.role === 'admin' ? (
            <Link className="secondary-button" to="/admin">
              Admin
            </Link>
          ) : null}
          <button className="ghost-button" onClick={() => void logout()}>
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
                {scenario.lock ? (
                  <p className="scenario-lock">{scenario.lock.holderUsername} editör olarak bağlı.</p>
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
