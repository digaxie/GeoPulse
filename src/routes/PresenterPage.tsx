import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { ConflictMap } from '@/components/map/ConflictMap'
import { MapErrorBoundary } from '@/components/map/MapErrorBoundary'
import { useAssets } from '@/features/assets/useAssets'
import { getActiveBriefingSlide, getBriefingSlides, getVisibleElementIdsForActiveSlide } from '@/features/scenario/briefing'
import { useScenarioStore } from '@/features/scenario/store'
import { useScenarioRuntime } from '@/features/scenario/useScenarioRuntime'

export function PresenterPage() {
  const params = useParams<{ scenarioId: string }>()
  const scenarioId = params.scenarioId ?? ''
  const hasScenarioId = Boolean(params.scenarioId)
  const title = useScenarioStore((state) => state.title)
  const scenarioDocument = useScenarioStore((state) => state.document)
  const setActiveSlide = useScenarioStore((state) => state.setActiveSlide)
  const backfillAssetSnapshots = useScenarioStore((state) => state.backfillUploadedAssetSnapshots)
  const runtime = useScenarioRuntime({ mode: 'editor', scenarioId })
  const { assets, isLoading: loadingAssets } = useAssets()
  const [fullscreenError, setFullscreenError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const slides = getBriefingSlides(scenarioDocument)
  const activeSlide = getActiveBriefingSlide(scenarioDocument)
  const visibleElementIds = getVisibleElementIdsForActiveSlide(scenarioDocument)
  const activeIndex = activeSlide ? slides.findIndex((slide) => slide.id === activeSlide.id) : -1
  const canGoPrev = activeIndex > 0
  const canGoNext = slides.length > 0 && activeIndex < slides.length - 1
  const presenterHeadline = activeSlide?.title?.trim() || title || 'GeoPulse Sunum'
  const deckStatus =
    slides.length === 0
      ? 'Henuz briefing slaydi yok.'
      : activeSlide
        ? `${activeIndex + 1} / ${slides.length}`
        : 'Sunum henuz baslatilmadi.'

  useEffect(() => {
    if (runtime.access !== 'editor' || loadingAssets || assets.length === 0) {
      return
    }

    backfillAssetSnapshots(assets)
  }, [assets, backfillAssetSnapshots, scenarioDocument.revision, loadingAssets, runtime.access])

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }

      if (event.key === 'ArrowLeft' && canGoPrev) {
        event.preventDefault()
        setActiveSlide(slides[activeIndex - 1]?.id ?? null)
      }

      if (event.key === 'ArrowRight' && canGoNext) {
        event.preventDefault()
        setActiveSlide(slides[activeIndex + 1]?.id ?? slides[0]?.id ?? null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeIndex, canGoNext, canGoPrev, setActiveSlide, slides])

  if (!hasScenarioId) {
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

  const notes = activeSlide?.notes?.trim() || null

  return (
    <main className="viewer-page presenter-page">
      <header className="viewer-header presenter-header">
        <div>
          <p className="eyebrow">GeoPulse Presenter</p>
          <h1>{presenterHeadline}</h1>
          <p className="lede">{deckStatus}</p>
        </div>

        <div className="viewer-header-actions">
          <Link className="secondary-button" to={`/scenario/${scenarioId}`}>
            Editore don
          </Link>
          <button
            className="secondary-button"
            disabled={!canGoPrev}
            onClick={() => setActiveSlide(slides[activeIndex - 1]?.id ?? null)}
            type="button"
          >
            Onceki
          </button>
          <button
            className="secondary-button"
            disabled={!canGoNext}
            onClick={() => setActiveSlide(slides[activeIndex + 1]?.id ?? slides[0]?.id ?? null)}
            type="button"
          >
            Sonraki
          </button>
          <button className="primary-button" onClick={() => void handleFullscreen()} type="button">
            {isFullscreen ? 'Tam ekrandan cik' : 'Tam ekran'}
          </button>
        </div>
      </header>

      {runtime.error ? <div className="workspace-alert">{runtime.error}</div> : null}
      {fullscreenError ? <div className="workspace-alert">{fullscreenError}</div> : null}
      {notes ? <section className="presenter-notes">{notes}</section> : null}

      <MapErrorBoundary>
        <ConflictMap
          alertAudioRole="presentation"
          assets={assets}
          readOnly
          visibleElementIds={visibleElementIds}
        />
      </MapErrorBoundary>
    </main>
  )
}
