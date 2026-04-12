import { memo, useEffect, useMemo, useState } from 'react'

import {
  HUNGARY_MAP_MODE_LABELS,
  getHungaryAllianceColor,
  getHungaryTurnoutColor,
} from '../constants'
import {
  getCachedHungarySvgGeometry,
  prepareHungarySvgGeometry,
  type HungarySvgGeometryBundle,
} from '../services/geometryParser'
import type { HungaryElectionSnapshot, HungaryGeometryRecord, HungaryMapMode } from '../types'
import { useHungaryStore } from '../useHungaryStore'

type HungaryMapProps = {
  snapshot: HungaryElectionSnapshot
  geometryVersion: string
  geometryRecords: HungaryGeometryRecord[]
}

const FALLBACK_FILL = 'rgba(164, 175, 193, 0.34)'

function resolveFillColor(
  lookup: Map<string, HungaryElectionSnapshot['constituencies'][number]>,
  snapshotMode: HungaryElectionSnapshot['mode'],
  mapMode: HungaryMapMode,
  id: string,
) {
  const constituency = lookup.get(id)

  if (!constituency) {
    return FALLBACK_FILL
  }

  if (mapMode === 'results' && snapshotMode === 'results') {
    return getHungaryAllianceColor(constituency.leadingAlliance)
  }

  if (mapMode === 'previous') {
    return getHungaryAllianceColor(constituency.previousResult?.winnerAlliance)
  }

  return getHungaryTurnoutColor(constituency.turnoutPct)
}

function HungaryMapInner({ snapshot, geometryVersion, geometryRecords }: HungaryMapProps) {
  const mapMode = useHungaryStore((state) => state.mapMode)
  const hoveredId = useHungaryStore((state) => state.hoveredConstituencyId)
  const selectedId = useHungaryStore((state) => state.selectedConstituencyId)
  const hoverConstituency = useHungaryStore((state) => state.hoverConstituency)
  const selectConstituency = useHungaryStore((state) => state.selectConstituency)
  const setMapMode = useHungaryStore((state) => state.setMapMode)
  const [preparedGeometry, setPreparedGeometry] = useState<HungarySvgGeometryBundle | null>(() => (
    getCachedHungarySvgGeometry(geometryVersion)
  ))
  const [isPreparingGeometry, setIsPreparingGeometry] = useState(false)
  const [geometryPrepError, setGeometryPrepError] = useState<string | null>(null)

  const constituencyById = useMemo(() => {
    const map = new Map<string, HungaryElectionSnapshot['constituencies'][number]>()

    for (const constituency of snapshot.constituencies) {
      map.set(constituency.id, constituency)
    }

    return map
  }, [snapshot.constituencies])

  useEffect(() => {
    const cached = getCachedHungarySvgGeometry(geometryVersion)

    if (cached) {
      setPreparedGeometry(cached)
      setIsPreparingGeometry(false)
      setGeometryPrepError(null)
      return
    }

    if (geometryRecords.length === 0) {
      setPreparedGeometry(null)
      setIsPreparingGeometry(false)
      setGeometryPrepError(null)
      return
    }

    const controller = new AbortController()
    setPreparedGeometry(null)
    setIsPreparingGeometry(true)
    setGeometryPrepError(null)

    void prepareHungarySvgGeometry(geometryVersion, geometryRecords, { signal: controller.signal })
      .then((bundle) => {
        if (controller.signal.aborted) {
          return
        }

        setPreparedGeometry(bundle)
        setIsPreparingGeometry(false)
      })
      .catch((error) => {
        if (
          controller.signal.aborted
          || (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return
        }

        console.warn('Hungary SVG geometry preparation failed', error)
        setGeometryPrepError('Harita geometrisi hazirlanirken sorun olustu.')
        setIsPreparingGeometry(false)
      })

    return () => {
      controller.abort()
    }
  }, [geometryRecords, geometryVersion])

  const geometryBundle =
    preparedGeometry?.version === geometryVersion ? preparedGeometry : null

  const resultModeDisabled = snapshot.mode !== 'results'
  const hasMapFeatures = Boolean(geometryBundle && geometryBundle.features.length > 0)

  return (
    <section className="hungary-panel hungary-map-panel">
      <div className="hungary-panel-header">
        <div>
          <p className="hungary-panel-kicker">Map</p>
          <h2>106 cevre haritasi</h2>
        </div>
        <div className="hungary-map-toggle" role="tablist" aria-label="Hungary map mode">
          {(['turnout', 'previous', 'results'] as HungaryMapMode[]).map((entry) => (
            <button
              className={`hungary-map-toggle-button ${mapMode === entry ? 'hungary-map-toggle-button--active' : ''}`}
              disabled={entry === 'results' && resultModeDisabled}
              key={entry}
              onClick={() => setMapMode(entry)}
              type="button"
            >
              {HUNGARY_MAP_MODE_LABELS[entry]}
            </button>
          ))}
        </div>
      </div>

      <div className="hungary-map-shell">
        <div
          className="hungary-map-canvas"
          onMouseLeave={() => hoverConstituency(null)}
        >
          {hasMapFeatures && geometryBundle ? (
            <svg
              aria-label="Macaristan 106 cevre haritasi"
              className="hungary-map-svg"
              preserveAspectRatio="xMidYMid meet"
              viewBox={`0 0 ${geometryBundle.width} ${geometryBundle.height}`}
            >
              {geometryBundle.features.map((feature) => {
                const constituency = constituencyById.get(feature.id)
                const isSelected = selectedId === feature.id
                const isHovered = hoveredId === feature.id
                const fillColor = resolveFillColor(constituencyById, snapshot.mode, mapMode, feature.id)
                const label = constituency?.name ?? feature.id

                return (
                  <path
                    aria-label={label}
                    aria-pressed={isSelected}
                    className={`hungary-map-path ${isSelected ? 'hungary-map-path--selected' : ''} ${isHovered ? 'hungary-map-path--hovered' : ''}`}
                    d={feature.path}
                    fill={fillColor}
                    key={feature.id}
                    onClick={() => selectConstituency(feature.id)}
                    onFocus={() => hoverConstituency(feature.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        selectConstituency(feature.id)
                      }
                    }}
                    onMouseEnter={() => hoverConstituency(feature.id)}
                    role="button"
                    stroke={
                      isSelected
                        ? '#fffaf0'
                        : isHovered
                          ? '#ffe082'
                          : 'rgba(255, 255, 255, 0.38)'
                    }
                    strokeWidth={isSelected ? 3 : isHovered ? 2.2 : 1.05}
                    tabIndex={0}
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{label}</title>
                  </path>
                )
              })}
            </svg>
          ) : (
            <div className="hungary-map-svg-placeholder" aria-hidden="true" />
          )}
        </div>

        {isPreparingGeometry || geometryPrepError ? (
          <div className="hungary-map-processing-overlay" aria-live="polite">
            <span className={`hungary-badge ${geometryPrepError ? 'hungary-badge--warn' : 'hungary-badge--live'}`}>
              {geometryPrepError ? 'Harita gecikiyor' : 'Harita optimize ediliyor'}
            </span>
            <strong>
              {geometryPrepError ? 'Harita sinirlari hazirlanamadi' : 'SVG harita arka planda worker ile hazirlaniyor'}
            </strong>
            <span>
              {geometryPrepError
                ? 'Ozet veri akisi calismaya devam eder. Sayfayi yenileyip tekrar deneyebilirsiniz.'
                : 'Ana thread kilitlenmesin diye poligonlar worker icinde sadelestiriliyor.'}
            </span>
          </div>
        ) : null}

        <div className="hungary-map-overlay">
          <span>
            {mapMode === 'turnout'
              ? 'Dusuk katilim'
              : mapMode === 'previous'
                ? '2022 kazanan renklendirmesi'
                : 'Canli lider renklendirmesi'}
          </span>
          <strong>
            {mapMode === 'turnout'
              ? 'Kirmizi dusuk, yesil yuksek katilim'
              : mapMode === 'previous'
                ? 'Gecmis birinci aday / ittifak'
                : 'Anlik lider aday / ittifak'}
          </strong>
        </div>
      </div>
    </section>
  )
}

export const HungaryMap = memo(HungaryMapInner)
