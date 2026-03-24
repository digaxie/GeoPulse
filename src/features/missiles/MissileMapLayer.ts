import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import Polygon, { circular as circularPolygon } from 'ol/geom/Polygon'
import VectorLayer from 'ol/layer/Vector'
import type OlMap from 'ol/Map'
import { fromLonLat } from 'ol/proj'
import VectorSource from 'ol/source/Vector'

import { createFlightAnimationController } from '@/features/missiles/flightAnimation'
import { haversineDistance } from '@/features/missiles/geodesic'
import { serializeCoord } from '@/features/missiles/launchSites'
import { getMissileById } from '@/features/missiles/missileData'
import {
  createFlightTargetStyle,
  getMissileVisualPalette,
  createLaunchSiteStyle,
  createRangeStyle,
  createTargetStyle,
  MISSILE_LAYER_Z_INDEX,
} from '@/features/missiles/styles'
import type { Flight, MissileLaunchCommand } from '@/features/missiles/types'

export type MissileBindings = {
  showRange: (missileId: string, centerCoord?: [number, number] | null) => void
  hideRange: (missileId: string) => void
  setTarget: (
    coord: [number, number] | null,
    activeMissileId?: string | null,
    launchCoord?: [number, number] | null,
  ) => void
  setFlightTargets: (flights: Flight[]) => void
  setLaunchSite: (coord: [number, number] | null, activeMissileId?: string | null) => void
  launchMissile: (command: MissileLaunchCommand) => void
  launchSalvo: (commands: MissileLaunchCommand[]) => void
  clearAll: () => void
  destroy: () => void
}

function formatRangeLabel(missileId: string) {
  const definition = getMissileById(missileId)
  if (!definition) {
    return missileId
  }

  if (definition.rangeMinKm !== null && definition.rangeMaxKm !== null && definition.rangeMinKm !== definition.rangeMaxKm) {
    return `${definition.name} - ${definition.rangeMinKm}-${definition.rangeMaxKm} km`
  }

  if (definition.rangeMaxKm !== null) {
    return `${definition.name} - ${definition.rangeMaxKm} km`
  }

  return `${definition.name} - belirsiz`
}

function buildRangeFeature(missileId: string, centerCoord: [number, number]) {
  const definition = getMissileById(missileId)
  if (!definition || definition.rangeMaxKm === null) {
    return null
  }

  const geometry = circularPolygon(centerCoord, definition.rangeMaxKm * 1000, 128)
  geometry.transform('EPSG:4326', 'EPSG:3857')
  const feature = new Feature<Polygon>({ geometry })
  feature.set('missileId', missileId)
  feature.set('styleKind', 'range')
  feature.set('centerKey', serializeCoord(centerCoord))
  feature.setStyle(createRangeStyle(definition.country, formatRangeLabel(missileId)))
  return feature
}

function buildTargetFeature(
  coord: [number, number],
  activeMissileId: string | null,
  launchCoord: [number, number] | null = null,
) {
  const definition = activeMissileId ? getMissileById(activeMissileId) : null
  let label = 'HEDEF'
  let inRange = true

  if (definition && definition.rangeMaxKm !== null) {
    const distanceKm = Math.round(haversineDistance(launchCoord ?? definition.defaultLaunchCoord, coord) / 1000)
    inRange = distanceKm <= definition.rangeMaxKm
    label = inRange
      ? `MENZILDE - ${distanceKm} km`
      : `MENZIL DISI - ${distanceKm} / ${definition.rangeMaxKm} km`
  } else if (definition && definition.rangeMaxKm === null) {
    label = 'BELIRSIZ MENZIL'
    inRange = false
  }

  const feature = new Feature<Point>({
    geometry: new Point(fromLonLat(coord)),
  })
  feature.set('styleKind', 'target')
  feature.setStyle(createTargetStyle({ inRange, label }))
  return feature
}

function buildLaunchSiteFeature(coord: [number, number], activeMissileId: string | null) {
  const definition = activeMissileId ? getMissileById(activeMissileId) : null
  if (!definition) {
    return null
  }

  const feature = new Feature<Point>({
    geometry: new Point(fromLonLat(coord)),
  })
  feature.set('styleKind', 'launchSite')
  feature.setStyle(createLaunchSiteStyle(definition.country))
  return feature
}

function buildFlightTargetFeature(flight: Flight) {
  const definition = getMissileById(flight.missileId)
  if (!definition) {
    return null
  }

  const palette = getMissileVisualPalette(definition.country, flight.id)
  const feature = new Feature<Point>({
    geometry: new Point(fromLonLat(flight.targetCoord)),
  })
  feature.set('styleKind', 'flightTarget')
  feature.set('flightId', flight.id)
  feature.setStyle(createFlightTargetStyle(palette.solid, definition.name))
  return feature
}

export function createMissileLayer(
  map: OlMap,
  options: {
    onFlightsChange?: (flights: Flight[]) => void
  } = {},
): {
  layer: VectorLayer<VectorSource>
  bindings: MissileBindings
} {
  const source = new VectorSource()
  const layer = new VectorLayer({
    source,
    zIndex: MISSILE_LAYER_Z_INDEX,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
  })

  const rangeFeatures = new Map<string, Feature<Polygon>>()
  let targetFeature: Feature<Point> | null = null
  let launchSiteFeature: Feature<Point> | null = null
  const flightTargetFeatures = new Map<string, Feature<Point>>()

  const animation = createFlightAnimationController(map, layer, source, {
    onFlightsChange: options.onFlightsChange,
  })

  const bindings: MissileBindings = {
    showRange(missileId, centerCoord = null) {
      const definition = getMissileById(missileId)
      const nextCenter = centerCoord ?? definition?.defaultLaunchCoord ?? null
      if (!nextCenter) {
        return
      }

      const existing = rangeFeatures.get(missileId)
      if (existing?.get('centerKey') === serializeCoord(nextCenter)) {
        return
      }

      if (existing) {
        source.removeFeature(existing)
        rangeFeatures.delete(missileId)
      }

      const feature = buildRangeFeature(missileId, nextCenter)
      if (!feature) {
        return
      }

      rangeFeatures.set(missileId, feature)
      source.addFeature(feature)
    },

    hideRange(missileId) {
      const feature = rangeFeatures.get(missileId)
      if (!feature) {
        return
      }

      rangeFeatures.delete(missileId)
      source.removeFeature(feature)
    },

    setTarget(coord, activeMissileId = null, launchCoord = null) {
      if (targetFeature) {
        source.removeFeature(targetFeature)
        targetFeature = null
      }

      if (!coord) {
        return
      }

      targetFeature = buildTargetFeature(coord, activeMissileId, launchCoord)
      source.addFeature(targetFeature)
    },

    setFlightTargets(flights) {
      const nextFlightIds = new Set(flights.map((flight) => flight.id))

      for (const [flightId, feature] of flightTargetFeatures) {
        if (nextFlightIds.has(flightId)) {
          continue
        }

        source.removeFeature(feature)
        flightTargetFeatures.delete(flightId)
      }

      for (const flight of flights) {
        if (flightTargetFeatures.has(flight.id)) {
          continue
        }

        const nextFeature = buildFlightTargetFeature(flight)
        if (!nextFeature) {
          continue
        }

        flightTargetFeatures.set(flight.id, nextFeature)
        source.addFeature(nextFeature)
      }
    },

    setLaunchSite(coord, activeMissileId = null) {
      if (launchSiteFeature) {
        source.removeFeature(launchSiteFeature)
        launchSiteFeature = null
      }

      if (!coord) {
        return
      }

      launchSiteFeature = buildLaunchSiteFeature(coord, activeMissileId)
      if (launchSiteFeature) {
        source.addFeature(launchSiteFeature)
      }
    },

    launchMissile(command) {
      animation.launch(command)
    },

    launchSalvo(commands) {
      for (const command of commands) {
        animation.launch(command)
      }
    },

    clearAll() {
      animation.clear()
      rangeFeatures.clear()
      targetFeature = null
      launchSiteFeature = null
      flightTargetFeatures.clear()
      source.clear()
    },

    destroy() {
      animation.destroy()
      rangeFeatures.clear()
      targetFeature = null
      launchSiteFeature = null
      flightTargetFeatures.clear()
      source.clear()
    },
  }

  return { layer, bindings }
}
