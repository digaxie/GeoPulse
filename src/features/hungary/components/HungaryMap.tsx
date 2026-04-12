import { memo, useEffect, useMemo, useRef, useState } from 'react'

import Feature from 'ol/Feature'
import type Polygon from 'ol/geom/Polygon'
import { defaults as defaultControls } from 'ol/control/defaults'
import VectorLayer from 'ol/layer/Vector'
import OLMap from 'ol/Map'
import VectorImageLayer from 'ol/layer/VectorImage'
import { fromLonLat } from 'ol/proj'
import VectorSource from 'ol/source/Vector'
import { Fill, Stroke, Style } from 'ol/style'
import View from 'ol/View'

import {
  HUNGARY_MAP_MODE_LABELS,
  getHungaryAllianceColor,
  getHungaryTurnoutColor,
} from '../constants'
import {
  getCachedHungaryGeometryFeatures,
  prepareHungaryGeometryFeatures,
} from '../services/geometryParser'
import type { HungaryElectionSnapshot, HungaryGeometryRecord, HungaryMapMode } from '../types'
import { useHungaryStore } from '../useHungaryStore'

type HungaryMapProps = {
  snapshot: HungaryElectionSnapshot
  geometryVersion: string
  geometryRecords: HungaryGeometryRecord[]
}

/* ── style helpers ── */

function withOpacity(color: string, opacity: number) {
  const o = Math.max(0, Math.min(1, opacity))
  if (color.startsWith('rgba(')) return color.replace(/rgba\(([^)]+),\s*[\d.]+\)$/u, `rgba($1, ${o})`)
  if (color.startsWith('rgb(')) return color.replace(/^rgb\(([^)]+)\)$/u, `rgba($1, ${o})`)
  if (color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    return `${color}${Math.round(o * 255).toString(16).padStart(2, '0')}`
  }
  return color
}

const FALLBACK_FILL = 'rgba(164, 175, 193, 0.34)'

function resolveFillColor(
  lookup: Map<string, HungaryElectionSnapshot['constituencies'][number]>,
  snapshotMode: HungaryElectionSnapshot['mode'],
  mapMode: HungaryMapMode,
  id: string,
) {
  const c = lookup.get(id)
  if (!c) return FALLBACK_FILL
  if (mapMode === 'results' && snapshotMode === 'results') return getHungaryAllianceColor(c.leadingAlliance)
  if (mapMode === 'previous') return getHungaryAllianceColor(c.previousResult?.winnerAlliance)
  return getHungaryTurnoutColor(c.turnoutPct)
}

const baseStyleCache = new Map<string, Style>()
function getBaseStyle(fillColor: string) {
  let s = baseStyleCache.get(fillColor)
  if (!s) {
    s = new Style({
      fill: new Fill({ color: withOpacity(fillColor, 0.76) }),
      stroke: new Stroke({ color: 'rgba(255,255,255,0.42)', width: 1.1 }),
    })
    baseStyleCache.set(fillColor, s)
  }
  return s
}

const HOVER_STYLE = new Style({
  fill: new Fill({ color: 'rgba(255,224,130,0.32)' }),
  stroke: new Stroke({ color: '#ffe082', width: 2.2 }),
})

const SELECT_STYLE = new Style({
  fill: new Fill({ color: 'rgba(255,250,240,0.36)' }),
  stroke: new Stroke({ color: '#fffaf0', width: 2.8 }),
})

/* ── component ── */

function HungaryMapInner({ snapshot, geometryVersion, geometryRecords }: HungaryMapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<OLMap | null>(null)
  const baseLayerRef = useRef<VectorImageLayer<VectorSource> | null>(null)
  const baseSourceRef = useRef<VectorSource | null>(null)
  const hlSourceRef = useRef<VectorSource | null>(null)
  const featuresById = useRef<Map<string, Feature<Polygon>>>(new Map())

  const mapMode = useHungaryStore((s) => s.mapMode)
  const hoveredId = useHungaryStore((s) => s.hoveredConstituencyId)
  const selectedId = useHungaryStore((s) => s.selectedConstituencyId)
  const hoverConstituency = useHungaryStore((s) => s.hoverConstituency)
  const selectConstituency = useHungaryStore((s) => s.selectConstituency)
  const setMapMode = useHungaryStore((s) => s.setMapMode)
  const [preparedGeometry, setPreparedGeometry] = useState<{
    version: string
    features: Feature<Polygon>[]
  } | null>(() => {
    const cached = getCachedHungaryGeometryFeatures(geometryVersion)
    return cached ? { version: geometryVersion, features: cached } : null
  })
  const [isPreparingGeometry, setIsPreparingGeometry] = useState(false)
  const [geometryPrepError, setGeometryPrepError] = useState<string | null>(null)

  const constituencyById = useMemo(() => {
    const m = new Map<string, HungaryElectionSnapshot['constituencies'][number]>()
    for (const c of snapshot.constituencies) m.set(c.id, c)
    return m
  }, [snapshot.constituencies])

  const features =
    preparedGeometry?.version === geometryVersion ? preparedGeometry.features : []

  useEffect(() => {
    if (geometryRecords.length === 0) {
      setPreparedGeometry(null)
      setIsPreparingGeometry(false)
      setGeometryPrepError(null)
      return
    }

    const cached = getCachedHungaryGeometryFeatures(geometryVersion)
    if (cached) {
      setPreparedGeometry({ version: geometryVersion, features: cached })
      setIsPreparingGeometry(false)
      setGeometryPrepError(null)
      return
    }

    const controller = new AbortController()
    setPreparedGeometry(null)
    setIsPreparingGeometry(true)
    setGeometryPrepError(null)

    void prepareHungaryGeometryFeatures(geometryVersion, geometryRecords, {
      signal: controller.signal,
    })
      .then((nextFeatures) => {
        if (controller.signal.aborted) {
          return
        }

        setPreparedGeometry({
          version: geometryVersion,
          features: nextFeatures,
        })
        setIsPreparingGeometry(false)
      })
      .catch((error) => {
        if (
          controller.signal.aborted
          || (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return
        }

        console.warn('Hungary map geometry preparation failed', error)
        setGeometryPrepError('Harita geometrisi hazirlanirken sorun olustu.')
        setIsPreparingGeometry(false)
      })

    return () => {
      controller.abort()
    }
  }, [geometryRecords, geometryVersion])

  /* ── build map once ── */
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return

    const baseSource = new VectorSource()
    const hlSource = new VectorSource()

    const baseLayer = new VectorImageLayer({
      source: baseSource,
      style: () => new Style(), // placeholder, overridden by applyBaseStyles
    })

    const hlLayer = new VectorLayer({
      source: hlSource,
      updateWhileAnimating: true,
      updateWhileInteracting: true,
    })

    const map = new OLMap({
      target: mapElRef.current,
      controls: defaultControls({ attribution: false, rotate: false }),
      layers: [baseLayer, hlLayer],
      view: new View({
        center: fromLonLat([19.25, 47.18]),
        zoom: 7.2,
        minZoom: 6.4,
        maxZoom: 10.8,
      }),
    })

    let lastHit: string | null = null

    map.on('pointermove', (e) => {
      if (e.dragging) return
      let hit: string | null = null
      map.forEachFeatureAtPixel(e.pixel, (f, l) => {
        if (l === baseLayer || l === hlLayer) {
          hit = String(f.get('constituencyId') ?? '')
          return f
        }
        return undefined
      }, { hitTolerance: 4 })
      if (hit !== lastHit) {
        lastHit = hit
        hoverConstituency(hit)
        map.getViewport().style.cursor = hit ? 'pointer' : ''
      }
    })

    map.on('click', (e) => {
      let hit: string | null = null
      map.forEachFeatureAtPixel(e.pixel, (f, l) => {
        if (l === baseLayer || l === hlLayer) {
          hit = String(f.get('constituencyId') ?? '')
          return f
        }
        return undefined
      }, { hitTolerance: 4 })
      selectConstituency(hit)
    })

    const onLeave = () => { lastHit = null; hoverConstituency(null); map.getViewport().style.cursor = '' }
    const onResize = () => map.updateSize()
    map.getViewport().addEventListener('mouseleave', onLeave)
    window.addEventListener('resize', onResize)

    baseSourceRef.current = baseSource
    hlSourceRef.current = hlSource
    baseLayerRef.current = baseLayer
    mapRef.current = map

    return () => {
      map.getViewport().removeEventListener('mouseleave', onLeave)
      window.removeEventListener('resize', onResize)
      map.setTarget(undefined)
      baseSourceRef.current = null
      hlSourceRef.current = null
      baseLayerRef.current = null
      mapRef.current = null
    }
  }, [hoverConstituency, selectConstituency])

  /* ── load features ── */
  useEffect(() => {
    const src = baseSourceRef.current
    const m = mapRef.current
    if (!src || !m) return

    src.clear(true)
    featuresById.current = new Map()

    if (features.length === 0) {
      return
    }

    const lookup = new Map<string, Feature<Polygon>>()
    for (const f of features) {
      lookup.set(String(f.get('constituencyId') ?? ''), f)
    }
    featuresById.current = lookup
    src.addFeatures(features)

    const ext = src.getExtent()
    if (ext && ext.every((v) => Number.isFinite(v))) {
      m.getView().fit(ext, { padding: [24, 24, 24, 24], maxZoom: 8.85, duration: 0 })
    }
  }, [features])

  /* ── apply base styles (when data or mapMode changes) ── */
  useEffect(() => {
    for (const [id, f] of featuresById.current) {
      const color = resolveFillColor(constituencyById, snapshot.mode, mapMode, id)
      f.setStyle(getBaseStyle(color))
    }
  }, [constituencyById, snapshot.mode, mapMode])

  /* ── highlight overlay (hover / selection) ── */
  useEffect(() => {
    const hl = hlSourceRef.current
    if (!hl) return

    hl.clear(true)

    const ids = new Set<string>()
    if (selectedId) ids.add(selectedId)
    if (hoveredId && hoveredId !== selectedId) ids.add(hoveredId)

    for (const id of ids) {
      const orig = featuresById.current.get(id)
      if (!orig) continue
      const geom = orig.getGeometry()
      if (!geom) continue

      const clone = new Feature({ geometry: geom, constituencyId: id })
      clone.setStyle(id === selectedId ? SELECT_STYLE : HOVER_STYLE)
      hl.addFeature(clone)
    }
  }, [hoveredId, selectedId])

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
        <div className="hungary-map-canvas" ref={mapElRef} />
        {isPreparingGeometry || geometryPrepError ? (
          <div className="hungary-map-processing-overlay" aria-live="polite">
            <span className={`hungary-badge ${geometryPrepError ? 'hungary-badge--warn' : 'hungary-badge--live'}`}>
              {geometryPrepError ? 'Harita gecikiyor' : 'Cevre sinirlari isleniyor'}
            </span>
            <strong>
              {geometryPrepError ? 'Harita sinirlari hazirlanamadi' : 'Harita tarayicida adim adim hazirlaniyor'}
            </strong>
            <span>
              {geometryPrepError
                ? 'Ozet veri akisi calismaya devam eder. Sayfayi yenileyip tekrar deneyebilirsiniz.'
                : 'Buyuk poligonlar takilmamak icin parca parca isleniyor.'}
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
