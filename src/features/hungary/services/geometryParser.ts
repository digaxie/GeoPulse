import Feature from 'ol/Feature'
import Polygon from 'ol/geom/Polygon'
import { fromLonLat } from 'ol/proj'

import type { HungaryGeometryRecord } from '../types'

type HungaryGeometrySeed = {
  id: string
  center: [number, number] | null
  ring: [number, number][]
}

const STORAGE_PREFIX = 'hungary-geometry:'
const seedCache = new Map<string, HungaryGeometrySeed[]>()
const featureCache = new Map<string, Feature<Polygon>[]>()

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

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

function parsePolygonString(value: string) {
  return closeRingIfNeeded(
    value
      .split(',')
      .map((segment) => parseLatLonPair(segment))
      .filter((coordinate): coordinate is [number, number] => coordinate !== null),
  )
}

function loadSeedsFromStorage(version: string) {
  if (!isBrowser()) {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(`${STORAGE_PREFIX}${version}`)

    if (!rawValue) {
      return null
    }

    const parsed = JSON.parse(rawValue) as HungaryGeometrySeed[]

    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function saveSeedsToStorage(version: string, seeds: HungaryGeometrySeed[]) {
  if (!isBrowser()) {
    return
  }

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${version}`, JSON.stringify(seeds))
  } catch {
    // Best effort only.
  }
}

function buildGeometrySeeds(version: string, records: HungaryGeometryRecord[]) {
  const cachedSeeds = seedCache.get(version)

  if (cachedSeeds) {
    return cachedSeeds
  }

  const storageSeeds = loadSeedsFromStorage(version)
  if (storageSeeds) {
    seedCache.set(version, storageSeeds)
    return storageSeeds
  }

  const seeds = records
    .map((record) => ({
      id: record.id,
      center: record.center,
      ring: parsePolygonString(record.polygon),
    }))
    .filter((seed) => seed.ring.length >= 4)

  seedCache.set(version, seeds)
  saveSeedsToStorage(version, seeds)
  return seeds
}

export function buildHungaryGeometryFeatures(
  version: string,
  records: HungaryGeometryRecord[],
): Feature<Polygon>[] {
  const cachedFeatures = featureCache.get(version)

  if (cachedFeatures) {
    return cachedFeatures
  }

  const seeds = buildGeometrySeeds(version, records)
  const features = seeds.map((seed) => {
    const feature = new Feature({
      geometry: new Polygon([
        seed.ring.map((coordinate) => fromLonLat(coordinate)),
      ]),
      constituencyId: seed.id,
      centerLonLat: seed.center,
    })

    return feature
  })

  featureCache.set(version, features)
  return features
}
