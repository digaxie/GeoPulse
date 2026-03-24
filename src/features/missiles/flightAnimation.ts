import Point from 'ol/geom/Point'
import LineString from 'ol/geom/LineString'
import type VectorLayer from 'ol/layer/Vector'
import type OlMap from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import { getVectorContext } from 'ol/render'
import type RenderEvent from 'ol/render/Event'
import type VectorSource from 'ol/source/Vector'
import Style from 'ol/style/Style'
import Stroke from 'ol/style/Stroke'
import Fill from 'ol/style/Fill'
import Text from 'ol/style/Text'
import { Circle as CircleStyle, RegularShape } from 'ol/style'

import { calculateBearing, generateArcPoints, greatCircleInterpolation, haversineDistance } from '@/features/missiles/geodesic'
import { getMissileById } from '@/features/missiles/missileData'
import { getMissileVisualPalette } from '@/features/missiles/styles'
import type {
  Flight,
  FlightPhase,
  MissileDefinition,
  MissileLaunchCommand,
  MissilePlaybackSpeedMode,
} from '@/features/missiles/types'

type RuntimeFlight = {
  id: string
  missileId: string
  launchCoord: [number, number]
  targetCoord: [number, number]
  startTime: number
  duration: number
  phase: Flight['phase']
  progress: number
  interceptOutcome: Flight['interceptOutcome']
  interceptProbability: Flight['interceptProbability']
  country: MissileDefinition['country']
  label: string
  solidColor: string
  trailColor: string
  glyphRotation: number
  arcPoints: [number, number][]
  suppressTerminalEffect: boolean
}

type RuntimeEffect = {
  id: string
  coord: [number, number]
  color: string
  kind: 'impact' | 'intercept' | 'fizzle'
  startedAt: number
}

type FlightAnimationCallbacks = {
  onFlightsChange?: (flights: Flight[]) => void
}

type FlightAnimationController = {
  launch: (command: MissileLaunchCommand) => void
  clear: () => void
  destroy: () => void
}

const IMPACT_DURATION_MS = 1000
const FIZZLE_DURATION_MS = 700
const TRAIL_POINT_COUNT = 30
const TRAIL_SEGMENT_COUNT = 72
const INTERCEPT_MIN_LEAD_MS = 800
const INTERCEPT_PROGRESS_STEP = 0.02
const INTERCEPT_PROGRESS_LIMIT = 0.98
const INTERCEPT_SEARCH_STEPS = 36

export const FIXED_FLIGHT_DURATION_MS = {
  ballistic: 3800,
  cruise: 5200,
  hypersonic: 3000,
  interceptor: 2200,
  directed_energy: 1500,
  slv_dual_use: 4500,
} as const

export const FLIGHT_PHASE_THRESHOLDS = {
  ballistic: [0.2, 0.7],
  cruise: [0.15, 0.85],
  hypersonic: [0.18, 0.78],
  interceptor: [0.35, 0.8],
  directed_energy: [0.4, 0.9],
  slv_dual_use: [0.22, 0.76],
} as const

const INTERCEPT_PROGRESS_BY_MISSILE: Record<string, number> = {
  israel_arrow_3: 0.45,
  israel_arrow_2: 0.65,
  israel_arrow_4: 0.65,
  israel_davids_sling: 0.65,
  israel_iron_dome: 0.82,
  israel_barak_8: 0.82,
  israel_barak_er: 0.82,
  israel_iron_beam: 0.82,
}

export function getInterceptProgressRatio(missileId: string) {
  return INTERCEPT_PROGRESS_BY_MISSILE[missileId] ?? 0.65
}

const DEFAULT_MACH_BY_KIND = {
  ballistic: 7,
  cruise: 0.8,
  hypersonic: 12,
  interceptor: 7,
  directed_energy: null,
  slv_dual_use: 7,
} as const

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getFlightKind(definition: MissileDefinition) {
  if (definition.type === 'interceptor') {
    return 'interceptor'
  }
  if (definition.type === 'directed_energy') {
    return 'directed_energy'
  }
  if (definition.type === 'slv_dual_use') {
    return 'slv_dual_use'
  }

  return definition.type
}

export function getFixedFlightDurationMs(definition: MissileDefinition) {
  return FIXED_FLIGHT_DURATION_MS[getFlightKind(definition)]
}

export function getEffectiveMachNumber(definition: MissileDefinition) {
  return definition.machNumber ?? DEFAULT_MACH_BY_KIND[getFlightKind(definition)]
}

export function getEstimatedFlightDurationMs(
  definition: MissileDefinition,
  launchCoord: [number, number],
  targetCoord: [number, number],
  mode: MissilePlaybackSpeedMode,
) {
  if (mode === 'fast') {
    return getFixedFlightDurationMs(definition)
  }

  const kind = getFlightKind(definition)
  if (kind === 'directed_energy') {
    return getFixedFlightDurationMs(definition)
  }

  const machNumber = getEffectiveMachNumber(definition)
  if (!machNumber || machNumber <= 0) {
    return getFixedFlightDurationMs(definition)
  }

  const distanceKm = haversineDistance(launchCoord, targetCoord) / 1000
  const factor = kind === 'cruise' ? 0.95 : 0.65
  const hours = distanceKm / (machNumber * 1225 * factor)

  return Math.max(1000, Math.round(hours * 60 * 60 * 1000))
}

export function getFlightDurationMs(
  definition: MissileDefinition,
  mode: MissilePlaybackSpeedMode = 'fast',
  launchCoord: [number, number] = definition.defaultLaunchCoord,
  targetCoord: [number, number] = definition.defaultLaunchCoord,
) {
  return getEstimatedFlightDurationMs(definition, launchCoord, targetCoord, mode)
}

export function getLaunchCommandDurationMs(command: MissileLaunchCommand, definition?: MissileDefinition | null) {
  if (command.durationMs > 0) {
    return command.durationMs
  }

  if (!definition) {
    return 0
  }

  return getFixedFlightDurationMs(definition)
}

export function formatEstimatedFlightMinutes(durationMs: number) {
  return `~${Math.max(0, Math.round(durationMs / 60_000))} dk`
}

export function getFlightPhase(progress: number, definition: MissileDefinition): FlightPhase {
  if (progress <= 0) {
    return 'ready'
  }
  if (progress >= 1) {
    return 'complete'
  }

  const [boostLimit, midcourseLimit] = FLIGHT_PHASE_THRESHOLDS[getFlightKind(definition)]
  if (progress < boostLimit) {
    return 'launching'
  }
  if (progress < midcourseLimit) {
    return 'inflight'
  }
  return 'inflight'
}

export function getFramePhase(progress: number, definition: MissileDefinition): Flight['phase'] {
  if (progress >= 1) {
    return 'complete'
  }

  const [boostLimit, midcourseLimit] = FLIGHT_PHASE_THRESHOLDS[getFlightKind(definition)]
  if (progress < boostLimit) {
    return 'boost'
  }
  if (progress < midcourseLimit) {
    return 'midcourse'
  }
  return 'terminal'
}

export function isLaunchCommandStale(command: MissileLaunchCommand, definition: MissileDefinition, now = Date.now()) {
  return now - command.launchedAt > getLaunchCommandDurationMs(command, definition) + 2000
}

export function getHostileInterceptSnapshot(
  hostileFlight: Pick<Flight, 'launchCoord' | 'targetCoord' | 'progress' | 'duration' | 'startTime'>,
  interceptorDefinition: MissileDefinition,
  interceptorLaunchCoord: [number, number],
  launchedAt: number,
  mode: MissilePlaybackSpeedMode,
) {
  const hostileElapsedMs = Math.max(0, launchedAt - hostileFlight.startTime)
  const currentProgress = clamp(hostileFlight.progress, 0, INTERCEPT_PROGRESS_LIMIT)
  const minProgress = clamp(
    currentProgress + INTERCEPT_PROGRESS_STEP,
    INTERCEPT_PROGRESS_STEP,
    INTERCEPT_PROGRESS_LIMIT,
  )

  const buildSnapshot = (interceptProgress: number) => {
    const interceptCoord = greatCircleInterpolation(
      hostileFlight.launchCoord,
      hostileFlight.targetCoord,
      interceptProgress,
    )
    const hostileInterceptAtMs = Math.max(
      hostileElapsedMs + INTERCEPT_MIN_LEAD_MS,
      Math.round(hostileFlight.duration * interceptProgress),
    )
    const remainingToInterceptMs = Math.max(INTERCEPT_MIN_LEAD_MS, hostileInterceptAtMs - hostileElapsedMs)
    const interceptorTravelMs = getEstimatedFlightDurationMs(
      interceptorDefinition,
      interceptorLaunchCoord,
      interceptCoord,
      mode,
    )
    const interceptorDistanceKm = haversineDistance(interceptorLaunchCoord, interceptCoord) / 1000
    const withinRange =
      interceptorDefinition.rangeMaxKm === null || interceptorDistanceKm <= interceptorDefinition.rangeMaxKm

    return {
      interceptCoord,
      interceptProgress,
      remainingToInterceptMs,
      interceptorTravelMs,
      withinRange,
    }
  }

  for (let step = 0; step <= INTERCEPT_SEARCH_STEPS; step += 1) {
    const progress =
      minProgress +
      ((INTERCEPT_PROGRESS_LIMIT - minProgress) * step) / Math.max(1, INTERCEPT_SEARCH_STEPS)
    const snapshot = buildSnapshot(progress)
    if (!snapshot.withinRange) {
      continue
    }
    if (snapshot.interceptorTravelMs <= snapshot.remainingToInterceptMs) {
      return snapshot
    }
  }

  const fallbackProgress = clamp(
    Math.max(getInterceptProgressRatio(interceptorDefinition.id), currentProgress + 0.08),
    minProgress,
    INTERCEPT_PROGRESS_LIMIT,
  )
  const fallbackSnapshot = buildSnapshot(fallbackProgress)
  if (!fallbackSnapshot.withinRange) {
    return null
  }

  return fallbackSnapshot.interceptorTravelMs <= fallbackSnapshot.remainingToInterceptMs
    ? fallbackSnapshot
    : null
}

function createGlyphStyle(color: string, rotationDegrees: number) {
  return new Style({
    image: new RegularShape({
      points: 3,
      radius: 10,
      rotation: ((rotationDegrees - 90) * Math.PI) / 180,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 1.4 }),
    }),
  })
}

function createTrailStyle(color: string, width = 2) {
  return new Style({
    stroke: new Stroke({
      color,
      width,
      lineCap: 'round',
      lineJoin: 'round',
    }),
  })
}

function createLabelStyle(label: string, color: string) {
  return new Style({
    text: new Text({
      text: label,
      offsetY: -18,
      font: '700 11px "IBM Plex Mono", monospace',
      padding: [3, 7, 3, 7],
      fill: new Fill({ color: '#ffffff' }),
      backgroundFill: new Fill({ color: 'rgba(13, 27, 46, 0.88)' }),
      backgroundStroke: new Stroke({ color: hexToRgba(color, 0.88), width: 1 }),
    }),
  })
}

function createBurstStyles(color: string, elapsed: number) {
  const t = clamp(elapsed / IMPACT_DURATION_MS, 0, 1)
  const alpha = 1 - t

  return [0, 10, 20].map((baseRadius, index) =>
    new Style({
      image: new CircleStyle({
        radius: baseRadius + t * (10 + index * 4),
        fill: new Fill({ color: 'rgba(0,0,0,0)' }),
        stroke: new Stroke({
          color: hexToRgba(color, Math.max(0.15, alpha)),
          width: Math.max(1, 3 - index),
        }),
      }),
    }),
  )
}

function createFizzleStyles(color: string, elapsed: number) {
  const t = clamp(elapsed / FIZZLE_DURATION_MS, 0, 1)
  const alpha = 1 - t

  return [
    new Style({
      image: new CircleStyle({
        radius: 4 + t * 3,
        fill: new Fill({ color: hexToRgba(color, Math.max(0.08, alpha * 0.22)) }),
        stroke: new Stroke({
          color: hexToRgba(color, Math.max(0.16, alpha * 0.55)),
          width: 1.4,
        }),
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius: 1.5 + t * 1.5,
        fill: new Fill({ color: hexToRgba('#ffffff', Math.max(0.12, alpha * 0.35)) }),
      }),
    }),
  ]
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const safe = normalized.length === 3
    ? normalized
        .split('')
        .map((chunk) => `${chunk}${chunk}`)
        .join('')
    : normalized
  const red = Number.parseInt(safe.slice(0, 2), 16)
  const green = Number.parseInt(safe.slice(2, 4), 16)
  const blue = Number.parseInt(safe.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function toRuntimeFlight(command: MissileLaunchCommand, definition: MissileDefinition, hostileFlight?: RuntimeFlight): RuntimeFlight | null {
  const isInterceptor =
    definition.type === 'interceptor' || definition.type === 'directed_energy'

  if (isInterceptor && command.interceptLaunchId && !hostileFlight) {
    return null
  }

  let targetCoord = command.targetCoord
  let duration = getLaunchCommandDurationMs(command, definition)
  const interceptOutcome =
    isInterceptor && command.interceptLaunchId
      ? (command.interceptOutcome ?? 'success')
      : null
  const suppressTerminalEffect = false

  if (isInterceptor && hostileFlight && command.interceptLaunchId) {
    targetCoord = command.targetCoord
    if (interceptOutcome === 'success') {
      hostileFlight.targetCoord = targetCoord
      hostileFlight.arcPoints = generateArcPoints(hostileFlight.launchCoord, targetCoord, TRAIL_SEGMENT_COUNT)
      hostileFlight.duration = Math.max(
        command.launchedAt - hostileFlight.startTime + command.durationMs,
        800,
      )
      hostileFlight.suppressTerminalEffect = true
    }
    duration = getLaunchCommandDurationMs(command, definition)
  }

  const arcPoints = generateArcPoints(command.launchCoord, targetCoord, TRAIL_SEGMENT_COUNT)
  const visualPalette = getMissileVisualPalette(definition.country, command.id)
  return {
    id: command.id,
    missileId: command.missileId,
    launchCoord: command.launchCoord,
    targetCoord,
    startTime: command.launchedAt,
    duration,
    phase: 'boost',
    progress: 0,
    interceptOutcome,
    interceptProbability: command.interceptProbability ?? definition.interceptProbability ?? null,
    country: definition.country,
    label: definition.name,
    solidColor: visualPalette.solid,
    trailColor: visualPalette.trail,
    glyphRotation: calculateBearing(command.launchCoord, targetCoord),
    arcPoints,
    suppressTerminalEffect,
  }
}

export function createFlightAnimationController(
  map: OlMap,
  layer: VectorLayer<VectorSource>,
  _source: VectorSource,
  callbacks: FlightAnimationCallbacks = {},
): FlightAnimationController {
  const runtimeFlights = new Map<string, RuntimeFlight>()
  const runtimeEffects = new Map<string, RuntimeEffect>()

  const syncFlights = () => {
    callbacks.onFlightsChange?.(
      Array.from(runtimeFlights.values()).map((flight) => ({
        id: flight.id,
        missileId: flight.missileId,
        launchCoord: flight.launchCoord,
        targetCoord: flight.targetCoord,
        startTime: flight.startTime,
        duration: flight.duration,
        phase: flight.phase,
        progress: flight.progress,
        interceptOutcome: flight.interceptOutcome,
        interceptProbability: flight.interceptProbability,
      })),
    )
  }

  const drawTrail = (event: RenderEvent, flight: RuntimeFlight) => {
    const vectorContext = getVectorContext(event)
    const index = Math.max(1, Math.round((flight.arcPoints.length - 1) * flight.progress))
    const trailPoints = flight.arcPoints.slice(Math.max(0, index - TRAIL_POINT_COUNT), index + 1)
    if (trailPoints.length < 2) {
      return
    }

    vectorContext.setStyle(
      createTrailStyle(
        hexToRgba(
          flight.phase === 'terminal' ? flight.solidColor : flight.trailColor,
          flight.missileId.includes('fattah') ? 0.95 : 0.8,
        ),
        flight.missileId.includes('fattah') ? 3 : 2,
      ),
    )
    vectorContext.drawGeometry(new LineString(trailPoints.map((point) => fromLonLat(point))))
  }

  const drawFlight = (event: RenderEvent, flight: RuntimeFlight) => {
    const vectorContext = getVectorContext(event)
    const currentPoint = flight.arcPoints[
      Math.min(flight.arcPoints.length - 1, Math.round((flight.arcPoints.length - 1) * flight.progress))
    ]
    if (!currentPoint) {
      return
    }

    const previousPoint = flight.arcPoints[
      Math.max(
        0,
        Math.min(
          flight.arcPoints.length - 1,
          Math.round((flight.arcPoints.length - 1) * Math.max(0, flight.progress - 0.03)),
        ),
      )
    ] ?? flight.launchCoord
    const bearing = calculateBearing(previousPoint, currentPoint)
    const point = new Point(fromLonLat(currentPoint))

    drawTrail(event, flight)
    vectorContext.setStyle(createGlyphStyle(flight.solidColor, bearing))
    vectorContext.drawGeometry(point)
    vectorContext.setStyle(createLabelStyle(flight.label, flight.solidColor))
    vectorContext.drawGeometry(point)
  }

  const drawEffect = (event: RenderEvent, effect: RuntimeEffect, now: number) => {
    const elapsed = now - effect.startedAt
    const duration = effect.kind === 'fizzle' ? FIZZLE_DURATION_MS : IMPACT_DURATION_MS
    if (elapsed > duration) {
      runtimeEffects.delete(effect.id)
      return
    }

    const vectorContext = getVectorContext(event)
    const styles =
      effect.kind === 'fizzle'
        ? createFizzleStyles(effect.color, elapsed)
        : createBurstStyles(effect.color, elapsed)
    const point = new Point(fromLonLat(effect.coord))

    for (const style of styles) {
      vectorContext.setStyle(style)
      vectorContext.drawGeometry(point)
    }
  }

  const handlePostRender = (event: RenderEvent) => {
    const now = Date.now()
    let hasActiveFrame = false

    runtimeFlights.forEach((flight) => {
      const definition = getMissileById(flight.missileId)
      if (!definition) {
        runtimeFlights.delete(flight.id)
        return
      }

      const progress = clamp((now - flight.startTime) / flight.duration, 0, 1)
      flight.progress = progress
      flight.phase = getFramePhase(progress, definition)

      if (progress >= 1) {
        if (flight.interceptOutcome === 'failure') {
          runtimeEffects.set(flight.id, {
            id: flight.id,
            coord: flight.targetCoord,
            color: flight.solidColor,
            kind: 'fizzle',
            startedAt: now,
          })
        } else if (!flight.suppressTerminalEffect) {
          runtimeEffects.set(flight.id, {
            id: flight.id,
            coord: flight.targetCoord,
            color: flight.solidColor,
            kind:
              definition.type === 'interceptor' || definition.type === 'directed_energy'
                ? 'intercept'
                : 'impact',
            startedAt: now,
          })
        }
        runtimeFlights.delete(flight.id)
        return
      }

      hasActiveFrame = true
      drawFlight(event, flight)
    })

    runtimeEffects.forEach((effect) => {
      drawEffect(event, effect, now)
      hasActiveFrame = true
    })

    syncFlights()

    if (hasActiveFrame) {
      map.render()
    }
  }

  layer.on('postrender', handlePostRender)

  return {
    launch(command) {
      if (runtimeFlights.has(command.id)) {
        return
      }

      const definition = getMissileById(command.missileId)
      if (!definition) {
        return
      }

      const hostileFlight =
        definition.type === 'interceptor' || definition.type === 'directed_energy'
          ? command.interceptLaunchId
            ? runtimeFlights.get(command.interceptLaunchId) ?? null
            : null
          : null
      const flight = toRuntimeFlight(command, definition, hostileFlight ?? undefined)
      if (!flight) {
        return
      }

      runtimeFlights.set(command.id, flight)
      syncFlights()
      map.render()
    },

    clear() {
      runtimeFlights.clear()
      runtimeEffects.clear()
      syncFlights()
      map.render()
    },

    destroy() {
      layer.un('postrender', handlePostRender)
      runtimeFlights.clear()
      runtimeEffects.clear()
      syncFlights()
    },
  }
}
