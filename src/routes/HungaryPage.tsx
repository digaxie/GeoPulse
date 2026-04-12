import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react'

import { HUNGARY_CONFIG_POLL_MS, formatHungaryInteger } from '@/features/hungary/constants'
import { CheckpointTimeline } from '@/features/hungary/components/CheckpointTimeline'
import { CloseContests } from '@/features/hungary/components/CloseContests'
import { ConstituencyDrawer } from '@/features/hungary/components/ConstituencyDrawer'
import { HungaryErrorBoundary } from '@/features/hungary/components/HungaryErrorBoundary'
import { HungaryHero } from '@/features/hungary/components/HungaryHero'
import { HungaryMap } from '@/features/hungary/components/HungaryMap'
import { PartyStrip } from '@/features/hungary/components/PartyStrip'
import {
  getHungaryElectionSnapshot,
  getHungaryGeometryRecords,
} from '@/features/hungary/services/nviAdapter'
import { getCachedHungarySvgGeometry } from '@/features/hungary/services/geometryParser'
import { useHungaryStore } from '@/features/hungary/useHungaryStore'
import { useAppTheme } from '@/hooks/useAppTheme'
import '@/features/hungary/hungary.css'

function getFetchErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Resmi veri akisi su an okunamiyor.'
}

export function HungaryPage() {
  const { uiTheme } = useAppTheme()
  const snapshot = useHungaryStore((state) => state.snapshot)
  const snapshotConfigVersion = snapshot?.configVersion ?? null
  const geometryRequestVersionRef = useRef<string | null>(null)
  const geometryRetryTimeoutRef = useRef<number | null>(null)
  const [geometryRetryToken, setGeometryRetryToken] = useState(0)
  const geometryVersion = useHungaryStore((state) => state.geometryVersion)
  const geometryRecords = useHungaryStore((state) => state.geometryRecords)
  const isGeometryLoading = useHungaryStore((state) => state.isGeometryLoading)
  const isLoading = useHungaryStore((state) => state.isLoading)
  const error = useHungaryStore((state) => state.error)
  const isStale = useHungaryStore((state) => state.isStale)
  const staleMessage = useHungaryStore((state) => state.staleMessage)
  const clearInteraction = useHungaryStore((state) => state.clearInteraction)
  const startFetch = useHungaryStore((state) => state.startFetch)
  const applyBundle = useHungaryStore((state) => state.applyBundle)
  const markFetchFailure = useHungaryStore((state) => state.markFetchFailure)
  const startGeometryFetch = useHungaryStore((state) => state.startGeometryFetch)
  const applyGeometry = useHungaryStore((state) => state.applyGeometry)
  const markGeometryFailure = useHungaryStore((state) => state.markGeometryFailure)

  useEffect(() => {
    clearInteraction()
  }, [clearInteraction])

  const runRefresh = useEffectEvent(async (initialLoad: boolean, signal: AbortSignal) => {
    startFetch(initialLoad)

    try {
      const bundle = await getHungaryElectionSnapshot({ signal })

      if (signal.aborted) {
        return null
      }

      startTransition(() => {
        applyBundle(bundle)
      })

      return bundle.pollIntervalMs
    } catch (fetchError) {
      if (signal.aborted) {
        return null
      }

      markFetchFailure(getFetchErrorMessage(fetchError))
      return HUNGARY_CONFIG_POLL_MS
    }
  })

  const runGeometryRefresh = useEffectEvent(async (version: string, signal: AbortSignal) => {
    startGeometryFetch(version)

    try {
      const records = await getHungaryGeometryRecords(version, { signal })

      if (signal.aborted) {
        return
      }

      startTransition(() => {
        applyGeometry(version, records)
      })

      return true
    } catch (geometryError) {
      if (signal.aborted) {
        return false
      }

      markGeometryFailure()
      // Geometry can fail independently; summary cards remain usable.
      console.warn('Hungary geometry loading failed', geometryError)
      return false
    }
  })

  useEffect(() => {
    let isMounted = true
    let timeoutId: number | null = null
    let controller: AbortController | null = null

    const scheduleNext = (delayMs: number) => {
      timeoutId = window.setTimeout(() => {
        void tick(false)
      }, delayMs)
    }

    const tick = async (initialLoad: boolean) => {
      controller?.abort()
      controller = new AbortController()

      const nextIntervalMs = await runRefresh(initialLoad, controller.signal)

      if (!isMounted || nextIntervalMs === null) {
        return
      }

      scheduleNext(nextIntervalMs)
    }

    void tick(true)

    return () => {
      isMounted = false
      controller?.abort()
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [runRefresh])

  useEffect(() => {
    return () => {
      if (geometryRetryTimeoutRef.current !== null) {
        window.clearTimeout(geometryRetryTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!snapshotConfigVersion) {
      return
    }

    if (getCachedHungarySvgGeometry(snapshotConfigVersion)) {
      geometryRequestVersionRef.current = null
      return
    }

    const geometryState = useHungaryStore.getState()

    if (
      geometryState.geometryVersion === snapshotConfigVersion
      && geometryState.geometryRecords.length > 0
    ) {
      geometryRequestVersionRef.current = null
      return
    }

    const controller = new AbortController()
    geometryRequestVersionRef.current = snapshotConfigVersion
    void runGeometryRefresh(snapshotConfigVersion, controller.signal).then((didLoad) => {
      if (controller.signal.aborted) {
        return
      }

      if (geometryRequestVersionRef.current === snapshotConfigVersion) {
        geometryRequestVersionRef.current = null
      }

      if (!didLoad) {
        geometryRetryTimeoutRef.current = window.setTimeout(() => {
          setGeometryRetryToken((current) => current + 1)
        }, 15_000)
      }
    })

    return () => {
      controller.abort()
      if (geometryRetryTimeoutRef.current !== null) {
        window.clearTimeout(geometryRetryTimeoutRef.current)
        geometryRetryTimeoutRef.current = null
      }
    }
  }, [geometryRetryToken, runGeometryRefresh, snapshotConfigVersion])

  const hasCachedGeometry = snapshotConfigVersion
    ? Boolean(getCachedHungarySvgGeometry(snapshotConfigVersion))
    : false

  return (
    <HungaryErrorBoundary>
      <main className="hungary-page" data-theme={uiTheme}>
        <div className="hungary-page-shell">
          <HungaryHero snapshot={snapshot} />

          {error && !snapshot ? (
            <div className="hungary-status-banner hungary-status-banner--error" role="alert">
              {error}
            </div>
          ) : null}

          {snapshot && isStale ? (
            <div className="hungary-status-banner hungary-status-banner--warn" role="status">
              {staleMessage ?? 'Resmi veri gecikiyor. Son basarili snapshot ekranda tutuluyor.'}
            </div>
          ) : null}

          {snapshot ? (
            <>
              <section className="hungary-grid">
                <div className="hungary-grid-main">
                  {(geometryVersion === snapshot.configVersion && geometryRecords.length > 0) || hasCachedGeometry ? (
                    <HungaryMap
                      geometryRecords={geometryRecords}
                      geometryVersion={snapshot.configVersion}
                      snapshot={snapshot}
                    />
                  ) : (
                    <section className="hungary-panel hungary-map-panel">
                      <div className="hungary-panel-header">
                        <div>
                          <p className="hungary-panel-kicker">Map</p>
                          <h2>106 cevre haritasi hazirlaniyor</h2>
                        </div>
                        {isGeometryLoading ? (
                          <span className="hungary-badge hungary-badge--live">Harita yukleniyor</span>
                        ) : (
                          <span className="hungary-badge">Harita beklemede</span>
                        )}
                      </div>
                      <div className="hungary-map-loading-state" aria-busy={isGeometryLoading}>
                        <div className="hungary-map-loading-grid" />
                        <p className="hungary-panel-text">
                          Ozet veri once yuklenir. Cevre poligonlari ikinci asamada eklenir.
                        </p>
                      </div>
                    </section>
                  )}
                  <CheckpointTimeline snapshot={snapshot} />
                </div>

                <div className="hungary-grid-side">
                  <ConstituencyDrawer
                    snapshot={snapshot}
                  />
                  <section className="hungary-panel">
                    <div className="hungary-panel-header">
                      <div>
                        <p className="hungary-panel-kicker">Briefing</p>
                        <h2>Secim sistemi notlari</h2>
                      </div>
                      <p className="hungary-panel-text">
                        106 tek cevre sandalyesi ile 93 liste sandalyesi ayni yayinda okunur.
                      </p>
                    </div>

                    <div className="hungary-briefing-grid">
                      <div>
                        <strong>106</strong>
                        <span>Dar bolge sandalyesi</span>
                      </div>
                      <div>
                        <strong>93</strong>
                        <span>Liste sandalyesi</span>
                      </div>
                      <div>
                        <strong>%5 / %10 / %15</strong>
                        <span>Ulusal baraj esikleri</span>
                      </div>
                      <div>
                        <strong>
                          {snapshot.thresholds.minorityPreference !== null
                            ? formatHungaryInteger(snapshot.thresholds.minorityPreference)
                            : '--'}
                        </strong>
                        <span>Azinlik tercih esigi</span>
                      </div>
                    </div>
                  </section>
                </div>
              </section>

              <section className="hungary-bottom-grid">
                <PartyStrip snapshot={snapshot} />
                <CloseContests snapshot={snapshot} />
              </section>
            </>
          ) : (
            <section className="hungary-loading-board" aria-busy={isLoading}>
              <div className="hungary-loading-card" />
              <div className="hungary-loading-card" />
              <div className="hungary-loading-card" />
            </section>
          )}
        </div>
      </main>
    </HungaryErrorBoundary>
  )
}
