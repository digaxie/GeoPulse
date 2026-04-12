import { useEffect, useMemo, useRef } from 'react'

import type { FeatureLike } from 'ol/Feature'
import { defaults as defaultControls } from 'ol/control/defaults'
import VectorLayer from 'ol/layer/Vector'
import OLMap from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Fill, Stroke, Style } from 'ol/style'
import View from 'ol/View'

import {
  HUNGARY_MAP_MODE_LABELS,
  getHungaryAllianceColor,
  getHungaryTurnoutColor,
} from '../constants'
import { buildHungaryGeometryFeatures } from '../services/geometryParser'
import type { HungaryElectionSnapshot, HungaryGeometryRecord, HungaryMapMode } from '../types'
import { useHungaryStore } from '../useHungaryStore'

type HungaryMapProps = {
  snapshot: HungaryElectionSnapshot
  geometryVersion: string
  geometryRecords: HungaryGeometryRecord[]
}

function withOpacity(color: string, opacity: number) {
  const nextOpacity = Math.max(0, Math.min(1, opacity))

  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\(([^)]+),\s*[\d.]+\)$/u, `rgba($1, ${nextOpacity})`)
  }

  if (color.startsWith('rgb(')) {
    return color.replace(/^rgb\(([^)]+)\)$/u, `rgba($1, ${nextOpacity})`)
  }

  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    const alpha = Math.round(nextOpacity * 255)
      .toString(16)
      .padStart(2, '0')
    return `${color}${alpha}`
  }

  return color
}

function resolveFillColor(snapshot: HungaryElectionSnapshot, mapMode: HungaryMapMode, constituencyId: string) {
  const constituency = snapshot.constituencies.find((entry) => entry.id === constituencyId)

  if (!constituency) {
    return 'rgba(164, 175, 193, 0.34)'
  }

  if (mapMode === 'results' && snapshot.mode === 'results') {
    return getHungaryAllianceColor(constituency.leadingAlliance)
  }

  if (mapMode === 'previous') {
    return getHungaryAllianceColor(constituency.previousResult?.winnerAlliance)
  }

  return getHungaryTurnoutColor(constituency.turnoutPct)
}

export function HungaryMap({ snapshot, geometryVersion, geometryRecords }: HungaryMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<OLMap | null>(null)
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const sourceRef = useRef<VectorSource | null>(null)
  const hoveredConstituencyIdRef = useRef<string | null>(null)
  const selectedConstituencyIdRef = useRef<string | null>(null)
  const mapModeRef = useRef<HungaryMapMode>('turnout')
  const snapshotRef = useRef(snapshot)

  const mapMode = useHungaryStore((state) => state.mapMode)
  const hoveredConstituencyId = useHungaryStore((state) => state.hoveredConstituencyId)
  const selectedConstituencyId = useHungaryStore((state) => state.selectedConstituencyId)
  const hoverConstituency = useHungaryStore((state) => state.hoverConstituency)
  const selectConstituency = useHungaryStore((state) => state.selectConstituency)
  const setMapMode = useHungaryStore((state) => state.setMapMode)

  const features = useMemo(
    () => buildHungaryGeometryFeatures(geometryVersion, geometryRecords),
    [geometryRecords, geometryVersion],
  )

  useEffect(() => {
    hoveredConstituencyIdRef.current = hoveredConstituencyId
    selectedConstituencyIdRef.current = selectedConstituencyId
    mapModeRef.current = mapMode
    snapshotRef.current = snapshot
    layerRef.current?.changed()
  }, [hoveredConstituencyId, mapMode, selectedConstituencyId, snapshot])

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return
    }

    const source = new VectorSource()
    const layer = new VectorLayer({
      source,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
      style: (feature: FeatureLike) => {
        const constituencyId = String(feature.get('constituencyId') ?? '')
        const fillColor = resolveFillColor(snapshotRef.current, mapModeRef.current, constituencyId)
        const isSelected = constituencyId === selectedConstituencyIdRef.current
        const isHovered = constituencyId === hoveredConstituencyIdRef.current

        return new Style({
          fill: new Fill({
            color: withOpacity(fillColor, isSelected ? 0.92 : isHovered ? 0.84 : 0.76),
          }),
          stroke: new Stroke({
            color: isSelected
              ? '#fffaf0'
              : isHovered
                ? '#ffe082'
                : 'rgba(255, 255, 255, 0.42)',
            width: isSelected ? 2.6 : isHovered ? 2 : 1.1,
          }),
        })
      },
    })

    const map = new OLMap({
      target: mapElementRef.current,
      controls: defaultControls({
        attribution: false,
        rotate: false,
      }),
      layers: [layer],
      view: new View({
        center: fromLonLat([19.25, 47.18]),
        zoom: 7.2,
        minZoom: 6.4,
        maxZoom: 10.8,
      }),
    })

    map.on('pointermove', (event) => {
      if (event.dragging) {
        return
      }

      let nextHoveredId: string | null = null

      map.forEachFeatureAtPixel(
        event.pixel,
        (feature, featureLayer) => {
          if (featureLayer === layer) {
            nextHoveredId = String(feature.get('constituencyId') ?? '')
            return feature
          }

          return undefined
        },
        { hitTolerance: 3 },
      )

      hoverConstituency(nextHoveredId)
      map.getViewport().style.cursor = nextHoveredId ? 'pointer' : ''
    })

    map.on('click', (event) => {
      let nextSelectedId: string | null = null

      map.forEachFeatureAtPixel(
        event.pixel,
        (feature, featureLayer) => {
          if (featureLayer === layer) {
            nextSelectedId = String(feature.get('constituencyId') ?? '')
            return feature
          }

          return undefined
        },
        { hitTolerance: 3 },
      )

      selectConstituency(nextSelectedId)
    })

    const handleMouseLeave = () => {
      hoverConstituency(null)
      map.getViewport().style.cursor = ''
    }

    const handleResize = () => map.updateSize()

    map.getViewport().addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('resize', handleResize)

    sourceRef.current = source
    layerRef.current = layer
    mapRef.current = map

    return () => {
      map.getViewport().removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('resize', handleResize)
      map.setTarget(undefined)
      sourceRef.current = null
      layerRef.current = null
      mapRef.current = null
    }
  }, [hoverConstituency, selectConstituency])

  useEffect(() => {
    if (!sourceRef.current || !mapRef.current) {
      return
    }

    sourceRef.current.clear(true)
    sourceRef.current.addFeatures(features)

    const extent = sourceRef.current.getExtent()
    if (extent.some((value) => !Number.isFinite(value))) {
      return
    }

    mapRef.current.getView().fit(extent, {
      padding: [24, 24, 24, 24],
      maxZoom: 8.85,
      duration: 0,
    })
  }, [features, geometryVersion])

  const resultModeDisabled = snapshot.mode !== 'results'

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
        <div className="hungary-map-canvas" ref={mapElementRef} />
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
