import { startTransition, useEffect, useEffectEvent } from 'react'

import { HUNGARY_CONFIG_POLL_MS, formatHungaryInteger } from '@/features/hungary/constants'
import { CheckpointTimeline } from '@/features/hungary/components/CheckpointTimeline'
import { CloseContests } from '@/features/hungary/components/CloseContests'
import { ConstituencyDrawer } from '@/features/hungary/components/ConstituencyDrawer'
import { HungaryErrorBoundary } from '@/features/hungary/components/HungaryErrorBoundary'
import { HungaryHero } from '@/features/hungary/components/HungaryHero'
import { HungaryMap } from '@/features/hungary/components/HungaryMap'
import { PartyStrip } from '@/features/hungary/components/PartyStrip'
import { getHungaryElectionSnapshot } from '@/features/hungary/services/nviAdapter'
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
  const geometryVersion = useHungaryStore((state) => state.geometryVersion)
  const geometryRecords = useHungaryStore((state) => state.geometryRecords)
  const isLoading = useHungaryStore((state) => state.isLoading)
  const isRefreshing = useHungaryStore((state) => state.isRefreshing)
  const error = useHungaryStore((state) => state.error)
  const isStale = useHungaryStore((state) => state.isStale)
  const staleMessage = useHungaryStore((state) => state.staleMessage)
  const clearInteraction = useHungaryStore((state) => state.clearInteraction)
  const startFetch = useHungaryStore((state) => state.startFetch)
  const applyBundle = useHungaryStore((state) => state.applyBundle)
  const markFetchFailure = useHungaryStore((state) => state.markFetchFailure)

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

  return (
    <HungaryErrorBoundary>
      <main className="hungary-page" data-theme={uiTheme}>
        <div className="hungary-page-shell">
          <HungaryHero isRefreshing={isRefreshing} isStale={isStale} snapshot={snapshot} />

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

          {snapshot && geometryVersion ? (
            <>
              <section className="hungary-grid">
                <div className="hungary-grid-main">
                  <HungaryMap
                    geometryRecords={geometryRecords}
                    geometryVersion={geometryVersion}
                    snapshot={snapshot}
                  />
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
