import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import { fromLonLat } from 'ol/proj'

import type { HungaryGeometryRecord } from '../types'

type HungaryGeometrySeed = {
  id: string
  center: [number, number] | null
  ring: [number, number][]
}

const seedCache = new Map<string, HungaryGeometrySeed[]>()
const featureCache = new Map<string, Feature<Polygon>[]>()
const MAX_RING_POINTS = 1200
const RECORDS_PER_SLICE = 4

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

/**
 * Ramer–Douglas–Peucker line simplification.
 * Tolerance is in degrees (~0.001° ≈ 100 m — fine for a country-level map).
 */
function simplifyRing(ring: [number, number][], tolerance: number): [number, number][] {
  if (ring.length <= 6) return ring

  const [x1, y1] = ring[0]
  const [x2, y2] = ring[ring.length - 1]
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy

  let maxDist = 0
  let maxIdx = 0

  for (let i = 1; i < ring.length - 1; i++) {
    const [px, py] = ring[i]
    let dist: number
    if (lenSq === 0) {
      dist = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    } else {
      dist = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1) / Math.sqrt(lenSq)
    }
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyRing(ring.slice(0, maxIdx + 1), tolerance)
    const right = simplifyRing(ring.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }

  return [ring[0], ring[ring.length - 1]]
}

const SIMPLIFY_TOLERANCE = 0.0012

function parsePolygonString(value: string) {
  const raw = value
    .split(',')
    .map((segment) => parseLatLonPair(segment))
    .filter((coordinate): coordinate is [number, number] => coordinate !== null)

  const closed = closeRingIfNeeded(raw)
  const sampled = downsampleRing(closed, MAX_RING_POINTS)
  return simplifyRing(sampled, SIMPLIFY_TOLERANCE)
}

function buildGeometrySeeds(version: string, records: HungaryGeometryRecord[]) {
  const cachedSeeds = seedCache.get(version)

  if (cachedSeeds) {
    return cachedSeeds
  }

  const seeds = records
    .map((record) => ({
      id: record.id,
      center: record.center,
      ring: parsePolygonString(record.polygon),
    }))
    .filter((seed) => seed.ring.length >= 4)

  seedCache.set(version, seeds)
  return seeds
}

function createFeatureFromSeed(seed: HungaryGeometrySeed) {
  return new Feature({
    geometry: new Polygon([
      seed.ring.map((coordinate) => fromLonLat(coordinate)),
    ]),
    constituencyId: seed.id,
    centerLonLat: seed.center,
  })
}

function yieldToMainThread() {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, 0)
  })
}

export function getCachedHungaryGeometryFeatures(version: string) {
  return featureCache.get(version) ?? null
}

export async function prepareHungaryGeometryFeatures(
  version: string,
  records: HungaryGeometryRecord[],
  options: { signal?: AbortSignal } = {},
): Promise<Feature<Polygon>[]> {
  const cachedFeatures = featureCache.get(version)

  if (cachedFeatures) {
    return cachedFeatures
  }

  let seeds = seedCache.get(version) ?? null

  if (!seeds) {
    const nextSeeds: HungaryGeometrySeed[] = []

    for (let index = 0; index < records.length; index += 1) {
      if (options.signal?.aborted) {
        throw new DOMException('Geometry preparation aborted', 'AbortError')
      }

      const record = records[index]
      const ring = parsePolygonString(record.polygon)
      if (ring.length >= 4) {
        nextSeeds.push({
          id: record.id,
          center: record.center,
          ring,
        })
      }

      if ((index + 1) % RECORDS_PER_SLICE === 0) {
        await yieldToMainThread()
      }
    }

    seeds = nextSeeds
    seedCache.set(version, seeds)
  }

  const features: Feature<Polygon>[] = []

  for (let index = 0; index < seeds.length; index += 1) {
    if (options.signal?.aborted) {
      throw new DOMException('Geometry preparation aborted', 'AbortError')
    }

    features.push(createFeatureFromSeed(seeds[index]))

    if ((index + 1) % RECORDS_PER_SLICE === 0) {
      await yieldToMainThread()
    }
  }

  featureCache.set(version, features)
  return features
}
