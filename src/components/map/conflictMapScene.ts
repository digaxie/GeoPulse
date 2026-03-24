import { intersects as extentsIntersect } from 'ol/extent'
import Feature from 'ol/Feature'
import LineString from 'ol/geom/LineString'
import Point from 'ol/geom/Point'
import Polygon from 'ol/geom/Polygon'
import type Geometry from 'ol/geom/Geometry'
import { fromLonLat, toLonLat, transformExtent } from 'ol/proj'
import VectorSource from 'ol/source/Vector'

import {
  getSceneSelectionExtent,
  scenePresetRegistry,
  type SceneExtent,
  type SceneSelection,
} from '@/features/scenario/scenes'
import type { Coordinate, ScenarioElement } from '@/features/scenario/model'

export type WorldSources = {
  countries: VectorSource
  admin1: VectorSource
  cities: VectorSource
  disputed: VectorSource
}

export type WorldFeatureCollections = {
  countries: Feature<Geometry>[]
  admin1: Feature<Geometry>[]
  cities: Feature<Geometry>[]
  disputed: Feature<Geometry>[]
}

export function createEmptyFeatureSources(): WorldSources {
  return {
    countries: new VectorSource(),
    admin1: new VectorSource(),
    cities: new VectorSource(),
    disputed: new VectorSource(),
  }
}

export function createEmptyWorldFeatureCollections(): WorldFeatureCollections {
  return {
    countries: [],
    admin1: [],
    cities: [],
    disputed: [],
  }
}

export function normalizeCountryCode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export function getFeatureCountryCode(feature: Feature<Geometry>) {
  return normalizeCountryCode(
    feature.get('ADM0_A3') ??
      feature.get('adm0_a3') ??
      feature.get('ISO_A3') ??
      feature.get('adm0_code'),
  )
}

export function getFeatureContinent(feature: Feature<Geometry>) {
  const continent = feature.get('CONTINENT')
  return typeof continent === 'string' ? continent.trim() : ''
}

export function getSceneFallbackMercatorExtent(
  scene: SceneSelection,
  mode: 'render' | 'fit' = 'render',
) {
  const lonLatExtent = getSceneSelectionExtent(scene, mode)
  return lonLatExtent
    ? transformExtent(lonLatExtent, 'EPSG:4326', 'EPSG:3857')
    : null
}

export function normalizeSceneRenderExtent(
  extent: number[],
  mapSize?: [number, number],
  paddingFactor = 0.12,
) {
  const width = Math.max(1, extent[2] - extent[0])
  const height = Math.max(1, extent[3] - extent[1])
  const padded = [
    extent[0] - width * paddingFactor,
    extent[1] - height * paddingFactor,
    extent[2] + width * paddingFactor,
    extent[3] + height * paddingFactor,
  ] as number[]

  const nextWidth = padded[2] - padded[0]
  const nextHeight = padded[3] - padded[1]
  const aspect = mapSize && mapSize[0] > 0 && mapSize[1] > 0 ? mapSize[0] / mapSize[1] : 16 / 9
  const currentAspect = nextWidth / Math.max(1, nextHeight)

  if (currentAspect < aspect) {
    const targetWidth = nextHeight * aspect
    const delta = (targetWidth - nextWidth) / 2
    return [padded[0] - delta, padded[1], padded[2] + delta, padded[3]]
  }

  const targetHeight = nextWidth / aspect
  const delta = (targetHeight - nextHeight) / 2
  return [padded[0], padded[1] - delta, padded[2], padded[3] + delta]
}

export function setLayerExtentRecursive(layer: unknown, extent?: number[]) {
  if (!layer || typeof layer !== 'object') {
    return
  }

  if ('setExtent' in layer && typeof layer.setExtent === 'function') {
    layer.setExtent(extent)
  }

  if ('getLayers' in layer && typeof layer.getLayers === 'function') {
    const layers = layer.getLayers()?.getArray?.() ?? []
    for (const child of layers) {
      setLayerExtentRecursive(child, extent)
    }
  }
}

export function getSceneFeatureMatcher(scene: SceneSelection) {
  if (scene.focusPreset) {
    const allowedCountries = new Set(scenePresetRegistry[scene.focusPreset].countries ?? [])
    return (feature: Feature<Geometry>) => {
      const countryCode = getFeatureCountryCode(feature)
      return countryCode ? allowedCountries.has(countryCode) : false
    }
  }

  if (scene.activeContinents.length > 0) {
    const allowedCountries = new Set(
      scene.activeContinents.flatMap((id) => scenePresetRegistry[id].countries ?? []),
    )
    const allowedContinents = new Set(
      scene.activeContinents.flatMap((id) => scenePresetRegistry[id].continents ?? []),
    )
    return (feature: Feature<Geometry>) => {
      const countryCode = getFeatureCountryCode(feature)
      if (countryCode && allowedCountries.size > 0 && allowedCountries.has(countryCode)) {
        return true
      }

      const continent = getFeatureContinent(feature)
      return continent ? allowedContinents.has(continent) : false
    }
  }

  return () => true
}

export function getSelectionMercatorExtentFromCountryFeatures(scene: SceneSelection) {
  return getSceneFallbackMercatorExtent(scene, 'render')
}

export function getElementLonLatExtent(element: ScenarioElement): SceneExtent {
  if (element.kind === 'asset' || element.kind === 'text') {
    const [lon, lat] = element.position
    return [lon, lat, lon, lat]
  }

  if (element.kind === 'callout') {
    const lons = [element.position[0], element.anchor[0]]
    const lats = [element.position[1], element.anchor[1]]
    return [
      Math.min(...lons),
      Math.min(...lats),
      Math.max(...lons),
      Math.max(...lats),
    ]
  }

  const coordinates =
    element.kind === 'polygon'
      ? element.coordinates.flat()
      : element.coordinates

  const lons = coordinates.map((coordinate) => coordinate[0])
  const lats = coordinates.map((coordinate) => coordinate[1])

  return [
    Math.min(...lons),
    Math.min(...lats),
    Math.max(...lons),
    Math.max(...lats),
  ]
}

export function doesLonLatExtentIntersect(left: SceneExtent, right: SceneExtent) {
  return !(
    left[0] > right[2] ||
    left[2] < right[0] ||
    left[1] > right[3] ||
    left[3] < right[1]
  )
}

export function isElementVisibleForScene(
  element: ScenarioElement,
  sceneExtent: SceneExtent | null,
) {
  if (!sceneExtent) {
    return true
  }

  return doesLonLatExtentIntersect(getElementLonLatExtent(element), sceneExtent)
}

export function toLonLatPair(value: number[]) {
  const [lon, lat] = toLonLat(value)
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))] satisfies Coordinate
}

export function elementToFeature(element: ScenarioElement) {
  let geometry: Geometry

  switch (element.kind) {
    case 'asset':
    case 'text':
      geometry = new Point(fromLonLat(element.position))
      break
    case 'polyline':
    case 'freehand':
      geometry = new LineString(element.coordinates.map((coord) => fromLonLat(coord)))
      break
    case 'polygon':
      geometry = new Polygon(
        element.coordinates.map((ring) => ring.map((coord) => fromLonLat(coord))),
      )
      break
    case 'callout':
      geometry = new LineString([
        fromLonLat(element.anchor),
        fromLonLat(element.position),
      ])
      break
  }

  const feature = new Feature({ geometry })
  feature.setId(element.id)
  feature.set('elementId', element.id)
  feature.set('kind', element.kind)
  feature.set('element', element)
  return feature
}

export function geometryToElementPatch(feature: Feature<Geometry>, element: ScenarioElement) {
  const geometry = feature.getGeometry()
  if (!geometry) {
    return element
  }

  if (element.kind === 'asset' || element.kind === 'text') {
    const point = geometry as Point
    return {
      ...element,
      position: toLonLatPair(point.getCoordinates()),
    } satisfies ScenarioElement
  }

  if (element.kind === 'polyline' || element.kind === 'freehand') {
    const line = geometry as LineString
    return {
      ...element,
      coordinates: line.getCoordinates().map((coord) => toLonLatPair(coord)),
    } satisfies ScenarioElement
  }

  if (element.kind === 'polygon') {
    const polygon = geometry as Polygon
    return {
      ...element,
      coordinates: polygon
        .getCoordinates()
        .map((ring) => ring.map((coord) => toLonLatPair(coord))),
    } satisfies ScenarioElement
  }

  const line = geometry as LineString
  const coordinates = line.getCoordinates()
  return {
    ...element,
    anchor: toLonLatPair(coordinates[0]),
    position: toLonLatPair(coordinates.at(-1) ?? coordinates[0]),
  } satisfies ScenarioElement
}

export function getArrowRotation(coordinates: number[][]) {
  const from = coordinates.at(-2)
  const to = coordinates.at(-1)
  if (!from || !to) {
    return 0
  }

  return Math.atan2(to[1] - from[1], to[0] - from[0])
}

export function doesMercatorExtentIntersect(left: number[], right: number[]) {
  return extentsIntersect(left, right)
}
