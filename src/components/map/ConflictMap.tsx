import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'

import Feature from 'ol/Feature'
import { boundingExtent } from 'ol/extent'
import GeoJSON from 'ol/format/GeoJSON'
import { Draw, Modify, Select, Snap, Translate } from 'ol/interaction'
import { createBox, createRegularPolygon } from 'ol/interaction/Draw'
import { defaults as defaultInteractions } from 'ol/interaction/defaults'
import DragPan from 'ol/interaction/DragPan'
import LayerGroup from 'ol/layer/Group'
import TileLayer from 'ol/layer/Tile'
import VectorLayer from 'ol/layer/Vector'
import OlMap from 'ol/Map'
import View from 'ol/View'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import type Geometry from 'ol/geom/Geometry'
import { click, noModifierKeys, primaryAction } from 'ol/events/condition'
import { fromLonLat, transformExtent } from 'ol/proj'
import applyMapboxStyle from 'ol-mapbox-style'
import OSM from 'ol/source/OSM'
import VectorSource from 'ol/source/Vector'
import XYZ from 'ol/source/XYZ'
import { Circle as CircleStyle, Fill, Icon, RegularShape, Stroke, Style, Text } from 'ol/style'

import { LocationSearch } from '@/components/map/LocationSearch'
import { SceneBar } from '@/components/map/SceneBar'
import {
  createEmptyFeatureSources,
  createEmptyWorldFeatureCollections,
  doesMercatorExtentIntersect,
  elementToFeature,
  geometryToElementPatch,
  getArrowRotation,
  getSceneFallbackMercatorExtent,
  getSceneFeatureMatcher,
  getSelectionMercatorExtentFromCountryFeatures,
  isElementVisibleForScene,
  normalizeSceneRenderExtent,
  setLayerExtentRecursive,
  toLonLatPair,
  type WorldFeatureCollections,
  type WorldSources,
} from '@/components/map/conflictMapScene'
import { createAlertLayer, type AlertBindings } from '@/features/alerts/AlertMapLayer'
import {
  type AlertAudioRole,
  type AlertFeedStatus,
  DEFAULT_SCENARIO_ALERT_SETTINGS,
  formatAlertOccurredAtTr,
  formatAlertShelterInstruction,
  getAlertAudioSettingsForRole,
  getAlertAgeMinutes,
  getAlertSirenThrottleWindowMs,
  getAlertTypeLabel,
  type RocketAlert,
} from '@/features/alerts/types'
import { useAlertStore } from '@/features/alerts/useAlertStore'
import {
  createTzevaadomFeed,
  fetchTzevaadomHistory,
  getThreatLabel,
  getTzevaadomAlertInstanceId,
} from '@/features/alerts/tzevaadomService'
import { toUploadedAssetSnapshot } from '@/features/assets/assetSnapshots'
import { findSeedAssetById } from '@/features/assets/seedAssets'
import { createMissileLayer, type MissileBindings } from '@/features/missiles/MissileMapLayer'
import { formatEstimatedFlightMinutes, isLaunchCommandStale } from '@/features/missiles/flightAnimation'
import { haversineDistance } from '@/features/missiles/geodesic'
import { resolveMissileLaunchCoord, serializeCoord } from '@/features/missiles/launchSites'
import { getMissileById } from '@/features/missiles/missileData'
import { useMissileStore } from '@/features/missiles/useMissileStore'
import {
  getActiveScenePreset,
  getSceneSelectionExtent,
  getSceneSelectionMinZoom,
  getSceneSelectionViewport,
  hasActiveSceneSelection,
  isSceneCompatibleOpenFreeMapPreset,
  type SceneExtent,
  type SceneSelection,
} from '@/features/scenario/scenes'
import { useScenarioStore } from '@/features/scenario/store'
import type { ScenarioAssetElement, ScenarioDocument, ScenarioElement } from '@/features/scenario/model'
import { publicViewerSupabase } from '@/lib/backend/supabaseBackend'
import type { AssetDefinition } from '@/lib/backend/types'
import { appEnv } from '@/lib/env'
import { getOpenFreeMapStyleUrl, isOpenFreeMapPreset } from '@/lib/openfreemap'
import { withBasePath } from '@/lib/paths'
import { clamp } from '@/lib/utils'
import { createLogger } from '@/lib/logger'

type ConflictMapProps = {
  assets: AssetDefinition[]
  alertAudioRole?: AlertAudioRole
  readOnly: boolean
  visibleElementIds?: string[] | null
  assetDropRequest?: {
    nonce: number
    assetId: string
    clientX: number
    clientY: number
  } | null
}

type BasemapPreset = ScenarioDocument['basemap']['preset']
type BackgroundPreset = ScenarioDocument['stylePrefs']['backgroundPreset']
type LandPalette = ScenarioDocument['stylePrefs']['landPalette']
type LabelLocale = ScenarioDocument['labelOptions']['locale']

type MapTheme = {
  stageBackground: string
  liveWashFill: string
  labelColor: string
  labelHalo: string
  countryStroke: string
  adminStroke: string
  adminLabelColor: string
  cityFill: string
  cityStroke: string
  cityLabelColor: string
  disputedStroke: string
  disputedFill: string
}

const drawingTools = ['arrow', 'polyline', 'freehand', 'area', 'rectangle', 'circle', 'triangle'] as const
const shapeTools = ['rectangle', 'circle', 'triangle'] as const

function isShapeTool(tool: string): tool is (typeof shapeTools)[number] {
  return shapeTools.includes(tool as (typeof shapeTools)[number])
}
const VIEWPORT_COMMIT_DELAY_MS = 250
const VIEWPORT_SYNC_ANIMATION_MS = 120
const LONG_PRESS_DELAY_MS = 320
const LONG_PRESS_MOVE_TOLERANCE_PX = 10
const TOUCH_SELECT_HIT_TOLERANCE = 20
const TOUCH_VERTEX_TOLERANCE_PX = 18
const HUD_ROTATION_STEP = Math.PI / 12
const TAB_RESTORE_DEADLOCK_MS = 3000

type MovableHudElementKind = 'asset' | 'text' | 'polyline' | 'freehand' | 'polygon' | 'callout'

type ManipulationPreviewModel =
  | {
      kind: 'asset'
      src: string
      label: string
    }
  | {
      kind: 'text'
      label: string
    }
  | {
      kind: 'generic'
      label: string
    }

type SelectionHudModel = {
  elementId: string
  kind: MovableHudElementKind
  left: number
  top: number
  canScale: boolean
  locked: boolean
  scale?: number
  rotation: number
  isManipulating: boolean
  preview: ManipulationPreviewModel | null
}

type LongPressGestureState = {
  pointerId: number
  pointerType: 'touch' | 'pen'
  elementId: string
  feature: Feature<Geometry>
  startPixel: [number, number]
  lastCoordinate: [number, number]
  phase: 'pending' | 'dragging'
  timerId: number | null
}

type TabMapLifecycleState = 'active' | 'suspending' | 'restoring'

type SavedViewState = {
  center: [number, number] | null
  zoom: number
  rotation: number
}

type TabRestoreOverlayMode = 'frame' | 'scrim'
type AlertAudioUnlockState = 'locked' | 'priming' | 'unlocked' | 'blocked'

const log = createLogger('ConflictMap')

const landPalettes: Record<LandPalette, string[]> = {
  broadcast: [
    '#d9b286',
    '#e9d77d',
    '#b6d998',
    '#9dd1c8',
    '#acbee8',
    '#c8afd7',
    '#f1b7aa',
    '#d8deaf',
    '#9fc8ef',
  ],
  atlas: [
    '#caa885',
    '#ddd095',
    '#b8cf9f',
    '#9cc7bc',
    '#aeb8d8',
    '#c6b7cd',
    '#dcb5ac',
    '#cdd3af',
    '#a6c4db',
  ],
  muted: [
    '#c4a792',
    '#d8cba3',
    '#b3c39a',
    '#9ab8b7',
    '#a8b3ca',
    '#bdaec5',
    '#d1b2a7',
    '#c5caa9',
    '#9eb7cf',
  ],
}

const darkLandPalettes: Record<LandPalette, string[]> = {
  broadcast: [
    '#6d5943',
    '#6b6a3a',
    '#4f6941',
    '#426660',
    '#4d5c80',
    '#5d4f7b',
    '#7b5753',
    '#626746',
    '#456586',
  ],
  atlas: [
    '#665445',
    '#676040',
    '#526448',
    '#41605f',
    '#4d5870',
    '#5a5070',
    '#735856',
    '#5d6148',
    '#47627c',
  ],
  muted: [
    '#615449',
    '#625e46',
    '#4c5c47',
    '#42575b',
    '#495567',
    '#544d68',
    '#6c5656',
    '#555d4a',
    '#445a73',
  ],
}

function isDrawingTool(tool: string) {
  return drawingTools.includes(tool as (typeof drawingTools)[number])
}

function isShapeEditable(kind: ScenarioElement['kind']) {
  return kind === 'polyline' || kind === 'freehand' || kind === 'polygon'
}

function getMapTheme(backgroundPreset: BackgroundPreset): MapTheme {
  if (backgroundPreset === 'paper_light') {
    return {
      stageBackground:
        'linear-gradient(180deg, rgba(238, 243, 250, 0.96), rgba(226, 232, 242, 0.98)), radial-gradient(circle at top left, rgba(255, 255, 255, 0.88), transparent 30%)',
      liveWashFill: 'rgba(246, 249, 253, 0.42)',
      labelColor: '#24344f',
      labelHalo: 'rgba(255,255,255,0.92)',
      countryStroke: 'rgba(86, 98, 128, 0.34)',
      adminStroke: 'rgba(96, 108, 136, 0.26)',
      adminLabelColor: '#50607d',
      cityFill: '#24344f',
      cityStroke: '#ffffff',
      cityLabelColor: '#24344f',
      disputedStroke: '#e5397a',
      disputedFill: 'rgba(229, 57, 122, 0.04)',
    }
  }

  if (backgroundPreset === 'midnight') {
    return {
      stageBackground:
        'linear-gradient(180deg, rgba(24, 35, 66, 0.98), rgba(14, 22, 43, 1)), radial-gradient(circle at top left, rgba(80, 111, 182, 0.18), transparent 32%)',
      liveWashFill: 'rgba(18, 28, 52, 0.26)',
      labelColor: '#edf4ff',
      labelHalo: 'rgba(9, 15, 30, 0.92)',
      countryStroke: 'rgba(170, 198, 245, 0.24)',
      adminStroke: 'rgba(170, 198, 245, 0.2)',
      adminLabelColor: '#d6e5ff',
      cityFill: '#edf4ff',
      cityStroke: '#182342',
      cityLabelColor: '#edf4ff',
      disputedStroke: '#ff5c97',
      disputedFill: 'rgba(255, 92, 151, 0.08)',
    }
  }

  return {
    stageBackground:
      'linear-gradient(180deg, rgba(127, 184, 243, 0.52), rgba(142, 202, 255, 0.72)), radial-gradient(circle at top left, rgba(255, 255, 255, 0.8), transparent 28%)',
    liveWashFill: 'rgba(232, 241, 251, 0.36)',
    labelColor: '#0d1e3b',
    labelHalo: 'rgba(255,255,255,0.86)',
    countryStroke: 'rgba(33, 62, 110, 0.38)',
    adminStroke: 'rgba(48, 67, 105, 0.35)',
    adminLabelColor: '#3c4b67',
    cityFill: '#0d1e3b',
    cityStroke: '#ffffff',
    cityLabelColor: '#0d1e3b',
    disputedStroke: '#e5397a',
    disputedFill: 'rgba(229, 57, 122, 0.05)',
  }
}

function getCountryFill(colorIndex: number, landPalette: LandPalette, backgroundPreset: BackgroundPreset) {
  const palette =
    backgroundPreset === 'midnight'
      ? darkLandPalettes[landPalette]
      : landPalettes[landPalette]

  const normalized = Math.abs(colorIndex) % palette.length
  return palette[normalized]
}

function usesDeFactoLayers(preset: BasemapPreset) {
  return preset === 'de_facto_world'
}

function usesOpenFreeMapBasemap(preset: BasemapPreset) {
  return isOpenFreeMapPreset(preset)
}


function usesLiveBasemap(preset: BasemapPreset) {
  return preset === 'osm_standard' || preset === 'osm_humanitarian' || preset === 'open_topo'
}

function usesHgmBasemap(preset: BasemapPreset) {
  return (
    preset === 'hgm_temel' ||
    preset === 'hgm_gece' ||
    preset === 'hgm_siyasi' ||
    preset === 'hgm_yukseklik' ||
    preset === 'hgm_uydu'
  )
}

function usesRasterBasemap(preset: BasemapPreset) {
  return usesLiveBasemap(preset) || usesHgmBasemap(preset)
}

function getHgmTileUrl(preset: BasemapPreset, apiKey: string) {
  switch (preset) {
    case 'hgm_gece':
      return `https://atlas.harita.gov.tr/webservis/harita/hgm_gece/{z}/{x}/{y}.png?apikey=${apiKey}`
    case 'hgm_siyasi':
      return `https://atlas.harita.gov.tr/webservis/harita/hgm_siyasi/{z}/{x}/{y}.png?apikey=${apiKey}`
    case 'hgm_yukseklik':
      return `https://atlas.harita.gov.tr/webservis/harita/hgm_yukseklik/{z}/{x}/{y}.png?apikey=${apiKey}`
    case 'hgm_uydu':
      return `https://atlas.harita.gov.tr/webservis/ortofoto/{z}/{x}/{y}.jpg?apikey=${apiKey}`
    case 'hgm_temel':
    default:
      return `https://atlas.harita.gov.tr/webservis/harita/hgm_harita/{z}/{x}/{y}.png?apikey=${apiKey}`
  }
}

function getHgmOverlayUrl(preset: BasemapPreset, apiKey: string) {
  if (preset === 'hgm_uydu') {
    return `https://atlas.harita.gov.tr/webservis/harita/hgm_ortofoto/{z}/{x}/{y}.png?apikey=${apiKey}`
  }

  return ''
}

function withAlpha(rgbColor: string, alpha: number) {
  const match = rgbColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) {
    return rgbColor
  }

  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${clamp(alpha, 0, 1)})`
}

function getStringProperty(
  properties: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = properties[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return ''
}

function normalizeComparableLabel(value: string) {
  return value
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
}

function buildDualLabel(primary: string, secondary: string) {
  const first = primary.trim()
  const second = secondary.trim()

  if (!first) {
    return second
  }

  if (!second || normalizeComparableLabel(first) === normalizeComparableLabel(second)) {
    return first
  }

  return `${first}\n(${second})`
}

function getCountryLabel(
  properties: Record<string, unknown>,
  locale: LabelLocale,
) {
  const original = getStringProperty(properties, ['NAME', 'NAME_LONG'])
  const turkish = getStringProperty(properties, ['NAME_TR', 'NAME_LONG', 'NAME'])
  const english = getStringProperty(properties, ['NAME_LONG', 'NAME'])

  if (locale === 'dual') {
    return buildDualLabel(original || english, english)
  }

  if (locale === 'tr' || locale === 'intl') {
    return turkish
  }

  if (locale === 'en') {
    return english
  }

  return original
}

function getAdmin1Label(
  properties: Record<string, unknown>,
  locale: LabelLocale,
) {
  const original = getStringProperty(properties, ['name', 'NAME', 'name_en'])
  const turkish = getStringProperty(properties, ['name_tr', 'name_en', 'name', 'NAME'])
  const english = getStringProperty(properties, ['name_en', 'NAME', 'name'])

  if (locale === 'dual') {
    return buildDualLabel(original || english, english)
  }

  if (locale === 'tr' || locale === 'intl') {
    return turkish
  }

  if (locale === 'en') {
    return english
  }

  return original
}

function getCityLabel(
  properties: Record<string, unknown>,
  locale: LabelLocale,
) {
  const original = getStringProperty(properties, ['NAME', 'NAMEASCII', 'NAME_EN'])
  const turkish = getStringProperty(properties, ['NAME_TR', 'NAME_EN', 'NAMEASCII', 'NAME'])
  const english = getStringProperty(properties, ['NAME_EN', 'NAMEASCII', 'NAME'])

  if (locale === 'dual') {
    return buildDualLabel(original || english, english)
  }

  if (locale === 'tr' || locale === 'intl') {
    return turkish
  }

  if (locale === 'en') {
    return english
  }

  return original
}

function formatCountryLabel(text: string, locale: LabelLocale) {
  if (locale === 'dual') {
    return text
  }

  return locale === 'tr' || locale === 'intl'
    ? text.toLocaleUpperCase('tr-TR')
    : text.toUpperCase()
}

function getPointerType(event: { originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent }) {
  const originalEvent = event.originalEvent

  if (!originalEvent) {
    return 'mouse'
  }

  if ('pointerType' in originalEvent && typeof originalEvent.pointerType === 'string') {
    return originalEvent.pointerType
  }

  if (typeof TouchEvent !== 'undefined' && originalEvent instanceof TouchEvent) {
    return 'touch'
  }

  return 'mouse'
}

function isTouchPointer(event: { originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent }) {
  return getPointerType(event) === 'touch'
}

function isTouchLikePointer(event: { originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent }) {
  const pointerType = getPointerType(event)
  return pointerType === 'touch' || pointerType === 'pen'
}

function isMousePointer(event: { originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent }) {
  return getPointerType(event) === 'mouse'
}

function isEditingPointer(event: { originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent }) {
  const pointerType = getPointerType(event)
  return pointerType === 'mouse' || pointerType === 'pen'
}

function canUseToolWithEvent(
  tool: ScenarioDocument['selectedTool'],
  event: { originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent },
) {
  if (isEditingPointer(event)) {
    return true
  }

  return isTouchPointer(event) && tool !== 'select'
}

function getElementZoomFactor(element: ScenarioElement, currentZoom: number) {
  const referenceZoom = Number(element.meta.referenceZoom ?? currentZoom)
  return clamp(Math.pow(2, currentZoom - referenceZoom), 0.28, 6)
}

function getRenderPixelRatio() {
  if (typeof window === 'undefined' || typeof window.devicePixelRatio !== 'number') {
    return 1
  }

  return Math.min(window.devicePixelRatio, 1.5)
}

function isMovableHudElementKind(kind: ScenarioElement['kind']): kind is MovableHudElementKind {
  return (
    kind === 'asset' ||
    kind === 'text' ||
    kind === 'polyline' ||
    kind === 'freehand' ||
    kind === 'polygon' ||
    kind === 'callout'
  )
}

// ── Style object caches ──────────────────────────────────────────────────────

const _fillCache = new Map<string, Fill>()
function cachedFill(color: string): Fill {
  let f = _fillCache.get(color)
  if (!f) { f = new Fill({ color }); _fillCache.set(color, f) }
  return f
}

const _strokeCache = new Map<string, Stroke>()
function cachedStroke(color: string, width: number, lineDash?: number[]): Stroke {
  const key = `${color}|${width}${lineDash ? `|${lineDash.join(',')}` : ''}`
  let s = _strokeCache.get(key)
  if (!s) { s = new Stroke({ color, width, lineDash }); _strokeCache.set(key, s) }
  return s
}

const _iconCache = new Map<string, Icon>()
const ICON_CACHE_MAX = 400
function cachedIcon(src: string, rotation: number, scale: number): Icon {
  const rr = Math.round(rotation * 1000)
  const sr = Math.round(scale * 1000)
  const key = `${src}|${rr}|${sr}`
  let ic = _iconCache.get(key)
  if (!ic) {
    ic = new Icon({
      src,
      rotation,
      anchor: [0.5, 0.5],
      anchorXUnits: 'fraction',
      anchorYUnits: 'fraction',
      crossOrigin: 'anonymous',
      scale,
    })
    if (_iconCache.size > ICON_CACHE_MAX) {
      const firstKey = _iconCache.keys().next().value
      if (firstKey) _iconCache.delete(firstKey)
    }
    _iconCache.set(key, ic)
  }
  return ic
}

function scenarioStyle(
  feature: Feature<Geometry>,
  assets: Map<string, AssetDefinition>,
  selectedId: string | null,
  currentZoom: number,
) {
  const element = feature.get('element') as ScenarioElement | undefined
  if (!element) {
    return undefined
  }

  const isSelected = selectedId === element.id
  const highlightStroke = cachedStroke(
    isSelected ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0,0,0,0)',
    element.style.lineWidth + 3,
  )

if (element.kind === 'asset') {
  const asset = assets.get(element.assetId) ?? findSeedAssetById(element.assetId)

  const intrinsicWidth = Math.max(1, asset?.intrinsicWidth ?? 100)
  const intrinsicHeight = Math.max(1, asset?.intrinsicHeight ?? 100)
  const intrinsicMax = Math.max(intrinsicWidth, intrinsicHeight)

  const zoomFactor = getElementZoomFactor(element, currentZoom)

  const targetLongEdge = clamp(
    element.size * element.scale * (100 / 72) * zoomFactor,
    14,
    260,
  )

  const renderedWidth = targetLongEdge * (intrinsicWidth / intrinsicMax)
  const renderedHeight = targetLongEdge * (intrinsicHeight / intrinsicMax)

  const fallbackIcon = withBasePath('/seed-assets/custom-anchor.svg')

  const iconSrc =
    asset?.storagePath && asset.storagePath.trim().length > 0
      ? asset.storagePath
      : fallbackIcon

  const icon = cachedIcon(iconSrc, element.rotation, renderedWidth / intrinsicWidth)

  return [
    new Style({
      image: new CircleStyle({
        radius: Math.max(renderedWidth, renderedHeight) / 2 + (isSelected ? 10 : 0),
        fill: cachedFill(isSelected ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255,255,255,0)'),
        stroke: cachedStroke(isSelected ? '#fff4c1' : 'rgba(255,255,255,0)', 2),
      }),
      zIndex: element.zIndex,
    }),

    new Style({
      image: icon,
      text: element.label
        ? new Text({
            text: element.label,
            offsetY: renderedHeight * 0.7,
            font: '700 14px "Sora", sans-serif',
            fill: cachedFill('#0f1e38'),
            stroke: cachedStroke('rgba(255,255,255,0.9)', 4),
          })
        : undefined,
      zIndex: element.zIndex + 1,
    }),
  ]
}

  if (element.kind === 'text') {
    const zoomFactor = getElementZoomFactor(element, currentZoom)
    const renderedFontSize = clamp(element.fontSize * element.scale * zoomFactor, 12, 220)
    return [
      new Style({
        text: new Text({
          text: element.text,
          font: `${element.fontWeight} ${Math.round(renderedFontSize)}px "Sora", sans-serif`,
          textAlign: element.align,
          rotation: element.rotation,
          fill: cachedFill(element.style.textColor),
          stroke: cachedStroke(
            isSelected ? '#fff4c1' : 'rgba(255,255,255,0.92)',
            isSelected ? 6 : 5,
          ),
          backgroundFill: isSelected
            ? cachedFill('rgba(8, 15, 35, 0.1)')
            : undefined,
          padding: [2, 4, 2, 4],
        }),
        zIndex: element.zIndex,
      }),
    ]
  }

  if (element.kind === 'polygon') {
    return [
      new Style({
        stroke: highlightStroke,
        fill: cachedFill('rgba(255,255,255,0)'),
        zIndex: element.zIndex,
      }),
      new Style({
        stroke: cachedStroke(element.style.strokeColor, element.style.lineWidth),
        fill: cachedFill(element.style.fillColor),
        zIndex: element.zIndex + 1,
      }),
    ]
  }

  if (element.kind === 'callout') {
    return [
      new Style({
        stroke: highlightStroke,
        zIndex: element.zIndex,
      }),
      new Style({
        stroke: cachedStroke(element.style.strokeColor, element.style.lineWidth, element.style.lineDash),
        zIndex: element.zIndex + 1,
      }),
      new Style({
        geometry: new Point(fromLonLat(element.position)),
        text: new Text({
          text: element.text,
          offsetY: -18,
          font: '700 16px "Sora", sans-serif',
          fill: cachedFill(element.style.textColor),
          stroke: cachedStroke('rgba(255,255,255,0.94)', 4),
        }),
        zIndex: element.zIndex + 2,
      }),
    ]
  }

  const lineGeometry = feature.getGeometry() as LineString
  const lineCoords = lineGeometry.getCoordinates()

  const lineStyles = [
    new Style({
      stroke: highlightStroke,
      zIndex: element.zIndex,
    }),
    new Style({
      stroke: cachedStroke(element.style.strokeColor, element.style.lineWidth, element.style.lineDash),
      zIndex: element.zIndex + 1,
    }),
  ]

  if (element.style.endArrow) {
    lineStyles.push(
      new Style({
        geometry: new Point(lineCoords.at(-1) ?? lineCoords[0]),
        image: new RegularShape({
          points: 3,
          radius: 14,
          rotation: -getArrowRotation(lineCoords) + Math.PI / 2,
          fill: cachedFill(element.style.strokeColor),
          stroke: cachedStroke(isSelected ? '#fff4c1' : element.style.strokeColor, 1.5),
        }),
        zIndex: element.zIndex + 2,
      }),
    )
  }

  return lineStyles
}

function getAssetPreviewMeta(
  element: ScenarioAssetElement,
  assets: Map<string, AssetDefinition>,
) {
  const resolvedAsset = assets.get(element.assetId) ?? findSeedAssetById(element.assetId)
  const fallbackIcon = withBasePath('/seed-assets/custom-anchor.svg')
  const src =
    resolvedAsset?.storagePath && resolvedAsset.storagePath.trim().length > 0
      ? resolvedAsset.storagePath
      : element.assetSnapshot?.storagePath && element.assetSnapshot.storagePath.trim().length > 0
        ? element.assetSnapshot.storagePath
        : fallbackIcon

  return {
    src,
    label: element.label || resolvedAsset?.label || element.assetSnapshot?.label || 'Sembol',
  }
}

async function loadJson(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url} yüklenemedi.`)
  }

  return response.json()
}

export function ConflictMap({
  assets,
  alertAudioRole = 'editor',
  readOnly,
  visibleElementIds = null,
  assetDropRequest = null,
}: ConflictMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<OlMap | null>(null)
  const scenarioSourceRef = useRef<VectorSource | null>(null)
  const drawSourceRef = useRef<VectorSource | null>(null)
  const missileLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const missileBindingsRef = useRef<MissileBindings | null>(null)
  const alertLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const alertBindingsRef = useRef<AlertBindings | null>(null)
  const worldSourcesRef = useRef<WorldSources | null>(null)
  const allWorldFeaturesRef = useRef<WorldFeatureCollections>(createEmptyWorldFeatureCollections())
  const scenarioLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const countriesLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const admin1LayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const cityLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const disputedLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const liveWashLayerRef = useRef<VectorLayer<VectorSource> | null>(null)
  const openFreeMapGroupRef = useRef<LayerGroup | null>(null)
  const osmStandardLayerRef = useRef<TileLayer<OSM> | null>(null)
  const osmHumanitarianLayerRef = useRef<TileLayer<XYZ> | null>(null)
  const openTopoLayerRef = useRef<TileLayer<XYZ> | null>(null)
  const hgmBaseLayerRef = useRef<TileLayer<XYZ> | null>(null)
  const hgmOverlayLayerRef = useRef<TileLayer<XYZ> | null>(null)
  const dragPanInteractionRef = useRef<DragPan | null>(null)
  const selectInteractionRef = useRef<Select | null>(null)
  const modifyInteractionRef = useRef<Modify | null>(null)
  const translateInteractionRef = useRef<Translate | null>(null)
  const drawInteractionRef = useRef<Draw | null>(null)
  const isSyncingScenarioSourceRef = useRef(false)
  const isManipulatingSelectionRef = useRef(false)
  const activeManipulationFeatureRef = useRef<Feature<Geometry> | null>(null)
  const sceneExtentLonLatRef = useRef<SceneExtent | null>(null)
  const sceneExtentMercatorRef = useRef<number[] | null>(null)
  const longPressGestureRef = useRef<LongPressGestureState | null>(null)
  const touchVertexIntentRef = useRef<{ pointerId: number; elementId: string } | null>(null)
  const elementOrderRef = useRef<Map<string, number>>(new Map())
  const selectedElementId = useScenarioStore((state) => state.selectedElementId)
  const elements = useScenarioStore((state) => state.document.elements)
  const basemap = useScenarioStore((state) => state.document.basemap)
  const labelOptions = useScenarioStore((state) => state.document.labelOptions)
  const stylePrefs = useScenarioStore((state) => state.document.stylePrefs)
  const selectedTool = useScenarioStore((state) => state.document.selectedTool)
  const documentViewport = useScenarioStore((state) => state.document.viewport)
  const missileState = useScenarioStore((state) => state.document.missiles)
  const scene = useScenarioStore((state) => state.document.scene)
  const revision = useScenarioStore((state) => state.document.revision)
  const access = useScenarioStore((state) => state.access)
  const activeAssetId = useScenarioStore((state) => state.activeAssetId)
  const visibleElementIdSet = useMemo(
    () => (visibleElementIds ? new Set(visibleElementIds) : null),
    [visibleElementIds],
  )
  const visibleElements = useMemo(
    () =>
      visibleElementIdSet
        ? elements.filter((element) => visibleElementIdSet.has(element.id))
        : elements,
    [elements, visibleElementIdSet],
  )
  const selectedElement =
    elements.find((element) => element.id === selectedElementId) ?? null
  const missileRuntimeFlights = useMissileStore((state) => state.activeFlights)
  const missileConsumedLaunchIds = useMissileStore((state) => state.consumedLaunchIds)
  const setMissileRuntimeFlights = useMissileStore((state) => state.setRuntimeFlights)
  const markMissileLaunchConsumed = useMissileStore((state) => state.markLaunchConsumed)
  const resetMissileRuntime = useMissileStore((state) => state.resetRuntime)
  const alerts = useAlertStore((state) => state.alerts)
  const historyAlerts = useAlertStore((state) => state.historyAlerts)
  const alertRetentionMs = useAlertStore((state) => state.retentionMs)
  const selectedAlertId = useAlertStore((state) => state.selectedAlertId)
  const setAlertFeedStatus = useAlertStore((state) => state.setFeedStatus)
  const setAlertFeedTransport = useAlertStore((state) => state.setFeedTransport)
  const setAlertStoreAlerts = useAlertStore((state) => state.setAlerts)
  const mergeAlertHistoryIntoStore = useAlertStore((state) => state.mergeHistoryAlerts)
  const pruneAlertHistory = useAlertStore((state) => state.pruneHistoryAlerts)
  const pruneActiveAlerts = useAlertStore((state) => state.pruneActiveAlerts)
  const setSelectedAlertId = useAlertStore((state) => state.setSelectedAlertId)
  const clearAlertStore = useAlertStore((state) => state.clearAlerts)
  const setTzevaadomStatus = useAlertStore((state) => state.setTzevaadomStatus)
  const addSystemMessage = useAlertStore((state) => state.addSystemMessage)
  const focusedSystemMessageId = useAlertStore((state) => state.focusedSystemMessageId)
  const setFocusedSystemMessageId = useAlertStore((state) => state.setFocusedSystemMessageId)
  const systemMessages = useAlertStore((state) => state.systemMessages)
  const alertSettings = useScenarioStore((state) => state.document.alerts ?? DEFAULT_SCENARIO_ALERT_SETTINGS)
  const alertsEnabled = alertSettings.enabled
  const alertAutoZoomEnabled = alertSettings.autoZoomEnabled
  const activeAlertAudioSettings = useMemo(
    () => getAlertAudioSettingsForRole(alertSettings, alertAudioRole),
    [alertAudioRole, alertSettings],
  )
  const alertSoundEnabled = activeAlertAudioSettings.soundEnabled
  const alertVolume = activeAlertAudioSettings.volume
  const activeMissileDefinition = useMemo(() => {
    const activeMissileId = missileState?.activeMissileId ?? null
    if (activeMissileId) {
      return getMissileById(activeMissileId)
    }

    const fallbackSelectedId = missileState?.selectedMissileIds[0] ?? null
    return fallbackSelectedId ? getMissileById(fallbackSelectedId) : null
  }, [missileState?.activeMissileId, missileState?.selectedMissileIds])
  const activeMissileLaunchCoord = useMemo(
    () =>
      activeMissileDefinition
        ? resolveMissileLaunchCoord(activeMissileDefinition, missileState?.launchSiteByMissileId)
        : null,
    [activeMissileDefinition, missileState?.launchSiteByMissileId],
  )
  const setSelectedElementId = useScenarioStore((state) => state.setSelectedElementId)
  const setTool = useScenarioStore((state) => state.setTool)
  const setViewport = useScenarioStore((state) => state.setViewport)
  const setMissileTarget = useScenarioStore((state) => state.setMissileTarget)
  const addAssetElement = useScenarioStore((state) => state.addAssetElement)
  const addTextElement = useScenarioStore((state) => state.addTextElement)
  const addLinearElement = useScenarioStore((state) => state.addLinearElement)
  const addPolygonElement = useScenarioStore((state) => state.addPolygonElement)
  const eraserSize = useScenarioStore((state) => state.eraserSize)
  const penColor = useScenarioStore((state) => state.penColor)
  const removeElementById = useScenarioStore((state) => state.removeElementById)
  const toggleContinentScene = useScenarioStore((state) => state.toggleContinentScene)
  const setFocusScene = useScenarioStore((state) => state.setFocusScene)
  const clearSceneSelection = useScenarioStore((state) => state.clearSceneSelection)
  const eraserActiveRef = useRef(false)
  const eraserSizeRef = useRef(eraserSize)
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number } | null>(null)
  const [zoom, setZoom] = useState(documentViewport.zoom)
  const [mapError, setMapError] = useState<string | null>(null)
  const [selectionHud, setSelectionHud] = useState<SelectionHudModel | null>(null)
  const [tabLifecycleState, setTabLifecycleState] = useState<TabMapLifecycleState>('active')
  const [alertNow, setAlertNow] = useState(() => Date.now())
  const [alertAudioUnlockState, setAlertAudioUnlockState] = useState<AlertAudioUnlockState>('locked')
  const [inlineTextInput, setInlineTextInput] = useState<{
    coordinate: [number, number]
    text: string
    left: number
    top: number
  } | null>(null)
  const inlineTextRef = useRef<HTMLTextAreaElement | null>(null)
  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const manipulationPreview = selectionHud?.isManipulating ? selectionHud.preview : null
  const sceneSystemEnabled = appEnv.enableSceneSystem
  const sceneFocusPreset = scene.focusPreset
  const sceneContinentKey = scene.activeContinents.join(',')
  const sceneSelectionKey = `${sceneFocusPreset ?? 'none'}:${sceneContinentKey}`
  const hasSceneSelection = hasActiveSceneSelection(scene)
  const fallbackSceneExtent = useMemo(
    () =>
      getSceneSelectionExtent({
        focusPreset: sceneFocusPreset,
        activeContinents: sceneContinentKey
          ? (sceneContinentKey.split(',') as SceneSelection['activeContinents'])
          : [],
      }),
    [sceneContinentKey, sceneFocusPreset],
  )
  const labelOptionsRef = useRef(labelOptions)
  const basemapRef = useRef(basemap)
  const stylePrefsRef = useRef(stylePrefs)
  const mapThemeRef = useRef(getMapTheme(stylePrefs.backgroundPreset))
  const zoomRef = useRef(zoom)
  const selectedElementIdRef = useRef(selectedElementId)
  const assetMapRef = useRef(assetMap)
  const readOnlyRef = useRef(readOnly)
  const initialViewportRef = useRef(documentViewport)
  const alertsEnabledRef = useRef(alertsEnabled)
  const alertSoundEnabledRef = useRef(alertSoundEnabled)
  const alertVolumeRef = useRef(alertVolume)
  const viewportCommitTimeoutRef = useRef<number | null>(null)
  const tabLifecycleStateRef = useRef<TabMapLifecycleState>('active')
  const savedViewStateRef = useRef<SavedViewState | null>(null)
  const restoreTokenRef = useRef(0)
  const restoreDeadlockTimeoutRef = useRef<number | null>(null)
  const frozenFrameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const restoreOverlayRef = useRef<HTMLDivElement | null>(null)
  const restoreFinalizeFrameRef = useRef<number | null>(null)
  const restoreFinalizeSecondFrameRef = useRef<number | null>(null)
  const restoreFinalizeTokenRef = useRef(0)
  const restoreFinalizeSourceRef = useRef<'rendercomplete' | 'timeout' | null>(null)
  const alertAudioRef = useRef<HTMLAudioElement | null>(null)
  const alertAudioUnlockStateRef = useRef<AlertAudioUnlockState>('locked')
  const alertAudioPrimePromiseRef = useRef<Promise<void> | null>(null)
  const alertPendingSirenAfterUnlockRef = useRef(false)
  const alertSirenPlayPendingRef = useRef(false)
  const alertLastSirenStartedAtRef = useRef(0)
  const alertSirenDurationMsRef = useRef(1000)
  const alertAutoZoomMutedUntilRef = useRef(0)
  const pendingAlertAutoZoomRef = useRef<RocketAlert[]>([])
  const alertSkipSelectedFocusOnceRef = useRef(false)
  const openFreeMapStyleUrlRef = useRef<string | null>(null)
  const openFreeMapRequestIdRef = useRef(0)
  const shownMissileRangeIdsRef = useRef<Map<string, string>>(new Map())
  const focusedAlertIdRef = useRef<string | null>(null)

  useEffect(() => {
    labelOptionsRef.current = labelOptions
    basemapRef.current = basemap
    stylePrefsRef.current = stylePrefs
    mapThemeRef.current = getMapTheme(stylePrefs.backgroundPreset)
    zoomRef.current = zoom
    selectedElementIdRef.current = selectedElementId
    assetMapRef.current = assetMap
    readOnlyRef.current = readOnly
    eraserSizeRef.current = eraserSize
    tabLifecycleStateRef.current = tabLifecycleState
    alertsEnabledRef.current = alertsEnabled
    alertSoundEnabledRef.current = alertSoundEnabled
    alertVolumeRef.current = alertVolume
    alertAudioUnlockStateRef.current = alertAudioUnlockState
    elementOrderRef.current = new Map(visibleElements.map((element, index) => [element.id, index]))
  }, [alertAudioUnlockState, alertSoundEnabled, alertVolume, alertsEnabled, assetMap, basemap, visibleElements, labelOptions, stylePrefs, eraserSize, readOnly, selectedElementId, tabLifecycleState, zoom])

  useEffect(() => {
    if (!alertsEnabled || (!selectedAlertId && alerts.length === 0)) {
      return
    }

    const timerId = window.setInterval(() => {
      setAlertNow(Date.now())
    }, 30_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [alerts.length, alertsEnabled, selectedAlertId])

  const muteAlertAutoZoom = useEffectEvent(() => {
    alertAutoZoomMutedUntilRef.current = Date.now() + 15_000
  })

  const mergeAlertBatchForAutoZoom = useEffectEvent((incomingAlerts: RocketAlert[]) => {
    const merged = new Map<string, RocketAlert>()

    for (const alert of pendingAlertAutoZoomRef.current) {
      merged.set(alert.id, alert)
    }

    for (const alert of incomingAlerts) {
      merged.set(alert.id, alert)
    }

    pendingAlertAutoZoomRef.current = Array.from(merged.values()).sort((left, right) => {
      if (right.occurredAtMs !== left.occurredAtMs) {
        return right.occurredAtMs - left.occurredAtMs
      }

      return right.timeStampRaw.localeCompare(left.timeStampRaw, 'en')
    })
  })

  const applyAlertBatchFocus = useEffectEvent(
    (incomingAlerts: RocketAlert[], options?: { bypassMute?: boolean }) => {
      if (!alertAutoZoomEnabled || incomingAlerts.length === 0) {
        return
      }

      if (!options?.bypassMute && Date.now() < alertAutoZoomMutedUntilRef.current) {
        return
      }

      const scenarioState = useScenarioStore.getState()
      const missileRuntimeState = useMissileStore.getState()
      if (
        scenarioState.access === 'editor' &&
        (scenarioState.document.selectedTool !== 'select' || missileRuntimeState.isTargetPickArmed)
      ) {
        return
      }

      const map = mapRef.current
      const view = map?.getView()
      if (!map || !view || tabLifecycleStateRef.current !== 'active') {
        mergeAlertBatchForAutoZoom(incomingAlerts)
        return
      }

      const sortedIncomingAlerts = [...incomingAlerts].sort((left, right) => {
        if (right.occurredAtMs !== left.occurredAtMs) {
          return right.occurredAtMs - left.occurredAtMs
        }

        return right.timeStampRaw.localeCompare(left.timeStampRaw, 'en')
      })

      const newestAlert = sortedIncomingAlerts[0]
      if (!newestAlert) {
        return
      }

      focusedAlertIdRef.current = newestAlert.id

      // citiesDetail varsa tüm şehirlerin koordinatlarını topla
      const allPoints: [number, number][] = []
      for (const alert of sortedIncomingAlerts) {
        if (alert.citiesDetail && alert.citiesDetail.length > 0) {
          for (const city of alert.citiesDetail) {
            if (city.lat !== 0 || city.lon !== 0) allPoints.push([city.lon, city.lat])
          }
        } else if (alert.lat !== 0 || alert.lon !== 0) {
          allPoints.push([alert.lon, alert.lat])
        }
      }

      if (allPoints.length === 0) return

      if (allPoints.length === 1) {
        const currentZoom = view.getZoom() ?? documentViewport.zoom
        view.animate({
          center: fromLonLat(allPoints[0]),
          zoom: Math.max(currentZoom, 7.5),
          duration: 450,
        })
        return
      }

      const extent = boundingExtent(allPoints.map((p) => fromLonLat(p)))
      view.fit(extent, {
        duration: 500,
        maxZoom: 8.5,
        padding: [96, 56, 56, 56],
      })
    },
  )

  const flushPendingAlertAutoZoom = useEffectEvent(() => {
    if (pendingAlertAutoZoomRef.current.length === 0) {
      return
    }

    const pendingAlerts = pendingAlertAutoZoomRef.current
    pendingAlertAutoZoomRef.current = []
    applyAlertBatchFocus(pendingAlerts, { bypassMute: true })
  })

  const focusAlertBatch = useEffectEvent((incomingAlerts: RocketAlert[]) => {
    if (!alertAutoZoomEnabled || incomingAlerts.length === 0) {
      return
    }

    if (
      window.document.hidden ||
      window.document.visibilityState !== 'visible' ||
      tabLifecycleStateRef.current !== 'active'
    ) {
      mergeAlertBatchForAutoZoom(incomingAlerts)
      return
    }

    applyAlertBatchFocus(incomingAlerts)
  })

  // refreshAlertHistory removed — Tzeva Adom relay handles history via Supabase

  const setAudioUnlockState = useCallback((nextState: AlertAudioUnlockState) => {
    alertAudioUnlockStateRef.current = nextState
    setAlertAudioUnlockState(nextState)
  }, [])

  const getOrCreateAlertAudio = useCallback(() => {
    if (alertAudioRef.current) {
      return alertAudioRef.current
    }

    const nextAudio = new Audio(withBasePath('/sounds/siren.mp3'))
    nextAudio.preload = 'auto'

    const syncDuration = () => {
      if (Number.isFinite(nextAudio.duration) && nextAudio.duration > 0) {
        alertSirenDurationMsRef.current = Math.round(nextAudio.duration * 1000)
      }
    }

    nextAudio.addEventListener('loadedmetadata', syncDuration)
    nextAudio.addEventListener('durationchange', syncDuration)
    alertAudioRef.current = nextAudio
    return nextAudio
  }, [])

  const stopAlertSiren = useCallback(() => {
    alertPendingSirenAfterUnlockRef.current = false
    alertSirenPlayPendingRef.current = false
    if (!alertAudioRef.current) {
      return
    }

    alertAudioRef.current.pause()
    alertAudioRef.current.currentTime = 0
  }, [])

  const playAlertSiren = useCallback((fromPendingUnlock = false) => {
    if (!alertsEnabledRef.current || !alertSoundEnabledRef.current || alertVolumeRef.current <= 0) {
      return
    }

    if (alertAudioUnlockStateRef.current === 'priming' && !fromPendingUnlock) {
      alertPendingSirenAfterUnlockRef.current = true
      return
    }

    if (alertSirenPlayPendingRef.current) {
      return
    }

    const audio = getOrCreateAlertAudio()
    if (!audio.paused) {
      return
    }

    const now = Date.now()
    if (
      now - alertLastSirenStartedAtRef.current <
      getAlertSirenThrottleWindowMs(alertSirenDurationMsRef.current)
    ) {
      return
    }

    audio.volume = alertVolumeRef.current
    audio.currentTime = 0
    alertSirenPlayPendingRef.current = true

    void audio
      .play()
      .then(() => {
        alertSirenPlayPendingRef.current = false
        alertLastSirenStartedAtRef.current = Date.now()
        setAudioUnlockState('unlocked')
      })
      .catch(() => {
        alertSirenPlayPendingRef.current = false
        if (alertAudioUnlockStateRef.current === 'priming') {
          alertPendingSirenAfterUnlockRef.current = true
          return
        }

        setAudioUnlockState('blocked')
      })
  }, [getOrCreateAlertAudio, setAudioUnlockState])

  const primeAlertAudio = useCallback(() => {
    if (!alertsEnabledRef.current || !alertSoundEnabledRef.current || alertVolumeRef.current <= 0) {
      return
    }

    if (alertAudioUnlockStateRef.current === 'unlocked') {
      return
    }

    if (alertAudioPrimePromiseRef.current) {
      return
    }

    const audio = getOrCreateAlertAudio()
    audio.load()
    setAudioUnlockState('priming')
    audio.volume = 0
    audio.currentTime = 0

    const primePromise = audio
      .play()
      .then(() => {
        audio.pause()
        audio.currentTime = 0
        audio.volume = alertVolumeRef.current
        setAudioUnlockState('unlocked')
      })
      .then(() => {
        if (
          alertPendingSirenAfterUnlockRef.current &&
          alertsEnabledRef.current &&
          alertSoundEnabledRef.current &&
          alertVolumeRef.current > 0
        ) {
          alertPendingSirenAfterUnlockRef.current = false
          window.setTimeout(() => {
            playAlertSiren(true)
          }, 0)
        }
      })
      .catch(() => {
        alertPendingSirenAfterUnlockRef.current = false
        setAudioUnlockState('blocked')
      })
      .finally(() => {
        alertAudioPrimePromiseRef.current = null
      })

    alertAudioPrimePromiseRef.current = primePromise
  }, [getOrCreateAlertAudio, playAlertSiren, setAudioUnlockState])

  useEffect(() => {
    if (!alertsEnabled || !alertSoundEnabled || alertVolume <= 0) {
      stopAlertSiren()
      return
    }

    const audio = getOrCreateAlertAudio()
    audio.load()

    const primeFromUserGesture = () => {
      primeAlertAudio()
    }

    window.addEventListener('pointerdown', primeFromUserGesture, { passive: true })
    window.addEventListener('keydown', primeFromUserGesture)

    return () => {
      window.removeEventListener('pointerdown', primeFromUserGesture)
      window.removeEventListener('keydown', primeFromUserGesture)
    }
  }, [alertSoundEnabled, alertVolume, alertsEnabled, getOrCreateAlertAudio, primeAlertAudio, stopAlertSiren])

  useEffect(() => {
    if (!alertAudioRef.current) {
      return
    }

    alertAudioRef.current.volume = alertVolume
  }, [alertVolume])

  useEffect(() => {
    return () => {
      if (alertAudioRef.current) {
        alertAudioRef.current.pause()
        alertAudioRef.current.currentTime = 0
        alertAudioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!alertsEnabled) {
      clearAlertStore()
      stopAlertSiren()
      setSelectedAlertId(null)
      setAlertFeedStatus('disconnected')
      setAlertFeedTransport('none')
      return
    }
  }, [
    alertsEnabled,
    clearAlertStore,
    setAlertFeedStatus,
    setAlertFeedTransport,
    setSelectedAlertId,
    stopAlertSiren,
  ])

  useEffect(() => {
    if (!alertsEnabled) {
      return
    }

    const handleVisibilityChange = () => {
      if (window.document.hidden) {
        return
      }

      flushPendingAlertAutoZoom()
    }

    window.document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [alertsEnabled])

  useEffect(() => {
    if (alertsEnabled && alertAutoZoomEnabled) {
      return
    }

    pendingAlertAutoZoomRef.current = []
  }, [alertAutoZoomEnabled, alertsEnabled])

  useEffect(() => {
    if (!alertsEnabled) {
      return
    }

    const timerId = window.setInterval(() => {
      pruneAlertHistory(Date.now())
    }, 60_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [alertsEnabled, pruneAlertHistory])

  useEffect(() => {
    if (!alertsEnabled || alerts.length === 0) {
      return
    }

    const now = Date.now()
    const nextExpiryAtMs = Math.min(...alerts.map((alert) => alert.occurredAtMs + alertRetentionMs))
    const delayMs = Math.max(0, nextExpiryAtMs - now)

    const timerId = window.setTimeout(() => {
      pruneActiveAlerts(Date.now())
    }, delayMs)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [alertRetentionMs, alerts, alertsEnabled, pruneActiveAlerts])

  // ── Tzeva Adom WebSocket Feed ──
  useEffect(() => {
    if (!alertsEnabled || !appEnv.tzevaadomRelayUrl) return

    const tzevaadomFeed = createTzevaadomFeed({
      url: appEnv.tzevaadomRelayUrl,
      onAlert: (tzAlert) => {
        log.debug('Tzeva Adom alert', { cities: tzAlert.cities, threat: tzAlert.threat })
        const threatLabel = getThreatLabel(tzAlert.threat)
        const enriched = tzAlert.citiesEnriched ?? []
        const citiesEn = enriched.length > 0
          ? enriched.map((c) => c.en).join(', ')
          : tzAlert.cities.join(', ') || 'Bilinmeyen bölge'
        const firstWithCoord = enriched.find((c) => c.lat != null && c.lng != null)

        // Her şehrin ayrı koordinatını sakla (haritada ayrı pin için)
        const citiesDetail = enriched
          .filter((c) => c.lat != null && c.lng != null)
          .map((c) => ({ name: c.en || c.he, lat: c.lat!, lon: c.lng!, zone: c.zone_en || '', countdown: c.countdown ?? 0 }))
        const alertId = getTzevaadomAlertInstanceId(tzAlert)

        const rocketAlert: RocketAlert = {
          id: alertId,
          name: `${tzAlert.isDrill ? '[TATBIKAT] ' : ''}${threatLabel}`,
          englishName: citiesEn,
          lat: firstWithCoord?.lat ?? 0,
          lon: firstWithCoord?.lng ?? 0,
          alertTypeId: (tzAlert.threat === 5 ? 2 : 1) as 1 | 2,
          countdownSec: firstWithCoord?.countdown ?? 0,
          areaNameEn: firstWithCoord?.zone_en ?? citiesEn,
          timeStampRaw: new Date(tzAlert.time * 1000).toISOString(),
          occurredAtMs: tzAlert.time * 1000,
          fetchedAtMs: Date.now(),
          taCityId: null,
          citiesDetail: citiesDetail.length > 0 ? citiesDetail : undefined,
        }
        mergeAlertHistoryIntoStore([rocketAlert])
        const currentAlerts = useAlertStore.getState().alerts
        const merged = [...currentAlerts.filter((a) => a.id !== rocketAlert.id), rocketAlert]
        setAlertStoreAlerts(merged, Date.now())

        // Siren çal
        playAlertSiren()

        // Auto-zoom
        if (alertAutoZoomEnabled && firstWithCoord) {
          focusAlertBatch([rocketAlert])
        }
      },
      onSystemMessage: (message) => {
        log.info('Tzeva Adom system message', {
          type: message.type,
          titleEn: message.titleEn,
          bodyEn: message.bodyEn,
        })
        // Sadece incident_ended ve early_warning göster, unknown/diğerlerini atla
        if (message.type === 'incident_ended' || message.type === 'early_warning') {
          addSystemMessage(message)
        }
      },
      onStatusChange: (status) => {
        setTzevaadomStatus(status)
        // Feed status'u ana alarm paneline de yansıt
        const statusMap: Record<string, AlertFeedStatus> = {
          connected: 'live',
          connecting: 'connecting',
          error: 'error',
          disconnected: 'disconnected',
        }
        setAlertFeedStatus(statusMap[status] ?? 'disconnected')
        if (status === 'connected') setAlertFeedTransport('stream')
      },
    })

    // Supabase'den son 24 saatteki geçmiş alertleri çek
    if (publicViewerSupabase) {
      fetchTzevaadomHistory(publicViewerSupabase, 24).then(({ alerts: histAlerts, systemMessages: histMsgs }) => {
        const asRocketAlerts = histAlerts.map((a) => {
          const threatLabel = getThreatLabel(a.threat)
          const enriched = a.citiesEnriched ?? []
          const citiesEn = enriched.length > 0
            ? enriched.map((c) => c.en).join(', ')
            : a.cities.join(', ') || 'Bilinmeyen bölge'
          const firstWithCoord = enriched.find((c) => c.lat != null && c.lng != null)
          const occurredAtMs = a.time * 1000
          const citiesDetail = enriched
            .filter((c) => c.lat != null && c.lng != null)
            .map((c) => ({ name: c.en || c.he, lat: c.lat!, lon: c.lng!, zone: c.zone_en || '', countdown: c.countdown ?? 0 }))
          return {
            id: getTzevaadomAlertInstanceId(a),
            name: `${a.isDrill ? '[TATBIKAT] ' : ''}${threatLabel}`,
            englishName: citiesEn,
            lat: firstWithCoord?.lat ?? 0,
            lon: firstWithCoord?.lng ?? 0,
            alertTypeId: (a.threat === 5 ? 2 : 1) as 1 | 2,
            countdownSec: firstWithCoord?.countdown ?? 0,
            areaNameEn: firstWithCoord?.zone_en ?? citiesEn,
            timeStampRaw: new Date(occurredAtMs).toISOString(),
            occurredAtMs,
            fetchedAtMs: occurredAtMs,
            taCityId: null,
            citiesDetail: citiesDetail.length > 0 ? citiesDetail : undefined,
          }
        })
        if (asRocketAlerts.length > 0) {
          mergeAlertHistoryIntoStore(asRocketAlerts)
        }
        // System message'ları (sadece incident_ended ve early_warning) ekle
        for (const msg of histMsgs) {
          if (msg.type === 'incident_ended' || msg.type === 'early_warning') {
            addSystemMessage(msg)
          }
        }
      }).catch(() => { /* ignore */ })
    }

    tzevaadomFeed.start()
    return () => {
      tzevaadomFeed.stop()
    }
  }, [alertsEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const hideEraserCursor = useEffectEvent(() => {
    setEraserCursor(null)
  })

  const syncFeatureGeometry = useEffectEvent((feature: Feature<Geometry>) => {
    const elementId = String(feature.get('elementId'))
    const current = useScenarioStore
      .getState()
      .document.elements.find((element) => element.id === elementId)

    if (!current) {
      return
    }

    useScenarioStore
      .getState()
      .updateElement(elementId, () => geometryToElementPatch(feature, current))
  })

  const getSelectedScenarioFeature = useEffectEvent(() => {
    const source = scenarioSourceRef.current
    const currentSelectedElementId = selectedElementIdRef.current
    if (!source || !currentSelectedElementId) {
      return null
    }

    return (source.getFeatureById(currentSelectedElementId) as Feature<Geometry> | null) ?? null
  })

  const getScenarioFeaturesAtPixel = useEffectEvent((pixel: [number, number], hitTolerance = 18) => {
    const map = mapRef.current
    const scenarioLayer = scenarioLayerRef.current
    if (!map || !scenarioLayer) {
      return [] as Feature<Geometry>[]
    }

    const matches: Feature<Geometry>[] = []
    const seenIds = new Set<string>()

    map.forEachFeatureAtPixel(
      pixel,
      (feature, layer) => {
        if (layer !== scenarioLayer) {
          return undefined
        }

        const typedFeature = feature as Feature<Geometry>
        const element = typedFeature.get('element') as ScenarioElement | undefined
        const elementId = element?.id ?? String(typedFeature.get('elementId') ?? typedFeature.getId() ?? '')
        if (!elementId || seenIds.has(elementId)) {
          return undefined
        }

        seenIds.add(elementId)
        matches.push(typedFeature)
        return undefined
      },
      { hitTolerance },
    )

    return matches.sort((left, right) => {
      const leftElement = left.get('element') as ScenarioElement | undefined
      const rightElement = right.get('element') as ScenarioElement | undefined
      if (!leftElement || !rightElement) {
        return 0
      }

      if (leftElement.zIndex !== rightElement.zIndex) {
        return rightElement.zIndex - leftElement.zIndex
      }

      return (
        (elementOrderRef.current.get(rightElement.id) ?? -1) -
        (elementOrderRef.current.get(leftElement.id) ?? -1)
      )
    })
  })

  const pickScenarioFeatureAtPixel = useEffectEvent((pixel: [number, number], hitTolerance = 18) => {
    return getScenarioFeaturesAtPixel(pixel, hitTolerance)[0] ?? null
  })

  const isPointerNearSelectedShapeVertex = useEffectEvent((pixel: [number, number]) => {
    const map = mapRef.current
    const feature = getSelectedScenarioFeature()
    const element = feature?.get('element') as ScenarioElement | undefined
    if (!map || !feature || !element || !isShapeEditable(element.kind)) {
      return false
    }

    const geometry = feature.getGeometry()
    if (!geometry) {
      return false
    }

    let vertices: number[][] = []

    if (geometry instanceof LineString) {
      vertices = geometry.getCoordinates()
    } else if (geometry instanceof Polygon) {
      const ring = geometry.getCoordinates()[0] ?? []
      vertices = ring.length > 1 ? ring.slice(0, -1) : ring
    }

    return vertices.some((coordinate) => {
      const vertexPixel = map.getPixelFromCoordinate(coordinate)
      if (!vertexPixel) {
        return false
      }

      return Math.hypot(vertexPixel[0] - pixel[0], vertexPixel[1] - pixel[1]) <= TOUCH_VERTEX_TOLERANCE_PX
    })
  })

  const syncInlineTextPosition = useEffectEvent(() => {
    const map = mapRef.current
    if (!map || !inlineTextInput) return
    const pixel = map.getPixelFromCoordinate(fromLonLat(inlineTextInput.coordinate))
    if (!pixel) return
    setInlineTextInput((prev) =>
      prev ? { ...prev, left: pixel[0], top: pixel[1] } : null,
    )
  })

  const syncSelectionHud = useEffectEvent(() => {
    const map = mapRef.current
    if (tabLifecycleStateRef.current !== 'active') {
      setSelectionHud(null)
      return
    }
    if (!isManipulatingSelectionRef.current && !selectedElementIdRef.current) {
      activeManipulationFeatureRef.current = null
    }
    const selectedFeature = getSelectedScenarioFeature()
    if (
      !isManipulatingSelectionRef.current &&
      activeManipulationFeatureRef.current &&
      selectedElementIdRef.current &&
      String(activeManipulationFeatureRef.current.get('elementId')) !== selectedElementIdRef.current
    ) {
      activeManipulationFeatureRef.current = null
    }
    const manipulationFeature = activeManipulationFeatureRef.current
    const fallbackFeature =
      !manipulationFeature && !selectedFeature && selectedElement
        ? elementToFeature(selectedElement)
        : null
    const liveFeature = manipulationFeature ?? selectedFeature ?? fallbackFeature
    const liveFeatureElementId = liveFeature ? String(liveFeature.get('elementId')) : null
    const liveElement =
      selectedElement && selectedElement.id === liveFeatureElementId
        ? selectedElement
        : ((liveFeature?.get('element') as ScenarioElement | undefined) ?? null)
    if (
      !map ||
      !liveElement ||
      !isMovableHudElementKind(liveElement.kind) ||
      readOnly ||
      access !== 'editor'
    ) {
      setSelectionHud(null)
      return
    }

    if (
      !isManipulatingSelectionRef.current &&
      manipulationFeature &&
      selectedFeature &&
      String(selectedFeature.get('elementId')) === String(manipulationFeature.get('elementId'))
    ) {
      activeManipulationFeatureRef.current = null
    }

    const geometry = liveFeature?.getGeometry()
    if (!geometry || !isMovableHudElementKind(liveElement.kind)) {
      setSelectionHud(null)
      return
    }

    let coordinate: [number, number] | null = null
    if ((liveElement.kind === 'asset' || liveElement.kind === 'text') && geometry instanceof Point) {
      coordinate = geometry.getCoordinates() as [number, number]
    } else {
      const extent = geometry.getExtent()
      coordinate = [((extent[0] + extent[2]) / 2) as number, extent[3] as number]
    }

    const pixel = map.getPixelFromCoordinate(coordinate)
    if (!pixel) {
      setSelectionHud(null)
      return
    }

    const preview =
      isManipulatingSelectionRef.current
        ? liveElement.kind === 'asset'
          ? (() => {
              const assetPreview = getAssetPreviewMeta(liveElement, assetMapRef.current)
              return {
                kind: 'asset' as const,
                src: assetPreview.src,
                label: assetPreview.label,
              }
            })()
          : liveElement.kind === 'text'
            ? {
                kind: 'text' as const,
                label: liveElement.text,
              }
            : {
                kind: 'generic' as const,
                label: 'Tasiniyor',
              }
        : null

    setSelectionHud({
      elementId: liveElement.id,
      kind: liveElement.kind,
      left: pixel[0],
      top: pixel[1] - 54,
      canScale: liveElement.kind === 'asset' || liveElement.kind === 'text',
      locked: liveElement.locked,
      isManipulating: isManipulatingSelectionRef.current,
      rotation: liveElement.rotation,
      scale:
        liveElement.kind === 'asset' || liveElement.kind === 'text'
          ? liveElement.scale
          : undefined,
      preview,
    })
  })

  const captureFrozenMapFrame = useEffectEvent((): TabRestoreOverlayMode => {
    const targetElement = mapElementRef.current
    const overlayCanvas = frozenFrameCanvasRef.current
    if (!targetElement || !overlayCanvas) {
      return 'scrim'
    }

    const bounds = targetElement.getBoundingClientRect()
    const width = Math.max(1, Math.round(bounds.width))
    const height = Math.max(1, Math.round(bounds.height))
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1)
    const context = overlayCanvas.getContext('2d')
    if (!context || width === 0 || height === 0) {
      return 'scrim'
    }

    overlayCanvas.width = Math.max(1, Math.round(width * pixelRatio))
    overlayCanvas.height = Math.max(1, Math.round(height * pixelRatio))
    overlayCanvas.style.width = `${width}px`
    overlayCanvas.style.height = `${height}px`

    context.save()
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    context.clearRect(0, 0, width, height)

    let drewAtLeastOneCanvas = false

    try {
      const canvases = Array.from(targetElement.querySelectorAll('canvas')).filter(
        (canvas): canvas is HTMLCanvasElement => canvas instanceof HTMLCanvasElement,
      )

      for (const canvas of canvases) {
        if (canvas.width === 0 || canvas.height === 0) {
          continue
        }

        const canvasStyle = window.getComputedStyle(canvas)
        if (canvasStyle.display === 'none' || canvasStyle.visibility === 'hidden') {
          continue
        }

        const rect = canvas.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) {
          continue
        }

        const opacitySource = canvas.parentElement ?? canvas
        const opacity = Number.parseFloat(window.getComputedStyle(opacitySource).opacity || '1')
        context.globalAlpha = Number.isFinite(opacity) ? opacity : 1
        context.drawImage(
          canvas,
          rect.left - bounds.left,
          rect.top - bounds.top,
          rect.width,
          rect.height,
        )
        drewAtLeastOneCanvas = true
      }
    } catch {
      context.restore()
      context.clearRect(0, 0, width, height)
      return 'scrim'
    }

    context.restore()
    return drewAtLeastOneCanvas ? 'frame' : 'scrim'
  })

  const showRestoreOverlay = useEffectEvent((mode: TabRestoreOverlayMode) => {
    const overlay = restoreOverlayRef.current
    if (!overlay) {
      return
    }

    overlay.dataset.restoreOverlay = mode
  })

  const hideRestoreOverlay = useEffectEvent(() => {
    const overlay = restoreOverlayRef.current
    if (!overlay) {
      return
    }

    delete overlay.dataset.restoreOverlay
  })

  const rebuildOpenLayersSelectionFromStore = useEffectEvent(() => {
    const selectInteraction = selectInteractionRef.current
    const source = scenarioSourceRef.current
    if (!selectInteraction) {
      return
    }

    const collection = selectInteraction.getFeatures()
    collection.clear()

    if (tabLifecycleStateRef.current !== 'active') {
      return
    }

    const currentSelectedElementId = selectedElementIdRef.current
    if (!currentSelectedElementId || !source) {
      return
    }

    const feature = source.getFeatureById(currentSelectedElementId)
    if (feature) {
      collection.push(feature)
    }
  })

  const completeLongPressGesture = useEffectEvent(() => {
    const gesture = longPressGestureRef.current
    if (!gesture) {
      return
    }

    if (gesture.timerId !== null) {
      window.clearTimeout(gesture.timerId)
    }

    longPressGestureRef.current = null
    dragPanInteractionRef.current?.setActive(true)
    isManipulatingSelectionRef.current = false

    if (gesture.phase === 'dragging') {
      activeManipulationFeatureRef.current = gesture.feature
      syncFeatureGeometry(gesture.feature)
      mapRef.current?.render()
    }

    syncSelectionHud()
    window.requestAnimationFrame(() => {
      syncSelectionHud()
    })
  })

  const scheduleViewportCommit = useEffectEvent((viewport: ScenarioDocument['viewport']) => {
    if (viewportCommitTimeoutRef.current !== null) {
      window.clearTimeout(viewportCommitTimeoutRef.current)
    }

    viewportCommitTimeoutRef.current = window.setTimeout(() => {
      viewportCommitTimeoutRef.current = null
      const state = useScenarioStore.getState()

      if (readOnlyRef.current || state.access !== 'editor') {
        return
      }

      const currentViewport = state.document.viewport
      if (
        Math.abs(currentViewport.center[0] - viewport.center[0]) > 0.001 ||
        Math.abs(currentViewport.center[1] - viewport.center[1]) > 0.001 ||
        Math.abs(currentViewport.zoom - viewport.zoom) > 0.001 ||
        Math.abs(currentViewport.rotation - viewport.rotation) > 0.001
      ) {
        return
      }

      state.setViewport(viewport, { persist: true })
    }, VIEWPORT_COMMIT_DELAY_MS)
  })

  const syncWorldSourcesForScene = useEffectEvent(() => {
    const worldSources = worldSourcesRef.current
    if (!worldSources) {
      return
    }

    const sceneEnabled =
      sceneSystemEnabled && isSceneCompatibleOpenFreeMapPreset(basemapRef.current.preset)
    const hasScene = sceneEnabled && hasActiveSceneSelection(scene)
    const allFeatures = allWorldFeaturesRef.current
    const matcher = getSceneFeatureMatcher(scene)
    const rawSceneExtent = hasScene
      ? getSelectionMercatorExtentFromCountryFeatures(scene)
      : null
    const renderExtent = rawSceneExtent
      ? normalizeSceneRenderExtent(
          rawSceneExtent,
          mapRef.current?.getSize() as [number, number] | undefined,
          scene.focusPreset ? 0.1 : 0.08,
        )
      : null

    sceneExtentMercatorRef.current = renderExtent
    sceneExtentLonLatRef.current = renderExtent
      ? (transformExtent(renderExtent, 'EPSG:3857', 'EPSG:4326') as SceneExtent)
      : null

    const filterFeature = (feature: Feature<Geometry>, type: keyof WorldFeatureCollections) => {
      if (!hasScene) {
        return true
      }

      if (type === 'disputed') {
        const geometryExtent = feature.getGeometry()?.getExtent()
        return geometryExtent && renderExtent
          ? doesMercatorExtentIntersect(geometryExtent, renderExtent)
          : false
      }

      if (scene.focusPreset || type === 'countries') {
        const directMatch = matcher(feature)
        if (directMatch) {
          return true
        }
      }

      if (scene.activeContinents.length > 0) {
        const directMatch = matcher(feature)
        if (directMatch) {
          return true
        }
      }

      const geometryExtent = feature.getGeometry()?.getExtent()
      return geometryExtent && renderExtent
        ? doesMercatorExtentIntersect(geometryExtent, renderExtent)
        : false
    }

    worldSources.countries.clear(true)
    worldSources.admin1.clear(true)
    worldSources.cities.clear(true)
    worldSources.disputed.clear(true)

    worldSources.countries.addFeatures(
      allFeatures.countries.filter((feature) => filterFeature(feature, 'countries')),
    )
    worldSources.admin1.addFeatures(
      allFeatures.admin1.filter((feature) => filterFeature(feature, 'admin1')),
    )
    worldSources.cities.addFeatures(
      allFeatures.cities.filter((feature) => filterFeature(feature, 'cities')),
    )
    worldSources.disputed.addFeatures(
      allFeatures.disputed.filter((feature) => filterFeature(feature, 'disputed')),
    )

    const openFreeMapGroup = openFreeMapGroupRef.current
    if (openFreeMapGroup) {
      const nextExtent = hasScene ? renderExtent ?? undefined : undefined
      setLayerExtentRecursive(openFreeMapGroup, nextExtent)
    }

    countriesLayerRef.current?.changed()
    admin1LayerRef.current?.changed()
    cityLayerRef.current?.changed()
    disputedLayerRef.current?.changed()
    mapRef.current?.render()
  })


  const applySceneViewConstraints = useEffectEvent(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const sceneSelection: SceneSelection = {
      focusPreset: sceneFocusPreset,
      activeContinents: sceneContinentKey
        ? (sceneContinentKey.split(',') as SceneSelection['activeContinents'])
        : [],
    }
    const view = map.getView()
    const isSceneLocked =
      sceneSystemEnabled &&
      isSceneCompatibleOpenFreeMapPreset(basemap.preset) &&
      hasActiveSceneSelection(sceneSelection)
    const activePreset = getActiveScenePreset(sceneSelection)

    view.setMinZoom(isSceneLocked ? getSceneSelectionMinZoom(sceneSelection) : 1)
    view.set(
      'extent',
      isSceneLocked && activePreset
        ? getSceneFallbackMercatorExtent(sceneSelection, 'fit')
        : undefined,
    )
  })

  const applySceneViewportFit = useEffectEvent(() => {
    const map = mapRef.current
    if (
      !map ||
      tabLifecycleStateRef.current !== 'active' ||
      !sceneSystemEnabled ||
      !isSceneCompatibleOpenFreeMapPreset(basemap.preset)
    ) {
      return
    }

    const view = map.getView()
    const sceneViewport = getSceneSelectionViewport(scene)
    const sceneExtent = getSceneFallbackMercatorExtent(scene, 'fit')

    if (!sceneExtent || !hasActiveSceneSelection(scene)) {
      view.animate({
        center: fromLonLat(initialViewportRef.current.center),
        zoom: initialViewportRef.current.zoom,
        rotation: 0,
        duration: 220,
      })
      return
    }

    if (sceneViewport) {
      view.animate({
        center: fromLonLat(sceneViewport.center),
        zoom: sceneViewport.zoom,
        rotation: 0,
        duration: 220,
      })
      return
    }

    view.fit(sceneExtent, {
      padding: [64, 56, 64, 56],
      duration: 220,
      maxZoom: scene.focusPreset ? 7.2 : 4.2,
    })
  })


  const applyOpenFreeMapStyle = useEffectEvent(async (preset: BasemapPreset) => {
    const group = openFreeMapGroupRef.current
    if (!group) {
      return
    }

    if (!usesOpenFreeMapBasemap(preset)) {
      group.setVisible(false)
      return
    }

    group.setVisible(true)
    const styleUrl = getOpenFreeMapStyleUrl(preset)
    const currentLayerCount = group.getLayers().getLength()
    if (openFreeMapStyleUrlRef.current === styleUrl && currentLayerCount > 0) {
      setLayerExtentRecursive(
        group,
        hasActiveSceneSelection(scene) &&
          isSceneCompatibleOpenFreeMapPreset(basemapRef.current.preset)
          ? sceneExtentMercatorRef.current ?? undefined
          : undefined,
      )
      return
    }

    openFreeMapStyleUrlRef.current = styleUrl
    const requestId = ++openFreeMapRequestIdRef.current
    const nextGroup = new LayerGroup()

    try {
      await applyMapboxStyle(nextGroup, styleUrl)
      if (openFreeMapRequestIdRef.current !== requestId) {
        return
      }

      const nextLayers = [...nextGroup.getLayers().getArray()]
      group.getLayers().clear()
      nextLayers.forEach((layer) => {
        nextGroup.getLayers().remove(layer)
        group.getLayers().push(layer)
      })

      setLayerExtentRecursive(
        group,
        hasActiveSceneSelection(scene) &&
          isSceneCompatibleOpenFreeMapPreset(basemapRef.current.preset)
          ? sceneExtentMercatorRef.current ?? undefined
          : undefined,
      )

      setMapError((current) =>
        current?.includes('OpenFreeMap') ? null : current,
      )
      mapRef.current?.render()
    } catch (error) {
      if (
        openFreeMapRequestIdRef.current !== requestId ||
        !usesOpenFreeMapBasemap(basemapRef.current.preset)
      ) {
        return
      }

      setMapError(
        error instanceof Error
          ? `OpenFreeMap yüklenemedi: ${error.message}`
          : 'OpenFreeMap katmanı yüklenirken hata oluştu.',
      )
    }
  })

  useEffect(() => {
    if (scenarioLayerRef.current) {
      scenarioLayerRef.current.changed()
    }

    if (mapRef.current) {
      mapRef.current.render()
    }
  }, [assetMap])

  useEffect(() => {
    const deFactoPreset = usesDeFactoLayers(basemap.preset)
    const livePreset = usesRasterBasemap(basemap.preset)
    const hgmPreset = appEnv.useHgmAtlas && usesHgmBasemap(basemap.preset)
    const openFreeMapPreset = usesOpenFreeMapBasemap(basemap.preset)
    countriesLayerRef.current?.setVisible(deFactoPreset)
    admin1LayerRef.current?.setVisible(deFactoPreset)
    cityLayerRef.current?.setVisible(deFactoPreset)
    disputedLayerRef.current?.setVisible(deFactoPreset)
    liveWashLayerRef.current?.setVisible(livePreset || hgmPreset)
    openFreeMapGroupRef.current?.setVisible(openFreeMapPreset)
    osmStandardLayerRef.current?.setVisible(basemap.preset === 'osm_standard')
    osmHumanitarianLayerRef.current?.setVisible(
      basemap.preset === 'osm_humanitarian',
    )
    openTopoLayerRef.current?.setVisible(basemap.preset === 'open_topo')
    hgmBaseLayerRef.current?.setVisible(Boolean(hgmPreset))
    hgmOverlayLayerRef.current?.setVisible(basemap.preset === 'hgm_uydu')
    if (appEnv.useHgmAtlas && appEnv.hgmAtlasApiKey) {
      hgmBaseLayerRef.current?.setSource(
        new XYZ({
          url: getHgmTileUrl(basemap.preset, appEnv.hgmAtlasApiKey),
          attributions: '&copy; <a href="https://www.harita.gov.tr/">HGM Atlas</a>',
          crossOrigin: 'anonymous',
          maxZoom: 19,
        }),
      )
      hgmOverlayLayerRef.current?.setSource(
        new XYZ({
          url: getHgmOverlayUrl(basemap.preset, appEnv.hgmAtlasApiKey),
          attributions: '&copy; <a href="https://www.harita.gov.tr/">HGM Atlas</a>',
          crossOrigin: 'anonymous',
          maxZoom: 19,
        }),
      )
    }
    countriesLayerRef.current?.changed()
    admin1LayerRef.current?.changed()
    cityLayerRef.current?.changed()
    disputedLayerRef.current?.changed()
    liveWashLayerRef.current?.changed()
    scenarioLayerRef.current?.changed()
    mapRef.current?.render()
    void applyOpenFreeMapStyle(basemap.preset)
    syncWorldSourcesForScene()
  }, [
    basemap.preset,
    labelOptions.showAdmin1,
    labelOptions.showCities,
    labelOptions.showCountries,
    labelOptions.showDisputedOverlay,
    labelOptions.locale,
    stylePrefs.admin1Opacity,
    stylePrefs.backgroundPreset,
    stylePrefs.cityLabelSize,
    stylePrefs.countryLabelSize,
    stylePrefs.landPalette,
    stylePrefs.performanceMode,
    sceneSelectionKey,
  ])

  useEffect(() => {
    syncSelectionHud()
  }, [visibleElements, selectedElement, readOnly, access])

  useEffect(() => {
    if (selectedTool === 'text' || !inlineTextInput) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      setInlineTextInput(null)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [inlineTextInput, selectedTool])

  useEffect(() => {
    if (viewportCommitTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(viewportCommitTimeoutRef.current)
    viewportCommitTimeoutRef.current = null
  }, [revision])


  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return
    }

    const worldSources = createEmptyFeatureSources()
    const scenarioSource = new VectorSource()
    const drawSource = new VectorSource()
    const liveWashSource = new VectorSource({
      features: [
        new Feature({
          geometry: new Polygon([
            [
              fromLonLat([-180, -85]),
              fromLonLat([180, -85]),
              fromLonLat([180, 85]),
              fromLonLat([-180, 85]),
              fromLonLat([-180, -85]),
            ],
          ]),
        }),
      ],
    })
    const openFreeMapGroup = new LayerGroup({
      visible: usesOpenFreeMapBasemap(basemapRef.current.preset),
      zIndex: 0,
    })
    scenarioSourceRef.current = scenarioSource
    drawSourceRef.current = drawSource
    worldSourcesRef.current = worldSources
    const osmStandardLayer = new TileLayer({
      className: 'live-basemap-layer',
      source: new OSM({
        crossOrigin: 'anonymous',
      }),
      visible: basemapRef.current.preset === 'osm_standard',
      opacity: 1,
      zIndex: 0,
    })
    const osmHumanitarianLayer = new TileLayer({
      className: 'live-basemap-layer',
      source: new XYZ({
        url: 'https://{a-c}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        attributions:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Tiles style by Humanitarian OpenStreetMap Team',
        crossOrigin: 'anonymous',
        maxZoom: 19,
      }),
      visible: basemapRef.current.preset === 'osm_humanitarian',
      opacity: 1,
      zIndex: 0,
    })
    const openTopoLayer = new TileLayer({
      className: 'live-basemap-layer',
      source: new XYZ({
        url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attributions:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
        crossOrigin: 'anonymous',
        maxZoom: 17,
      }),
      visible: basemapRef.current.preset === 'open_topo',
      opacity: 1,
      zIndex: 0,
    })
    const hgmBaseLayer = new TileLayer({
      className: 'live-basemap-layer',
      source: new XYZ({
        url:
          appEnv.useHgmAtlas && appEnv.hgmAtlasApiKey
            ? getHgmTileUrl(basemapRef.current.preset, appEnv.hgmAtlasApiKey)
            : '',
        attributions: '&copy; <a href="https://www.harita.gov.tr/">HGM Atlas</a>',
        crossOrigin: 'anonymous',
        maxZoom: 19,
      }),
      visible: appEnv.useHgmAtlas && usesHgmBasemap(basemapRef.current.preset),
      opacity: 1,
      zIndex: 0,
    })
    const hgmOverlayLayer = new TileLayer({
      className: 'live-basemap-layer',
      source: new XYZ({
        url:
          appEnv.useHgmAtlas && appEnv.hgmAtlasApiKey
            ? getHgmOverlayUrl(basemapRef.current.preset, appEnv.hgmAtlasApiKey)
            : '',
        attributions: '&copy; <a href="https://www.harita.gov.tr/">HGM Atlas</a>',
        crossOrigin: 'anonymous',
        maxZoom: 19,
      }),
      visible:
        appEnv.useHgmAtlas &&
        basemapRef.current.preset === 'hgm_uydu' &&
        Boolean(appEnv.hgmAtlasApiKey),
      opacity: 1,
      zIndex: 0.6,
    })
    const liveWashLayer = new VectorLayer({
      source: liveWashSource,
      visible: usesRasterBasemap(basemapRef.current.preset),
      style: () =>
        new Style({
          fill: new Fill({
            color: mapThemeRef.current.liveWashFill,
          }),
        }),
      zIndex: 0.5,
    })

    const countriesLayer = new VectorLayer({
      source: worldSources.countries,
      declutter: true,
      visible: usesDeFactoLayers(basemapRef.current.preset),
      style: (feature) => {
        const featureZoom = zoomRef.current
        const deFactoMode = usesDeFactoLayers(basemapRef.current.preset)
        if (!deFactoMode) {
          return undefined
        }

        const showLabel =
          labelOptionsRef.current.showCountries &&
          featureZoom >= 4.2
        const colorIndex = Number(feature.get('color') ?? feature.get('MAPCOLOR9') ?? 0)
        const countryName = getCountryLabel(
          (feature.getProperties?.() ?? {}) as Record<string, unknown>,
          labelOptionsRef.current.locale,
        )
        const theme = mapThemeRef.current
        const stylePrefs = stylePrefsRef.current
        return new Style({
          fill: new Fill({
            color: getCountryFill(
              colorIndex,
              stylePrefs.landPalette,
              stylePrefs.backgroundPreset,
            ),
          }),
          stroke: new Stroke({ color: theme.countryStroke, width: 1.4 }),
          text: showLabel
            ? new Text({
                text: formatCountryLabel(countryName, labelOptionsRef.current.locale),
                font: `800 ${Math.round(stylePrefs.countryLabelSize + (featureZoom >= 6 ? 4 : 0))}px "Sora", sans-serif`,
                fill: new Fill({ color: theme.labelColor }),
                stroke: new Stroke({ color: theme.labelHalo, width: 5 }),
              })
            : undefined,
        })
      },
      zIndex: 1,
    })

    const admin1Layer = new VectorLayer({
      source: worldSources.admin1,
      declutter: true,
      visible: usesDeFactoLayers(basemapRef.current.preset),
      style: (feature) => {
        const deFactoMode = usesDeFactoLayers(basemapRef.current.preset)
        if (!deFactoMode) {
          return undefined
        }

        const featureZoom = zoomRef.current
        if (!labelOptionsRef.current.showAdmin1 || featureZoom < 5.6) {
          return undefined
        }

        const theme = mapThemeRef.current
        const opacity = clamp(stylePrefsRef.current.admin1Opacity, 0, 1)
        const alpha = Number(opacity.toFixed(2))

        return new Style({
          stroke: new Stroke({
            color: withAlpha(theme.adminStroke, alpha),
            width: featureZoom >= 6 ? 1.2 : 0.8,
            lineDash: [4, 4],
          }),
          text:
            featureZoom >= 7.1
              ? new Text({
                  text: getAdmin1Label(
                    (feature.getProperties?.() ?? {}) as Record<string, unknown>,
                    labelOptionsRef.current.locale,
                  ),
                  font: `600 ${Math.round(stylePrefsRef.current.cityLabelSize)}px "Sora", sans-serif`,
                  fill: new Fill({ color: theme.adminLabelColor }),
                  stroke: new Stroke({ color: theme.labelHalo, width: 3 }),
                })
              : undefined,
        })
      },
      zIndex: 4,
    })

    const disputedLayer = new VectorLayer({
      source: worldSources.disputed,
      visible: usesDeFactoLayers(basemapRef.current.preset),
      style: () =>
        usesDeFactoLayers(basemapRef.current.preset) && labelOptionsRef.current.showDisputedOverlay
          ? new Style({
              stroke: new Stroke({
                color: mapThemeRef.current.disputedStroke,
                width: 2.2,
                lineDash: [10, 8],
              }),
              fill: new Fill({ color: mapThemeRef.current.disputedFill }),
            })
          : undefined,
      zIndex: 6,
    })

    const cityLayer = new VectorLayer({
      source: worldSources.cities,
      declutter: true,
      visible: usesDeFactoLayers(basemapRef.current.preset),
      style: (feature) => {
        const deFactoMode = usesDeFactoLayers(basemapRef.current.preset)
        if (!deFactoMode) {
          return undefined
        }

        const featureZoom = zoomRef.current
        const featureClass = String(feature.get('FEATURECLA') ?? '')
        const popMax = Number(feature.get('POP_MAX') ?? 0)
        const isCapital = featureClass.includes('capital')
        const showPoint = isCapital || popMax >= 3000000 || featureZoom >= 7.4

        if (
          !labelOptionsRef.current.showCities ||
          featureZoom < 6 ||
          !showPoint
        ) {
          return undefined
        }

        return new Style({
          image: new CircleStyle({
            radius: isCapital ? 3.8 : 2.8,
            fill: new Fill({ color: mapThemeRef.current.cityFill }),
            stroke: new Stroke({
              color: mapThemeRef.current.cityStroke,
              width: 1.4,
            }),
          }),
          text:
            featureZoom >= 7.1 || (isCapital && featureZoom >= 6.4)
              ? new Text({
                  text: getCityLabel(
                    (feature.getProperties?.() ?? {}) as Record<string, unknown>,
                    labelOptionsRef.current.locale,
                  ),
                  offsetX: 8,
                  offsetY: -8,
                  textAlign: 'left',
                  font: `700 ${Math.round(stylePrefsRef.current.cityLabelSize)}px "Sora", sans-serif`,
                  fill: new Fill({ color: mapThemeRef.current.cityLabelColor }),
                  stroke: new Stroke({ color: mapThemeRef.current.labelHalo, width: 4 }),
                })
              : undefined,
        })
      },
      zIndex: 7,
    })

    const scenarioLayer = new VectorLayer({
      source: scenarioSource,
      style: (feature) =>
        scenarioStyle(
          feature as Feature<Geometry>,
          assetMapRef.current,
          selectedElementIdRef.current,
          zoomRef.current,
        ),
      zIndex: 20,
    })

    const draftLayer = new VectorLayer({
      source: drawSource,
      style: new Style({
        stroke: new Stroke({
          color: '#fff4c1',
          width: 4,
          lineDash: [8, 6],
        }),
        fill: new Fill({ color: 'rgba(255, 244, 193, 0.1)' }),
      }),
      zIndex: 25,
    })

    scenarioLayerRef.current = scenarioLayer
    countriesLayerRef.current = countriesLayer
    admin1LayerRef.current = admin1Layer
    cityLayerRef.current = cityLayer
    disputedLayerRef.current = disputedLayer
    liveWashLayerRef.current = liveWashLayer
    openFreeMapGroupRef.current = openFreeMapGroup
    osmStandardLayerRef.current = osmStandardLayer
    osmHumanitarianLayerRef.current = osmHumanitarianLayer
    openTopoLayerRef.current = openTopoLayer
    hgmBaseLayerRef.current = hgmBaseLayer
    hgmOverlayLayerRef.current = hgmOverlayLayer

    const selectInteraction = new Select({
      layers: [scenarioLayer],
      condition: (event) =>
        (isEditingPointer(event) || (isTouchLikePointer(event) && (event.activePointers?.length ?? 0) <= 1)) &&
        click(event),
      hitTolerance: 18,
      style: null,
      multi: true,
    })

    selectInteraction.on('select', (event) => {
      const pixel = event.mapBrowserEvent?.pixel as [number, number] | undefined
      const feature = pixel ? pickScenarioFeatureAtPixel(pixel, 18) : null
      if (!feature && isSyncingScenarioSourceRef.current) {
        return
      }

      const collection = selectInteraction.getFeatures()
      collection.clear()
      if (feature) {
        collection.push(feature)
      }

      setSelectedElementId(feature ? String(feature.get('elementId')) : null)
    })

    const dragPanInteraction = new DragPan({
      condition: (event) => {
        const state = useScenarioStore.getState()
        const drawingModeActive = isDrawingTool(state.document.selectedTool)
        const isEraserActive = state.document.selectedTool === 'eraser'

        if (isEraserActive && !readOnlyRef.current) return false

        if (isTouchLikePointer(event)) {
          if ((event.activePointers?.length ?? 0) > 1) {
            return true
          }
          return true
        }

        if (!(noModifierKeys(event) && primaryAction(event))) {
          return false
        }

        if ((event.activePointers?.length ?? 0) > 1) {
          return true
        }

        if (
          readOnlyRef.current ||
          state.access !== 'editor'
        ) {
          return true
        }

        if (drawingModeActive) {
          return false
        }

        const hitScenarioFeature = event.map.forEachFeatureAtPixel(
          event.pixel,
          (feature, layer) => (layer === scenarioLayerRef.current ? feature : null),
          { hitTolerance: 18 },
        )

        return !hitScenarioFeature
      },
    })

    dragPanInteractionRef.current = dragPanInteraction

    const translateInteraction = new Translate({
      layers: [scenarioLayer],
      hitTolerance: 20,
      condition: (event) => {
        if (!isMousePointer(event) || !noModifierKeys(event) || !primaryAction(event)) {
          return false
        }

        const pixel = event.pixel as [number, number] | undefined
        return !pixel || !isPointerNearSelectedShapeVertex(pixel)
      },
      filter: (feature) => {
        const element = feature.get('element') as ScenarioElement | undefined
        return Boolean(element && !element.locked)
      },
    })

    translateInteraction.on('translatestart', (event) => {
      const feature = event.features.item(0)
      if (feature) {
        activeManipulationFeatureRef.current = feature as Feature<Geometry>
        isManipulatingSelectionRef.current = true
        setSelectedElementId(String(feature.get('elementId')))
        syncSelectionHud()
      }
    })

    translateInteraction.on('translating', (event) => {
      const feature = event.features.item(0)
      if (feature) {
        activeManipulationFeatureRef.current = feature as Feature<Geometry>
      }
      syncSelectionHud()
    })

    translateInteraction.on('translateend', (event) => {
      const feature = event.features.item(0)
      if (feature) {
        activeManipulationFeatureRef.current = feature as Feature<Geometry>
      }
      isManipulatingSelectionRef.current = false
      event.features.forEach((feature) => {
        syncFeatureGeometry(feature as Feature<Geometry>)
      })
      syncSelectionHud()
      window.requestAnimationFrame(() => {
        syncSelectionHud()
      })
    })

    const modifyInteraction = new Modify({
      features: selectInteraction.getFeatures(),
      hitDetection: scenarioLayer,
      pixelTolerance: 14,
      condition: (event) => {
        if (isMousePointer(event)) {
          const pixel = event.pixel as [number, number] | undefined
          return Boolean(primaryAction(event) && pixel && isPointerNearSelectedShapeVertex(pixel))
        }

        if (!isTouchLikePointer(event) || !primaryAction(event)) {
          return false
        }

        const originalEvent = event.originalEvent
        return (
          originalEvent instanceof PointerEvent &&
          touchVertexIntentRef.current?.pointerId === originalEvent.pointerId &&
          touchVertexIntentRef.current.elementId === selectedElementIdRef.current
        )
      },
      insertVertexCondition: (event) => {
        if (isMousePointer(event)) {
          const pixel = event.pixel as [number, number] | undefined
          return Boolean(primaryAction(event) && pixel && isPointerNearSelectedShapeVertex(pixel))
        }

        if (!isTouchLikePointer(event) || !primaryAction(event)) {
          return false
        }

        const originalEvent = event.originalEvent
        return (
          originalEvent instanceof PointerEvent &&
          touchVertexIntentRef.current?.pointerId === originalEvent.pointerId &&
          touchVertexIntentRef.current.elementId === selectedElementIdRef.current
        )
      },
    })

    modifyInteraction.on('modifyend', (event) => {
      event.features.forEach((feature) => {
        syncFeatureGeometry(feature as Feature<Geometry>)
      })
    })

    const snapInteraction = new Snap({
      source: scenarioSource,
    })

    selectInteractionRef.current = selectInteraction
    translateInteractionRef.current = translateInteraction
    modifyInteractionRef.current = modifyInteraction

    const targetElement = mapElementRef.current
    if (!targetElement) {
      return
    }

    const map = new OlMap({
      target: targetElement,
      view: new View({
        center: fromLonLat(initialViewportRef.current.center),
        zoom: initialViewportRef.current.zoom,
        rotation: initialViewportRef.current.rotation,
      }),
      layers: [
        openFreeMapGroup,
        osmStandardLayer,
        osmHumanitarianLayer,
        openTopoLayer,
        hgmBaseLayer,
        liveWashLayer,
        hgmOverlayLayer,
        countriesLayer,
        admin1Layer,
        disputedLayer,
        cityLayer,
        scenarioLayer,
        draftLayer,
      ],
      interactions: defaultInteractions({
        pinchRotate: false,
        altShiftDragRotate: false,
        dragPan: false,
      }).extend([
        dragPanInteraction,
        selectInteraction,
        translateInteraction,
        modifyInteraction,
        snapInteraction,
      ]),
      maxTilesLoading: 32,
      pixelRatio: getRenderPixelRatio(),
    })

    map.getViewport().style.touchAction = 'none'
    const view = map.getView()
    const syncDuringCenterChange = () => {

    }
    let resolutionRafId: number | null = null
    const syncDuringResolutionChange = () => {
      const liveZoom = view.getZoom()
      const performanceModeActive =
        stylePrefsRef.current.performanceMode && usesOpenFreeMapBasemap(basemapRef.current.preset)

      if (typeof liveZoom === 'number' && !performanceModeActive) {
        zoomRef.current = liveZoom
        if (resolutionRafId === null) {
          resolutionRafId = requestAnimationFrame(() => {
            scenarioLayerRef.current?.changed()
            resolutionRafId = null
          })
        }
      }
    }
    const syncDuringRotationChange = () => {

    }
    view.on('change:center', syncDuringCenterChange)
    view.on('change:resolution', syncDuringResolutionChange)
    view.on('change:rotation', syncDuringRotationChange)

    map.on('moveend', () => {
      if (tabLifecycleStateRef.current !== 'active' || window.document.visibilityState !== 'visible') {
        syncSelectionHud()
        syncInlineTextPosition()
        return
      }

      const center = view.getCenter()
      if (!center) {
        return
      }

      const nextZoom = view.getZoom() ?? initialViewportRef.current.zoom
      setZoom(nextZoom)
      zoomRef.current = nextZoom
      scenarioLayerRef.current?.changed()

      const nextViewport = {
        center: toLonLatPair(center),
        zoom: Number(nextZoom.toFixed(2)),
        rotation: Number(view.getRotation().toFixed(3)),
      }

      setViewport(nextViewport, { persist: false })

      if (!readOnlyRef.current && useScenarioStore.getState().access === 'editor') {
        scheduleViewportCommit(nextViewport)
      }

      syncSelectionHud()
      syncInlineTextPosition()
    })

    const handleMapPointerDrag = () => {
      muteAlertAutoZoom()
    }
    const handleMapWheel = () => {
      muteAlertAutoZoom()
    }
    map.on('pointerdrag', handleMapPointerDrag)
    targetElement.addEventListener('wheel', handleMapWheel, { passive: true })

    mapRef.current = map
    const { layer: missileLayer, bindings: missileBindings } = createMissileLayer(map, {
      onFlightsChange: setMissileRuntimeFlights,
    })
    missileLayerRef.current = missileLayer
    missileBindingsRef.current = missileBindings
    map.addLayer(missileLayer)
    const { layer: alertLayer, bindings: alertBindings } = createAlertLayer(map)
    alertLayerRef.current = alertLayer
    alertBindingsRef.current = alertBindings
    map.addLayer(alertLayer)
    void applyOpenFreeMapStyle(basemapRef.current.preset)
    const syncInteractionActivation = () => {
      const state = useScenarioStore.getState()
      const isEraser = state.document.selectedTool === 'eraser'
      const enabled =
        !readOnlyRef.current &&
        state.access === 'editor' &&
        !isDrawingTool(state.document.selectedTool) &&
        !isEraser &&
        tabLifecycleStateRef.current === 'active'
      const currentSelected = state.document.elements.find(
        (element) => element.id === selectedElementIdRef.current,
      )
      const canModifySelectedShape =
        enabled &&
        state.document.selectedTool === 'select' &&
        Boolean(
          currentSelected && !currentSelected.locked && isShapeEditable(currentSelected.kind),
        )

      selectInteraction.setActive(enabled)
      modifyInteraction.setActive(canModifySelectedShape)
      translateInteraction.setActive(enabled)
    }

    const resizeObserver = new ResizeObserver(() => {
      if (tabLifecycleStateRef.current !== 'active' || window.document.visibilityState !== 'visible') {
        return
      }

      map.updateSize()
      map.render()
      syncSelectionHud()
      syncInlineTextPosition()
    })
    resizeObserver.observe(targetElement)
    window.requestAnimationFrame(() => {
      map.updateSize()
      map.render()
    })

    const cancelPendingRestoreFinalize = () => {
      if (restoreFinalizeFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFinalizeFrameRef.current)
        restoreFinalizeFrameRef.current = null
      }

      if (restoreFinalizeSecondFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFinalizeSecondFrameRef.current)
        restoreFinalizeSecondFrameRef.current = null
      }

      restoreFinalizeTokenRef.current = 0
      restoreFinalizeSourceRef.current = null
    }

    const finalizeTabRestore = (restoreToken: number) => {
      if (
        restoreTokenRef.current !== restoreToken ||
        window.document.visibilityState !== 'visible'
      ) {
        return
      }

      const finalizeSource = restoreFinalizeSourceRef.current
      cancelPendingRestoreFinalize()
      restoreTokenRef.current = 0
      if (restoreDeadlockTimeoutRef.current !== null) {
        window.clearTimeout(restoreDeadlockTimeoutRef.current)
        restoreDeadlockTimeoutRef.current = null
      }

      if (finalizeSource === 'timeout') {
        log.warn('Tab restore rendercomplete gelmedi, timeout fallback kullanildi', {
          action: 'finalizeTabRestore',
          report: true,
        })
      }

      applySceneViewConstraints()

      const finalCenter = view.getCenter()
      const finalZoom = view.getZoom() ?? initialViewportRef.current.zoom
      const finalRotation = view.getRotation()
      setZoom(finalZoom)
      zoomRef.current = finalZoom
      setViewport(
        {
          center: finalCenter ? toLonLatPair(finalCenter) : initialViewportRef.current.center,
          zoom: Number(finalZoom.toFixed(2)),
          rotation: Number(finalRotation.toFixed(3)),
        },
        { persist: false },
      )

      tabLifecycleStateRef.current = 'active'
      setTabLifecycleState('active')
      syncInteractionActivation()
      rebuildOpenLayersSelectionFromStore()
      syncSelectionHud()
      syncInlineTextPosition()
      hideRestoreOverlay()
      map.render()
      flushPendingAlertAutoZoom()
    }

    const requestTabRestoreFinalize = (
      source: 'rendercomplete' | 'timeout',
      restoreToken: number,
    ) => {
      if (
        restoreTokenRef.current !== restoreToken ||
        window.document.visibilityState !== 'visible'
      ) {
        return
      }

      if (source === 'timeout') {
        cancelPendingRestoreFinalize()
        restoreFinalizeTokenRef.current = restoreToken
        restoreFinalizeSourceRef.current = source
        finalizeTabRestore(restoreToken)
        return
      }

      if (restoreFinalizeTokenRef.current === restoreToken) {
        return
      }

      cancelPendingRestoreFinalize()
      restoreFinalizeTokenRef.current = restoreToken
      restoreFinalizeSourceRef.current = source

      restoreFinalizeFrameRef.current = window.requestAnimationFrame(() => {
        restoreFinalizeFrameRef.current = null
        if (
          restoreTokenRef.current !== restoreToken ||
          window.document.visibilityState !== 'visible'
        ) {
          return
        }

        restoreFinalizeSecondFrameRef.current = window.requestAnimationFrame(() => {
          restoreFinalizeSecondFrameRef.current = null
          finalizeTabRestore(restoreToken)
        })
      })
    }

    const beginTabSuspend = () => {
      if (tabLifecycleStateRef.current === 'suspending') {
        return
      }

      completeLongPressGesture()
      cancelPendingRestoreFinalize()

      if (restoreDeadlockTimeoutRef.current !== null) {
        window.clearTimeout(restoreDeadlockTimeoutRef.current)
        restoreDeadlockTimeoutRef.current = null
      }

      if (viewportCommitTimeoutRef.current !== null) {
        window.clearTimeout(viewportCommitTimeoutRef.current)
        viewportCommitTimeoutRef.current = null
      }

      if (tabLifecycleStateRef.current !== 'restoring') {
        savedViewStateRef.current = {
          center: (view.getCenter() as [number, number] | null) ?? null,
          zoom: view.getZoom() ?? initialViewportRef.current.zoom,
          rotation: view.getRotation(),
        }
        showRestoreOverlay(captureFrozenMapFrame())
      }

      restoreTokenRef.current += 1
      tabLifecycleStateRef.current = 'suspending'
      setTabLifecycleState('suspending')
      activeManipulationFeatureRef.current = null
      isManipulatingSelectionRef.current = false
      setSelectionHud(null)
      selectInteraction.getFeatures().clear()
      syncInteractionActivation()
    }

    const beginTabRestore = (reason: 'visibility' | 'pageshow', persisted = false) => {
      if (window.document.visibilityState !== 'visible') {
        return
      }

      const restoreToken = restoreTokenRef.current + 1
      restoreTokenRef.current = restoreToken
      tabLifecycleStateRef.current = 'restoring'
      setTabLifecycleState('restoring')
      setSelectionHud(null)
      cancelPendingRestoreFinalize()
      syncInteractionActivation()

      const savedViewState = savedViewStateRef.current
      view.cancelAnimations()
      map.updateSize()
      if (savedViewState?.center) {
        view.setCenter(savedViewState.center)
      }
      if (savedViewState) {
        view.setZoom(savedViewState.zoom)
        view.setRotation(savedViewState.rotation)
        setZoom(savedViewState.zoom)
        zoomRef.current = savedViewState.zoom
        setViewport(
          {
            center: savedViewState.center
              ? toLonLatPair(savedViewState.center)
              : initialViewportRef.current.center,
            zoom: Number(savedViewState.zoom.toFixed(2)),
            rotation: Number(savedViewState.rotation.toFixed(3)),
          },
          { persist: false },
        )
      }

      if (persisted) {
        syncWorldSourcesForScene()
      }

      scenarioLayerRef.current?.changed()
      syncInlineTextPosition()

      if (restoreDeadlockTimeoutRef.current !== null) {
        window.clearTimeout(restoreDeadlockTimeoutRef.current)
      }

      restoreDeadlockTimeoutRef.current = window.setTimeout(() => {
        requestTabRestoreFinalize('timeout', restoreToken)
      }, TAB_RESTORE_DEADLOCK_MS)

      map.once('rendercomplete', () => {
        requestTabRestoreFinalize('rendercomplete', restoreToken)
      })

      map.render()
      map.renderSync()

      log.debug('Tab restore baslatildi', {
        action: 'beginTabRestore',
        reason,
        persisted,
      })
    }

    const handleVisibilityChange = () => {
      if (window.document.visibilityState === 'hidden') {
        beginTabSuspend()
        return
      }

      beginTabRestore('visibility')
    }

    const handlePageShow = (event: PageTransitionEvent) => {
      beginTabRestore('pageshow', event.persisted)
    }

    window.addEventListener('pageshow', handlePageShow)
    window.document.addEventListener('visibilitychange', handleVisibilityChange)

    const loadWorld = async () => {
      try {
        const format = new GeoJSON()
        const [countries, admin1, cities, disputed] = await Promise.all([
          loadJson(withBasePath('/data/world/admin0-countries.geojson')),
          loadJson(withBasePath('/data/world/admin1-regions.geojson')),
          loadJson(withBasePath('/data/world/populated-places.geojson')),
          loadJson(withBasePath('/data/world/disputed-areas.geojson')),
        ])

        allWorldFeaturesRef.current = {
          countries: format.readFeatures(countries, { featureProjection: 'EPSG:3857' }),
          admin1: format.readFeatures(admin1, { featureProjection: 'EPSG:3857' }),
          cities: format.readFeatures(cities, { featureProjection: 'EPSG:3857' }),
          disputed: format.readFeatures(disputed, { featureProjection: 'EPSG:3857' }),
        }
        syncWorldSourcesForScene()
        if (
          isSceneCompatibleOpenFreeMapPreset(basemapRef.current.preset) &&
          hasActiveSceneSelection(useScenarioStore.getState().document.scene)
        ) {
          applySceneViewportFit()
        }
        map.render()
      } catch (loadError) {
        setMapError(
          loadError instanceof Error
            ? loadError.message
            : 'Harita tabanı yüklenirken hata oluştu.',
        )
      }
    }

    void loadWorld()

    return () => {
      if (resolutionRafId !== null) {
        cancelAnimationFrame(resolutionRafId)
      }
      if (viewportCommitTimeoutRef.current !== null) {
        window.clearTimeout(viewportCommitTimeoutRef.current)
        viewportCommitTimeoutRef.current = null
      }
      if (restoreDeadlockTimeoutRef.current !== null) {
        window.clearTimeout(restoreDeadlockTimeoutRef.current)
        restoreDeadlockTimeoutRef.current = null
      }
      cancelPendingRestoreFinalize()
      restoreTokenRef.current = 0
      tabLifecycleStateRef.current = 'active'
      hideRestoreOverlay()
      window.removeEventListener('pageshow', handlePageShow)
      window.document.removeEventListener('visibilitychange', handleVisibilityChange)
      view.un('change:center', syncDuringCenterChange)
      view.un('change:resolution', syncDuringResolutionChange)
      view.un('change:rotation', syncDuringRotationChange)
      map.un('pointerdrag', handleMapPointerDrag)
      targetElement.removeEventListener('wheel', handleMapWheel)
      resizeObserver.disconnect()
      missileBindingsRef.current?.destroy()
      missileBindingsRef.current = null
      missileLayerRef.current = null
      alertBindingsRef.current?.destroy()
      alertBindingsRef.current = null
      alertLayerRef.current = null
      shownMissileRangeIdsRef.current = new Map()
      resetMissileRuntime()
      map.setTarget(undefined)
      mapRef.current = null
      dragPanInteractionRef.current = null
      selectInteractionRef.current = null
      modifyInteractionRef.current = null
      translateInteractionRef.current = null
      activeManipulationFeatureRef.current = null
      isManipulatingSelectionRef.current = false
      longPressGestureRef.current = null
      touchVertexIntentRef.current = null
      worldSourcesRef.current = null
      allWorldFeaturesRef.current = createEmptyWorldFeatureCollections()
      openFreeMapGroupRef.current = null
      openFreeMapStyleUrlRef.current = null
    }
  }, [resetMissileRuntime, setMissileRuntimeFlights, setSelectedElementId, setViewport])

  useEffect(() => {
    const source = scenarioSourceRef.current
    if (!source) {
      return
    }

    const activeSceneExtent =
      sceneSystemEnabled &&
      isSceneCompatibleOpenFreeMapPreset(basemap.preset) &&
      hasSceneSelection
        ? sceneExtentLonLatRef.current ?? fallbackSceneExtent
        : null

    isSyncingScenarioSourceRef.current = true
    source.clear(true)
    const features = [...visibleElements]
      .filter((element) => isElementVisibleForScene(element, activeSceneExtent))
      .sort((left, right) => left.zIndex - right.zIndex)
      .map(elementToFeature)
    source.addFeatures(features)

    if (scenarioLayerRef.current) {
      scenarioLayerRef.current.changed()
    }

    rebuildOpenLayersSelectionFromStore()

    window.requestAnimationFrame(() => {
      isSyncingScenarioSourceRef.current = false
    })
  }, [
    basemap.preset,
    visibleElements,
    fallbackSceneExtent,
    hasSceneSelection,
    sceneSystemEnabled,
    sceneSelectionKey,
  ])

  useEffect(() => {
    rebuildOpenLayersSelectionFromStore()
  }, [selectedElementId, tabLifecycleState])

  useEffect(() => {
    if (!selectedElementId || !visibleElementIdSet) {
      return
    }

    if (!visibleElementIdSet.has(selectedElementId)) {
      setSelectedElementId(null)
    }
  }, [selectedElementId, setSelectedElementId, visibleElementIdSet])

  useEffect(() => {
    const source = scenarioSourceRef.current
    if (!source) {
      return
    }

    const handleFeatureChange = () => {
      syncSelectionHud()
    }

    source.on('changefeature', handleFeatureChange)
    return () => {
      source.un('changefeature', handleFeatureChange)
    }
  }, [])

  useEffect(() => {
    const bindings = missileBindingsRef.current
    if (!bindings) {
      return
    }

    const nextRanges = new Map<string, string>()
    for (const [missileId] of shownMissileRangeIdsRef.current) {
      if (!(missileState?.selectedMissileIds ?? []).includes(missileId)) {
        bindings.hideRange(missileId)
      }
    }

    for (const missileId of missileState?.selectedMissileIds ?? []) {
      const definition = getMissileById(missileId)
      if (!definition) {
        continue
      }

      const launchCoord = resolveMissileLaunchCoord(definition, missileState?.launchSiteByMissileId)
      const centerKey = serializeCoord(launchCoord)
      if (shownMissileRangeIdsRef.current.get(missileId) !== centerKey) {
        bindings.showRange(missileId, launchCoord)
      }
      nextRanges.set(missileId, centerKey)
    }

    shownMissileRangeIdsRef.current = nextRanges
  }, [missileState?.launchSiteByMissileId, missileState?.selectedMissileIds])

  useEffect(() => {
    missileBindingsRef.current?.setTarget(
      missileState?.targetCoord ?? null,
      activeMissileDefinition?.id ?? null,
      activeMissileLaunchCoord,
    )
  }, [activeMissileDefinition?.id, activeMissileLaunchCoord, missileState?.targetCoord])

  useEffect(() => {
    missileBindingsRef.current?.setFlightTargets(missileRuntimeFlights)
  }, [missileRuntimeFlights])

  useEffect(() => {
    missileBindingsRef.current?.setLaunchSite(activeMissileLaunchCoord, activeMissileDefinition?.id ?? null)
  }, [activeMissileDefinition?.id, activeMissileLaunchCoord])

  useEffect(() => {
    const bindings = missileBindingsRef.current
    if (!bindings || !missileState?.recentLaunches?.length) {
      return
    }

    const now = Date.now()
    for (const launch of missileState.recentLaunches) {
      if (missileConsumedLaunchIds.includes(launch.id)) {
        continue
      }

      const definition = getMissileById(launch.missileId)
      if (!definition || isLaunchCommandStale(launch, definition, now)) {
        markMissileLaunchConsumed(launch.id)
        continue
      }

      bindings.launchMissile(launch)
      markMissileLaunchConsumed(launch.id)
    }
  }, [markMissileLaunchConsumed, missileConsumedLaunchIds, missileState?.recentLaunches])

  useEffect(() => {
    const bindings = alertBindingsRef.current
    if (!bindings) {
      return
    }

    if (!alertsEnabled) {
      bindings.clearAll()
      return
    }

    bindings.syncAlerts(alerts)
  }, [alerts, alertsEnabled])

  useEffect(() => {
    const bindings = alertBindingsRef.current
    if (!bindings) {
      return
    }

    bindings.setSelectedAlert(alertsEnabled ? selectedAlertId : null)
  }, [alertsEnabled, selectedAlertId])

  const selectedAlert = useMemo(() => {
    if (!alertsEnabled || !selectedAlertId) {
      return null
    }

    return (
      alerts.find((alert) => alert.id === selectedAlertId) ??
      historyAlerts.find((alert) => alert.id === selectedAlertId) ??
      null
    )
  }, [alerts, alertsEnabled, historyAlerts, selectedAlertId])

  useEffect(() => {
    const bindings = alertBindingsRef.current
    if (!bindings) {
      return
    }

    bindings.setFocusedAlert(alertsEnabled ? selectedAlert : null)
  }, [alertsEnabled, selectedAlert])

  // Early warning / incident_ended tıklanınca şehirlerini haritada göster
  useEffect(() => {
    const bindings = alertBindingsRef.current
    if (!bindings) return

    if (!alertsEnabled || !focusedSystemMessageId) {
      bindings.setWarningCities(null)
      return
    }

    const msg = systemMessages.find((m) => m.id === focusedSystemMessageId)
    if (!msg?.citiesEnriched || msg.citiesEnriched.length === 0) {
      bindings.setWarningCities(null)
      return
    }

    const cities = msg.citiesEnriched
      .filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({ name: c.en || c.he, lat: c.lat!, lon: c.lng!, zone: c.zone_en || '', countdown: c.countdown ?? 0 }))

    const pinColor = msg.type === 'incident_ended' ? '#16a34a' : '#f59e0b'
    bindings.setWarningCities(cities, pinColor)

    // Haritayı bu şehirlere zoom yap
    const map = mapRef.current
    const view = map?.getView()
    if (map && view && cities.length > 0) {
      if (cities.length === 1) {
        view.animate({ center: fromLonLat([cities[0].lon, cities[0].lat]), zoom: Math.max(view.getZoom() ?? 7, 7.5), duration: 450 })
      } else {
        const ext = boundingExtent(cities.map((c) => fromLonLat([c.lon, c.lat])))
        view.fit(ext, { duration: 500, maxZoom: 8.5, padding: [96, 56, 56, 56] })
      }
    }
  }, [alertsEnabled, focusedSystemMessageId, systemMessages]) // eslint-disable-line react-hooks/exhaustive-deps

  // City chip click → zoom to coordinate
  const focusCoordinate = useAlertStore((state) => state.focusCoordinate)
  const focusTrigger = useAlertStore((state) => state.focusTrigger)

  useEffect(() => {
    const map = mapRef.current
    const view = map?.getView()
    if (!map || !view || !focusCoordinate) return

    const center = fromLonLat([focusCoordinate.lon, focusCoordinate.lat])
    view.animate({ center, zoom: 11, duration: 400 })
  }, [focusTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    const view = map?.getView()
    if (!map || !view || !selectedAlert) {
      focusedAlertIdRef.current = selectedAlert ? focusedAlertIdRef.current : null
      return
    }

    if (focusedAlertIdRef.current === selectedAlert.id) {
      return
    }

    if (alertSkipSelectedFocusOnceRef.current) {
      alertSkipSelectedFocusOnceRef.current = false
      focusedAlertIdRef.current = selectedAlert.id
      return
    }

    focusedAlertIdRef.current = selectedAlert.id
    const currentZoom = view.getZoom() ?? documentViewport.zoom
    view.animate({
      center: fromLonLat([selectedAlert.lon, selectedAlert.lat]),
      zoom: Math.max(currentZoom, 7.5),
      duration: 450,
    })
  }, [documentViewport.zoom, selectedAlert])

  useEffect(() => {
    if (
      !selectedElementId ||
      !sceneSystemEnabled ||
      !isSceneCompatibleOpenFreeMapPreset(basemap.preset) ||
      !hasSceneSelection
    ) {
      return
    }

    const selected = visibleElements.find((element) => element.id === selectedElementId)
    if (!selected) {
      return
    }

    if (
      !isElementVisibleForScene(
        selected,
        sceneExtentLonLatRef.current ?? fallbackSceneExtent,
      )
    ) {
      setSelectedElementId(null)
    }
  }, [
    basemap.preset,
    visibleElements,
    fallbackSceneExtent,
    hasSceneSelection,
    sceneSystemEnabled,
    sceneSelectionKey,
    selectedElementId,
    setSelectedElementId,
  ])

  useEffect(() => {
    const selectInteraction = selectInteractionRef.current
    const modifyInteraction = modifyInteractionRef.current
    const translateInteraction = translateInteractionRef.current
    if (!selectInteraction || !modifyInteraction || !translateInteraction) {
      return
    }

    const isEraser = selectedTool === 'eraser'
    const enabled =
      !readOnly &&
      access === 'editor' &&
      !isDrawingTool(selectedTool) &&
      !isEraser &&
      tabLifecycleState === 'active'
    const canModifySelectedShape =
      enabled &&
      selectedTool === 'select' &&
      Boolean(selectedElement && !selectedElement.locked && isShapeEditable(selectedElement.kind))

    selectInteraction.setActive(enabled)
    modifyInteraction.setActive(canModifySelectedShape)
    translateInteraction.setActive(enabled)
  }, [access, selectedTool, readOnly, selectedElement, tabLifecycleState])

  useEffect(() => {
    const map = mapRef.current
    const viewport = map?.getViewport()
    if (
      !map ||
      !viewport ||
      readOnly ||
      access !== 'editor' ||
      selectedTool !== 'select' ||
      tabLifecycleState !== 'active'
    ) {
      completeLongPressGesture()
      touchVertexIntentRef.current = null
      return
    }

    const clearTouchVertexIntent = (pointerId?: number) => {
      if (!touchVertexIntentRef.current) {
        return
      }

      if (pointerId === undefined || touchVertexIntentRef.current.pointerId === pointerId) {
        touchVertexIntentRef.current = null
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (longPressGestureRef.current && longPressGestureRef.current.pointerId !== event.pointerId) {
        completeLongPressGesture()
      }

      if (!event.isPrimary || (event.pointerType !== 'touch' && event.pointerType !== 'pen')) {
        return
      }

      clearTouchVertexIntent()

      const pixel = map.getEventPixel(event) as [number, number]
      if (isPointerNearSelectedShapeVertex(pixel)) {
        if (selectedElementIdRef.current) {
          touchVertexIntentRef.current = {
            pointerId: event.pointerId,
            elementId: selectedElementIdRef.current,
          }
        }
        return
      }

      const feature = pickScenarioFeatureAtPixel(pixel, TOUCH_SELECT_HIT_TOLERANCE)
      const element = feature?.get('element') as ScenarioElement | undefined
      if (!feature || !element || element.locked || !isMovableHudElementKind(element.kind)) {
        return
      }

      const coordinate = map.getCoordinateFromPixel(pixel)
      if (!coordinate) {
        return
      }

      const timerId = window.setTimeout(() => {
        const gesture = longPressGestureRef.current
        if (!gesture || gesture.pointerId !== event.pointerId || gesture.phase !== 'pending') {
          return
        }

        gesture.phase = 'dragging'
        gesture.timerId = null

        const collection = selectInteractionRef.current?.getFeatures()
        collection?.clear()
        collection?.push(gesture.feature)
        activeManipulationFeatureRef.current = gesture.feature
        isManipulatingSelectionRef.current = true
        setSelectedElementId(gesture.elementId)
        dragPanInteractionRef.current?.setActive(false)
        syncSelectionHud()
        window.requestAnimationFrame(() => {
          syncSelectionHud()
        })
        map.render()
      }, LONG_PRESS_DELAY_MS)

      longPressGestureRef.current = {
        pointerId: event.pointerId,
        pointerType: event.pointerType as 'touch' | 'pen',
        elementId: element.id,
        feature,
        startPixel: [pixel[0], pixel[1]],
        lastCoordinate: [coordinate[0], coordinate[1]],
        phase: 'pending',
        timerId,
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const gesture = longPressGestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return
      }

      const pixel = map.getEventPixel(event) as [number, number]
      if (gesture.phase === 'pending') {
        if (
          Math.hypot(pixel[0] - gesture.startPixel[0], pixel[1] - gesture.startPixel[1]) >
          LONG_PRESS_MOVE_TOLERANCE_PX
        ) {
          if (gesture.timerId !== null) {
            window.clearTimeout(gesture.timerId)
          }
          longPressGestureRef.current = null
        }
        return
      }

      const coordinate = map.getCoordinateFromPixel(pixel)
      const geometry = gesture.feature.getGeometry()
      if (!coordinate || !geometry || typeof geometry.translate !== 'function') {
        return
      }

      const dx = coordinate[0] - gesture.lastCoordinate[0]
      const dy = coordinate[1] - gesture.lastCoordinate[1]
      if (dx === 0 && dy === 0) {
        return
      }

      geometry.translate(dx, dy)
      gesture.lastCoordinate = [coordinate[0], coordinate[1]]
      activeManipulationFeatureRef.current = gesture.feature
      syncSelectionHud()
      map.render()
      event.preventDefault()
    }

    const handlePointerEnd = (event: PointerEvent) => {
      clearTouchVertexIntent(event.pointerId)

      const gesture = longPressGestureRef.current
      if (!gesture || gesture.pointerId !== event.pointerId) {
        return
      }

      completeLongPressGesture()
    }

    viewport.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true })
    viewport.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
    viewport.addEventListener('pointerup', handlePointerEnd, { capture: true, passive: true })
    viewport.addEventListener('pointercancel', handlePointerEnd, { capture: true, passive: true })

    return () => {
      viewport.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      viewport.removeEventListener('pointermove', handlePointerMove, { capture: true })
      viewport.removeEventListener('pointerup', handlePointerEnd, { capture: true })
      viewport.removeEventListener('pointercancel', handlePointerEnd, { capture: true })
      completeLongPressGesture()
      activeManipulationFeatureRef.current = null
      isManipulatingSelectionRef.current = false
      touchVertexIntentRef.current = null
    }
  }, [
    access,
    readOnly,
    selectedTool,
    setSelectedElementId,
    tabLifecycleState,
  ])

  useEffect(() => {
    const map = mapRef.current
    const drawSource = drawSourceRef.current
    if (!map || !drawSource) {
      return
    }

    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current)
      drawInteractionRef.current = null
    }

    drawSource.clear(true)

    const canDraw = !readOnly && access === 'editor'
    const tool = selectedTool
    if (!canDraw || !isDrawingTool(tool)) {
      return
    }

    const isShape = isShapeTool(tool)
    const drawType: 'Polygon' | 'LineString' | 'Circle' =
      isShape ? 'Circle' : tool === 'area' ? 'Polygon' : 'LineString'
    const freehandDrawing =
      tool === 'freehand' || tool === 'arrow' || tool === 'polyline' || tool === 'area' || isShape

    const geometryFunction =
      tool === 'rectangle'
        ? createBox()
        : tool === 'circle'
          ? createRegularPolygon(64)
          : tool === 'triangle'
            ? createRegularPolygon(3)
            : undefined

    const sketchStyle = tool === 'freehand'
      ? undefined
      : new Style({
          stroke: new Stroke({
            color: penColor,
            width: 3,
            lineDash: [8, 6],
          }),
          fill: new Fill({ color: penColor + '2e' }),
          image: new CircleStyle({
            radius: 5,
            fill: new Fill({ color: penColor }),
            stroke: new Stroke({ color: '#fff', width: 1.5 }),
          }),
        })

    const drawInteraction = new Draw({
      source: drawSource,
      type: drawType,
      freehand: freehandDrawing,
      geometryFunction,
      ...(sketchStyle ? { style: sketchStyle } : {}),
      dragVertexDelay: 0,
      condition: (event) =>
        canUseToolWithEvent(tool, event) && noModifierKeys(event) && primaryAction(event),
      freehandCondition: (event) => canUseToolWithEvent(tool, event) && primaryAction(event),
      stopClick: true,
    })

    drawInteraction.on('drawend', (event) => {
      const geometry = event.feature.getGeometry()
      if (!geometry) {
        return
      }

      if (tool === 'area' || isShapeTool(tool)) {
        const polygon = geometry as Polygon
        addPolygonElement(
          polygon
            .getCoordinates()
            .map((ring) => ring.map((coord) => toLonLatPair(coord))),
        )
      } else {
        const line = geometry as LineString
        const lineCoordinates = line.getCoordinates().map((coord) => toLonLatPair(coord))
        const normalizedCoordinates =
          tool === 'freehand'
            ? lineCoordinates
            : [lineCoordinates[0], lineCoordinates.at(-1) ?? lineCoordinates[0]]

        addLinearElement(
          tool === 'freehand' ? 'freehand' : 'polyline',
          normalizedCoordinates,
          {
            endArrow: tool === 'arrow',
          },
        )
      }

      drawSource.clear(true)
    })

    drawInteractionRef.current = drawInteraction
    map.addInteraction(drawInteraction)

    return () => {
      map.removeInteraction(drawInteraction)
      drawInteractionRef.current = null
    }
  }, [access, addLinearElement, addPolygonElement, penColor, selectedTool, readOnly])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    const handler = (event: {
      coordinate: number[]
      dragging?: boolean
      originalEvent?: Event | PointerEvent | MouseEvent | TouchEvent
    }) => {
      if (event.dragging || tabLifecycleState !== 'active') {
        return
      }

      const missileRuntimeState = useMissileStore.getState()
      const pixel = map.getPixelFromCoordinate(event.coordinate)
      const clickedAlertFeature =
        alertsEnabled
          ? map.forEachFeatureAtPixel(
              pixel,
              (feature, layer) => (layer === alertLayerRef.current ? feature : null),
              { hitTolerance: 12 },
            )
          : null

      if (!readOnly && access === 'editor' && missileRuntimeState.isTargetPickArmed) {
        setInlineTextInput(null)
        missileRuntimeState.cancelTargetPick()
        setMissileTarget(toLonLatPair(event.coordinate))
        return
      }

      const clickedAlertId = clickedAlertFeature?.get('alertId')
      if (
        typeof clickedAlertId === 'string' &&
        (readOnly || access !== 'editor' || selectedTool === 'select')
      ) {
        setInlineTextInput(null)
        setSelectedAlertId(clickedAlertId)
        setFocusedSystemMessageId(null)
        if (!readOnly && access === 'editor') {
          useScenarioStore.getState().setSelectedElementId(null)
        }
        return
      }

      if (readOnly || access !== 'editor') {
        setSelectedAlertId(null)
        setFocusedSystemMessageId(null)
        return
      }

      const clickedScenarioFeature = map.forEachFeatureAtPixel(
        pixel,
        (feature, layer) => (layer === scenarioLayerRef.current ? feature : null),
        { hitTolerance: 12 },
      )

      if (selectedTool === 'eraser') {
        return
      }

      if (clickedScenarioFeature) {
        if (selectedTool === 'select') {
          setInlineTextInput(null)
          setSelectedAlertId(null)
          setFocusedSystemMessageId(null)
        }
        return
      }

      if (selectedTool === 'select') {
        setInlineTextInput(null)
        setSelectedAlertId(null)
        setFocusedSystemMessageId(null)
        useScenarioStore.getState().setSelectedElementId(null)
        return
      }

      if (selectedTool === 'asset' && activeAssetId) {
        if (!canUseToolWithEvent(selectedTool, event)) {
          return
        }

        const nextElementId = addAssetElement(
          activeAssetId,
          toLonLatPair(event.coordinate),
          toUploadedAssetSnapshot(assetMapRef.current.get(activeAssetId)),
        )
        setTool('select')
        window.requestAnimationFrame(() => {
          useScenarioStore.getState().setSelectedElementId(nextElementId)
        })
        return
      }

      if (selectedTool === 'text') {
        if (!canUseToolWithEvent(selectedTool, event)) {
          return
        }

        if (useScenarioStore.getState().document.selectedTool !== 'text') {
          setInlineTextInput(null)
          return
        }

        const coord = toLonLatPair(event.coordinate)
        const pixel = map.getPixelFromCoordinate(event.coordinate)
        if (pixel) {
          setInlineTextInput({
            coordinate: coord,
            text: '',
            left: pixel[0],
            top: pixel[1],
          })
          window.requestAnimationFrame(() => {
            inlineTextRef.current?.focus()
          })
        }
      }
    }

    map.on('singleclick', handler)
    return () => {
      map.un('singleclick', handler)
    }
  }, [access, activeAssetId, addAssetElement, addTextElement, alertsEnabled, selectedTool, readOnly, setMissileTarget, setSelectedAlertId, setTool, tabLifecycleState])

  // Eraser: drag-to-erase interaction
  useEffect(() => {
    const map = mapRef.current
    const viewport = map?.getViewport()
    if (
      !map ||
      !viewport ||
      selectedTool !== 'eraser' ||
      readOnly ||
      access !== 'editor' ||
      tabLifecycleState !== 'active'
    ) {
      window.requestAnimationFrame(() => {
        hideEraserCursor()
      })
      return
    }

    const deletedInStroke = new Set<string>()

    function eraseAtPixel(pixel: number[]) {
      const hitTolerance = eraserSizeRef.current / 2
      const toDelete: string[] = []
      map!.forEachFeatureAtPixel(
        pixel,
        (feature, layer) => {
          if (layer !== scenarioLayerRef.current) return null
          const el = feature.get('element') as ScenarioElement | undefined
          if (!el || el.locked) return null
          if (!deletedInStroke.has(el.id)) {
            toDelete.push(el.id)
          }
          return null
        },
        { hitTolerance },
      )
      for (const id of toDelete) {
        deletedInStroke.add(id)
        useScenarioStore.getState().removeElementById(id)
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0) return
      eraserActiveRef.current = true
      deletedInStroke.clear()
      const rect = viewport!.getBoundingClientRect()
      const pixel = [e.clientX - rect.left, e.clientY - rect.top]
      eraseAtPixel(pixel)
      setEraserCursor({ x: e.clientX, y: e.clientY })
    }

    function onPointerMove(e: PointerEvent) {
      const rect = viewport!.getBoundingClientRect()
      setEraserCursor({ x: e.clientX, y: e.clientY })
      if (!eraserActiveRef.current) return
      const pixel = [e.clientX - rect.left, e.clientY - rect.top]
      eraseAtPixel(pixel)
    }

    function onPointerUp() {
      eraserActiveRef.current = false
      deletedInStroke.clear()
    }

    function onPointerLeave() {
      setEraserCursor(null)
      eraserActiveRef.current = false
      deletedInStroke.clear()
    }

    function onPointerEnter(e: PointerEvent) {
      setEraserCursor({ x: e.clientX, y: e.clientY })
    }

    viewport.addEventListener('pointerdown', onPointerDown)
    viewport.addEventListener('pointermove', onPointerMove)
    viewport.addEventListener('pointerup', onPointerUp)
    viewport.addEventListener('pointerleave', onPointerLeave)
    viewport.addEventListener('pointerenter', onPointerEnter)

    return () => {
      viewport.removeEventListener('pointerdown', onPointerDown)
      viewport.removeEventListener('pointermove', onPointerMove)
      viewport.removeEventListener('pointerup', onPointerUp)
      viewport.removeEventListener('pointerleave', onPointerLeave)
      viewport.removeEventListener('pointerenter', onPointerEnter)
      eraserActiveRef.current = false
      window.requestAnimationFrame(() => {
        hideEraserCursor()
      })
    }
  }, [access, readOnly, removeElementById, selectedTool, tabLifecycleState])

  useEffect(() => {
    const map = mapRef.current
    if (!map) {
      return
    }

    if (tabLifecycleStateRef.current !== 'active' || window.document.visibilityState !== 'visible') {
      return
    }

    const view = map.getView()
    const center = view.getCenter()
    const currentCenter = center ? toLonLatPair(center) : null
    const hasChanged =
      !currentCenter ||
      Math.abs(currentCenter[0] - documentViewport.center[0]) > 0.01 ||
      Math.abs(currentCenter[1] - documentViewport.center[1]) > 0.01 ||
      Math.abs((view.getZoom() ?? 0) - documentViewport.zoom) > 0.1 ||
      Math.abs(view.getRotation() - documentViewport.rotation) > 0.01

    if (hasChanged) {
      view.animate({
        center: fromLonLat(documentViewport.center),
        zoom: documentViewport.zoom,
        rotation: documentViewport.rotation,
        duration: VIEWPORT_SYNC_ANIMATION_MS,
      })
    }

  }, [documentViewport])

  useEffect(() => {
    syncWorldSourcesForScene()
    if (!mapRef.current) {
      return
    }

    if (tabLifecycleStateRef.current !== 'active') {
      return
    }

    applySceneViewportFit()
  }, [basemap.preset, sceneSelectionKey])

  useEffect(() => {
    if (tabLifecycleStateRef.current !== 'active') {
      return
    }

    applySceneViewConstraints()
  }, [basemap.preset, sceneContinentKey, sceneFocusPreset, sceneSelectionKey, sceneSystemEnabled])

  useEffect(() => {
    if (!assetDropRequest || readOnly || access !== 'editor') {
      return
    }

    const map = mapRef.current
    const target = map?.getTargetElement()
    if (!map || !target) {
      return
    }

    const bounds = target.getBoundingClientRect()
    const pixel: [number, number] = [
      assetDropRequest.clientX - bounds.left,
      assetDropRequest.clientY - bounds.top,
    ]

    const isInsideMap =
      pixel[0] >= 0 &&
      pixel[1] >= 0 &&
      pixel[0] <= bounds.width &&
      pixel[1] <= bounds.height

    if (!isInsideMap) {
      return
    }

    const coordinate = map.getCoordinateFromPixel(pixel)
    if (!coordinate) {
      return
    }

    const nextElementId = addAssetElement(
      assetDropRequest.assetId,
      toLonLatPair(coordinate),
      toUploadedAssetSnapshot(assetMapRef.current.get(assetDropRequest.assetId)),
    )
    useScenarioStore.getState().setTool('select')
    window.requestAnimationFrame(() => {
      useScenarioStore.getState().setSelectedElementId(nextElementId)
    })
  }, [access, addAssetElement, assetDropRequest, readOnly])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((event.target as HTMLElement)?.isContentEditable) return

      if ((event.key === 'Delete' || event.key === 'Backspace') && access === 'editor') {
        event.preventDefault()
        useScenarioStore.getState().removeSelectedElement()
      }

      if (event.key === 'z' && (event.ctrlKey || event.metaKey) && !event.shiftKey && access === 'editor') {
        event.preventDefault()
        useScenarioStore.getState().undo()
      }

      if (
        ((event.key === 'y' && (event.ctrlKey || event.metaKey)) ||
          (event.key === 'z' && (event.ctrlKey || event.metaKey) && event.shiftKey)) &&
        access === 'editor'
      ) {
        event.preventDefault()
        useScenarioStore.getState().redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [access])

  const mapTheme = useMemo(
    () => getMapTheme(stylePrefs.backgroundPreset),
    [stylePrefs.backgroundPreset],
  )

  const showSceneBar =
    sceneSystemEnabled && (access === 'editor' || hasActiveSceneSelection(scene))
  const showAlertAudioUnlockBanner =
    alertAudioRole === 'presentation' &&
    alertsEnabled &&
    alertSoundEnabled &&
    alertVolume > 0 &&
    alertAudioUnlockState !== 'unlocked'
  type MissileHudSummary = {
    id: string
    name: string
    phase: string
    remainingDistanceKm: number
    estimatedDuration: string
    country: 'iran' | 'israel'
    interceptOutcome: 'success' | 'failure' | null
  }
  const missileHudSummaries = useMemo(
    () =>
      missileRuntimeFlights
        .map((flight) => {
          const definition = getMissileById(flight.missileId)
          if (!definition) {
            return null
          }

          const totalDistanceKm = Math.round(
            haversineDistance(flight.launchCoord, flight.targetCoord) / 1000,
          )
          const remainingDistanceKm = Math.max(
            0,
            Math.round(totalDistanceKm * (1 - clamp(flight.progress, 0, 1))),
          )

          return {
            id: flight.id,
            name: definition.name,
            phase: flight.phase.toUpperCase(),
            remainingDistanceKm,
            estimatedDuration: formatEstimatedFlightMinutes(flight.duration),
            country: definition.country,
            interceptOutcome: flight.interceptOutcome,
          }
        })
        .filter((summary): summary is MissileHudSummary => summary !== null),
    [missileRuntimeFlights],
  )
  const setFocusCoordinate = useAlertStore((state) => state.setFocusCoordinate)

  const selectedAlertSummary = useMemo(() => {
    if (!selectedAlert) {
      return null
    }

    return {
      id: selectedAlert.id,
      englishName: selectedAlert.englishName,
      areaNameEn: selectedAlert.areaNameEn,
      shelterText: formatAlertShelterInstruction(selectedAlert.countdownSec),
      alertTypeLabel: getAlertTypeLabel(selectedAlert.alertTypeId),
      ageMinutes: getAlertAgeMinutes(selectedAlert, alertNow),
      occurredAtText: formatAlertOccurredAtTr(selectedAlert),
      citiesDetail: selectedAlert.citiesDetail,
    }
  }, [alertNow, selectedAlert])

  const focusedSystemSummary = useMemo(() => {
    if (!focusedSystemMessageId) return null
    const msg = systemMessages.find((m) => m.id === focusedSystemMessageId)
    if (!msg) return null
    const cities = msg.citiesEnriched
      ?.filter((c) => c.lat != null && c.lng != null)
      .map((c) => ({ name: c.en || c.he, lat: c.lat!, lon: c.lng! })) ?? []
    return {
      title: msg.titleEn || msg.titleHe || 'Sistem Mesajı',
      body: msg.bodyEn || msg.bodyHe,
      type: msg.type,
      cities,
      chipColor: msg.type === 'incident_ended' ? 'green' : 'orange',
    }
  }, [focusedSystemMessageId, systemMessages])

  return (
    <div
      className={`map-stage ${usesDeFactoLayers(basemap.preset) ? 'map-stage-de-facto' : 'map-stage-live'} map-theme-${stylePrefs.backgroundPreset}${selectedTool === 'eraser' && !readOnly ? ' map-tool-eraser' : ''}`}
      style={{ backgroundImage: mapTheme.stageBackground }}
    >
      {showSceneBar ? (
        <SceneBar
          basemapPreset={basemap.preset}
          canEdit={!readOnly && access === 'editor'}
          onClear={clearSceneSelection}
          onSetFocus={setFocusScene}
          onToggleContinent={toggleContinentScene}
          scene={scene}
        />
      ) : null}
      {showAlertAudioUnlockBanner ? (
        <button
          className="alert-audio-unlock-banner"
          disabled={alertAudioUnlockState === 'priming'}
          onClick={() => primeAlertAudio()}
          style={{ top: showSceneBar ? '4.5rem' : '1rem' }}
          type="button"
        >
          Alarm sesi için bir kez dokunun
        </button>
      ) : null}
      <LocationSearch
        onFlyTo={(center, zoom) => {
          setViewport(
            { center, zoom, rotation: documentViewport.rotation },
          )
        }}
      />
      <div className="map-tab-restore-overlay" ref={restoreOverlayRef}>
        <canvas className="map-tab-restore-overlay-canvas" ref={frozenFrameCanvasRef} />
      </div>
      {mapError ? <div className="map-error">{mapError}</div> : null}
      {missileHudSummaries.length > 0 ? (
        <div className="missile-flight-hud-stack">
          {missileHudSummaries.map((summary) => (
            <div
              className={`missile-flight-hud missile-flight-hud-${summary.country}`}
              key={summary.id}
            >
              <span>{summary.name}</span>
              <span>{summary.phase}</span>
              <span>{summary.remainingDistanceKm} km</span>
              <span>Tahmini sure: {summary.estimatedDuration}</span>
              {summary.interceptOutcome ? (
                <span
                  className={`missile-flight-outcome missile-flight-outcome-${summary.interceptOutcome}`}
                >
                  {summary.interceptOutcome === 'success'
                    ? 'ONLEME BASARILI'
                    : 'ONLEME BASARISIZ'}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
        {selectedAlertSummary ? (
          <div className="alert-selection-hud">
            <div className="alert-selection-hud-title">
              <strong>{selectedAlertSummary.englishName}</strong>
              <span>{selectedAlertSummary.alertTypeLabel}</span>
            </div>
            <div className="alert-selection-hud-meta">
              <span>{selectedAlertSummary.shelterText}</span>
              <span>{selectedAlertSummary.ageMinutes} dk önce</span>
              <span>{selectedAlertSummary.occurredAtText}</span>
            </div>
            {selectedAlertSummary.citiesDetail && selectedAlertSummary.citiesDetail.length > 1 && (
              <div className="alert-hud-cities">
                {selectedAlertSummary.citiesDetail.map((city, i) => (
                  <button
                    key={`${city.name}-${i}`}
                    className="alert-hud-city-chip"
                    type="button"
                    onClick={() => setFocusCoordinate({ lat: city.lat, lon: city.lon, name: city.name })}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
        {focusedSystemSummary && focusedSystemSummary.cities.length > 0 ? (
          <div className={`alert-selection-hud alert-selection-hud-${focusedSystemSummary.chipColor}`}>
            <div className="alert-selection-hud-title">
              <strong>{focusedSystemSummary.title}</strong>
            </div>
            {focusedSystemSummary.body && (
              <div className="alert-selection-hud-meta">
                <span>{focusedSystemSummary.body}</span>
              </div>
            )}
            <div className="alert-hud-cities">
              {focusedSystemSummary.cities.map((city, i) => (
                <button
                  key={`${city.name}-${i}`}
                  className={`alert-hud-city-chip alert-hud-city-chip-${focusedSystemSummary.chipColor}`}
                  type="button"
                  onClick={() => setFocusCoordinate({ lat: city.lat, lon: city.lon, name: city.name })}
                >
                  {city.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      {selectionHud && manipulationPreview ? (
        <div
          className="selection-drag-preview"
          style={{
            left: selectionHud.left,
            top: selectionHud.top,
          }}
        >
          {manipulationPreview.kind === 'asset' ? (
            <>
              <img alt={manipulationPreview.label} src={manipulationPreview.src} />
              <span className="selection-drag-preview-label">{manipulationPreview.label}</span>
            </>
          ) : manipulationPreview.kind === 'text' ? (
            <span className="selection-drag-preview-label">{manipulationPreview.label}</span>
          ) : (
            <span className="selection-drag-preview-label">Tasiniyor</span>
          )}
        </div>
      ) : null}
      {selectionHud ? (
        <div
          className="selection-hud"
          style={{
            left: selectionHud.left,
            top: selectionHud.top,
          }}
        >
          <button
            className="selection-hud-button selection-hud-rotate"
            disabled={selectionHud.locked}
            onClick={() => {
              const state = useScenarioStore.getState()
              const currentRotation =
                state.document.elements.find((element) => element.id === selectionHud.elementId)?.rotation ??
                selectionHud.rotation
              state.updateSelectedElementNumeric('rotation', currentRotation - HUD_ROTATION_STEP)
            }}
            type="button"
            title="Sola döndür"
          >
            ↺
          </button>
          {selectionHud.canScale ? (
            <>
          <button
            className="selection-hud-button"
            disabled={selectionHud.locked}
            onClick={() =>
              useScenarioStore
                .getState()
                .updateSelectedElementNumeric('scale', (selectionHud.scale ?? 1) - 0.15)
            }
            type="button"
            title="Küçült"
          >
            -
          </button>
          <span className="selection-hud-value">%{Math.round((selectionHud.scale ?? 1) * 100)}</span>
          <button
            className="selection-hud-button"
            disabled={selectionHud.locked}
            onClick={() =>
              useScenarioStore
                .getState()
                .updateSelectedElementNumeric('scale', (selectionHud.scale ?? 1) + 0.15)
            }
            type="button"
            title="Büyüt"
          >
            +
          </button>
          <span className="selection-hud-divider" />
            </>
          ) : null}
          <button
            className="selection-hud-button selection-hud-rotate"
            disabled={selectionHud.locked}
            onClick={() => {
              const state = useScenarioStore.getState()
              const currentRotation =
                state.document.elements.find((element) => element.id === selectionHud.elementId)?.rotation ??
                selectionHud.rotation
              state.updateSelectedElementNumeric('rotation', currentRotation + HUD_ROTATION_STEP)
            }}
            type="button"
            title="Sağa döndür"
          >
            ↻
          </button>
          <span className="selection-hud-divider" />
          <button
            className={`selection-hud-button selection-hud-lock ${selectionHud.locked ? 'selection-hud-lock-locked' : 'selection-hud-lock-open'}`}
            onClick={() => {
              useScenarioStore.getState().toggleSelectedLock()
            }}
            type="button"
            title={selectionHud.locked ? 'Kilidi aç' : 'Kilitle'}
          >
            {selectionHud.locked ? 'Kilitli' : 'Açık'}
          </button>
          <button
            className="selection-hud-button selection-hud-delete"
            disabled={selectionHud.locked}
            onClick={() => {
              useScenarioStore.getState().removeSelectedElement()
            }}
            type="button"
            title="Sil"
          >
            ✕
          </button>
          <button
            className="selection-hud-button selection-hud-confirm"
            onClick={() => {
              useScenarioStore.getState().setSelectedElementId(null)
            }}
            type="button"
            title="Tamam"
          >
            ✓
          </button>
        </div>
      ) : null}
      {inlineTextInput ? (
        <div
          className="inline-text-overlay"
          style={{
            left: inlineTextInput.left,
            top: inlineTextInput.top,
          }}
        >
          <textarea
            ref={inlineTextRef}
            className="inline-text-input"
            value={inlineTextInput.text}
            placeholder="Metin yaz..."
            onChange={(e) =>
              setInlineTextInput((prev) =>
                prev ? { ...prev, text: e.target.value } : null,
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                const text = inlineTextInput.text.trim()
                if (text && inlineTextInput && useScenarioStore.getState().document.selectedTool === 'text') {
                  useScenarioStore.getState().setTextDraft(text)
                  const nextId = addTextElement(inlineTextInput.coordinate)
                  setTool('select')
                  window.requestAnimationFrame(() => {
                    useScenarioStore.getState().setSelectedElementId(nextId)
                  })
                }
                setInlineTextInput(null)
              }
              if (e.key === 'Escape') {
                setInlineTextInput(null)
              }
            }}
          />
          <div className="inline-text-actions">
            <button
              className="inline-text-btn inline-text-cancel"
              type="button"
              onClick={() => setInlineTextInput(null)}
              title="İptal"
            >
              ✕
            </button>
            <button
              className="inline-text-btn inline-text-confirm"
              type="button"
              onClick={() => {
                const text = inlineTextInput.text.trim()
                if (text && useScenarioStore.getState().document.selectedTool === 'text') {
                  useScenarioStore.getState().setTextDraft(text)
                  const nextId = addTextElement(inlineTextInput.coordinate)
                  setTool('select')
                  window.requestAnimationFrame(() => {
                    useScenarioStore.getState().setSelectedElementId(nextId)
                  })
                }
                setInlineTextInput(null)
              }}
              title="Tamam"
            >
              ✓
            </button>
          </div>
        </div>
      ) : null}
      {eraserCursor && selectedTool === 'eraser' ? (
        <div
          className="eraser-cursor"
          style={{
            width: eraserSize,
            height: eraserSize,
            left: eraserCursor.x,
            top: eraserCursor.y,
          }}
        />
      ) : null}
      <div className="map-surface" ref={mapElementRef} />
    </div>
  )
}
