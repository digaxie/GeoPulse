import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { SiteCredit } from '@/components/layout/SiteCredit'
import { ConflictMap } from '@/components/map/ConflictMap'
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary'
import { useViewerAssets } from '@/features/assets/useViewerAssets'
import { getActiveBriefingSlide, getVisibleElementIdsForActiveSlide } from '@/features/scenario/briefing'
import { useScenarioRuntime } from '@/features/scenario/useScenarioRuntime'
import { useScenarioStore } from '@/features/scenario/store'

export function ViewerPage() {
  const params = useParams<{ viewerSlug: string }>()
  const viewerSlug = params.viewerSlug ?? ''
  const hasViewerSlug = Boolean(params.viewerSlug)
  const title = useScenarioStore((state) => state.title)
  const scenarioDocument = useScenarioStore((state) => state.document)
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const runtime = useScenarioRuntime({
    mode: 'viewer',
    viewerSlug,
  })
  const { assets, error: assetError } = useViewerAssets(viewerSlug)

  const activeSlide = getActiveBriefingSlide(scenarioDocument)
  const visibleElementIds = getVisibleElementIdsForActiveSlide(scenarioDocument)
  const waitingForPresenter = Boolean(scenarioDocument.briefing && scenarioDocument.briefing.slides.length > 0 && !activeSlide)
  const headline = activeSlide?.title?.trim() || title || 'Canli sunum'
  const notes = useMemo(
    () => (waitingForPresenter ? 'Sunum henuz baslatilmadi.' : activeSlide ? null : null),
    [activeSlide, waitingForPresenter],
  )

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    syncFullscreenState()
    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  if (!hasViewerSlug) {
    return <Navigate to="/app" replace />
  }

  async function handleFullscreen() {
    try {
      setFullscreenError(null)
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }

      await document.documentElement.requestFullscreen()
    } catch (error) {
      setFullscreenError(
        error instanceof Error ? error.message : 'Tam ekran acilamadi.',
      )
    }
  }

  return (
    <main className="viewer-page">
      <header className="viewer-header">
        <div>
          <p className="eyebrow">GeoPulse Sunum</p>
          <h1>{headline}</h1>
          {notes ? <p className="lede">{notes}</p> : null}
        </div>

        <div className="viewer-header-actions">
          <Link className="secondary-button" to="/app">
            Kontrol paneli
          </Link>
          <button className="primary-button" onClick={() => void handleFullscreen()} type="button">
            {isFullscreen ? 'Tam ekrandan cik' : 'Tam ekran'}
          </button>
        </div>
      </header>

      {runtime.error ? <div className="workspace-alert">{runtime.error}</div> : null}
      {assetError ? <div className="workspace-alert">{assetError}</div> : null}
      {fullscreenError ? <div className="workspace-alert">{fullscreenError}</div> : null}
      {waitingForPresenter ? (
        <div className="workspace-alert workspace-alert-info">Sunum henuz baslatilmadi.</div>
      ) : null}
      <MapErrorBoundary>
        <ConflictMap
          alertAudioRole="presentation"
          assets={assets}
          readOnly
          visibleElementIds={visibleElementIds}
        />
      </MapErrorBoundary>
      <SiteCredit className="page-credit" />
    </main>
  )
}
