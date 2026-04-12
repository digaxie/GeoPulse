/// <reference lib="webworker" />

import type { HungaryGeometryRecord } from '../types'
import type { HungarySvgGeometryBundle, HungarySvgGeometryFeature } from './geometryParser'

type GeometryWorkerPayload = {
  version: string
  records: HungaryGeometryRecord[]
}

type RawFeature = {
  id: string
  ring: [number, number][]
}

const VIEWBOX_WIDTH = 1080
const MIN_VIEWBOX_HEIGHT = 620
const VIEWBOX_PADDING = 20
const MAX_RING_POINTS = 180
const SIMPLIFY_TOLERANCE = 0.0038

function parseLatLonPair(value: string) {
  const parts = value.trim().split(/\s+/u)

  if (parts.length < 2) {
    return null
  }

  const latitude = Number(parts[0])
  const longitude = Number(parts[1])

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null
  }

  return [longitude, latitude] as [number, number]
}

function closeRingIfNeeded(ring: [number, number][]) {
  if (ring.length === 0) {
    return ring
  }

  const first = ring[0]
  const last = ring[ring.length - 1]

  if (first[0] === last[0] && first[1] === last[1]) {
    return ring
  }

  return [...ring, first]
}

function downsampleRing(ring: [number, number][], maxPoints: number) {
  if (ring.length <= maxPoints) {
    return ring
  }

  const step = Math.max(1, Math.ceil((ring.length - 1) / (maxPoints - 1)))
  const sampled: [number, number][] = [ring[0]]

  for (let index = step; index < ring.length - 1; index += step) {
    sampled.push(ring[index])
  }

  sampled.push(ring[ring.length - 1])
  return sampled
}

function simplifyRing(ring: [number, number][], tolerance: number): [number, number][] {
  if (ring.length <= 6) {
    return ring
  }

  const [x1, y1] = ring[0]
  const [x2, y2] = ring[ring.length - 1]
  const dx = x2 - x1
  const dy = y2 - y1
  const lineLengthSq = dx * dx + dy * dy

  let maxDistance = 0
  let maxIndex = 0

  for (let index = 1; index < ring.length - 1; index += 1) {
    const [px, py] = ring[index]
    let distance: number

    if (lineLengthSq === 0) {
      distance = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    } else {
      distance = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / Math.sqrt(lineLengthSq)
    }

    if (distance > maxDistance) {
      maxDistance = distance
      maxIndex = index
    }
  }

  if (maxDistance > tolerance) {
    const left = simplifyRing(ring.slice(0, maxIndex + 1), tolerance)
    const right = simplifyRing(ring.slice(maxIndex), tolerance)
    return [...left.slice(0, -1), ...right]
  }

  return [ring[0], ring[ring.length - 1]]
}

function parsePolygonString(value: string) {
  const raw = value
    .split(',')
    .map((segment) => parseLatLonPair(segment))
    .filter((coordinate): coordinate is [number, number] => coordinate !== null)

  const closed = closeRingIfNeeded(raw)
  const sampled = downsampleRing(closed, MAX_RING_POINTS)
  return simplifyRing(sampled, SIMPLIFY_TOLERANCE)
}

function formatCoordinate(value: number) {
  return Math.round(value * 10) / 10
}

function buildPath(
  ring: [number, number][],
  minLongitude: number,
  maxLatitude: number,
  scale: number,
) {
  return ring.reduce((path, [longitude, latitude], index) => {
    const x = formatCoordinate(VIEWBOX_PADDING + (longitude - minLongitude) * scale)
    const y = formatCoordinate(VIEWBOX_PADDING + (maxLatitude - latitude) * scale)
    return `${path}${index === 0 ? 'M' : 'L'}${x} ${y}`
  }, '') + 'Z'
}

function buildSvgGeometryBundle(version: string, records: HungaryGeometryRecord[]): HungarySvgGeometryBundle {
  const rawFeatures: RawFeature[] = []
  let minLongitude = Number.POSITIVE_INFINITY
  let maxLongitude = Number.NEGATIVE_INFINITY
  let minLatitude = Number.POSITIVE_INFINITY
  let maxLatitude = Number.NEGATIVE_INFINITY

  for (const record of records) {
    const ring = parsePolygonString(record.polygon)

    if (ring.length < 4) {
      continue
    }

    rawFeatures.push({
      id: record.id,
      ring,
    })

    for (const [longitude, latitude] of ring) {
      minLongitude = Math.min(minLongitude, longitude)
      maxLongitude = Math.max(maxLongitude, longitude)
      minLatitude = Math.min(minLatitude, latitude)
      maxLatitude = Math.max(maxLatitude, latitude)
    }
  }

  if (rawFeatures.length === 0 || !Number.isFinite(minLongitude) || !Number.isFinite(maxLongitude)) {
    return {
      version,
      width: VIEWBOX_WIDTH,
      height: MIN_VIEWBOX_HEIGHT,
      features: [],
    }
  }

  const rawWidth = Math.max(maxLongitude - minLongitude, 0.01)
  const rawHeight = Math.max(maxLatitude - minLatitude, 0.01)
  const scale = (VIEWBOX_WIDTH - VIEWBOX_PADDING * 2) / rawWidth
  const viewBoxHeight = Math.max(MIN_VIEWBOX_HEIGHT, Math.ceil(rawHeight * scale + VIEWBOX_PADDING * 2))

  const features: HungarySvgGeometryFeature[] = rawFeatures.map((feature) => ({
    id: feature.id,
    path: buildPath(feature.ring, minLongitude, maxLatitude, scale),
  }))

  return {
    version,
    width: VIEWBOX_WIDTH,
    height: viewBoxHeight,
    features,
  }
}

self.onmessage = (event: MessageEvent<GeometryWorkerPayload>) => {
  const bundle = buildSvgGeometryBundle(event.data.version, event.data.records)
  self.postMessage(bundle)
}

export {}
