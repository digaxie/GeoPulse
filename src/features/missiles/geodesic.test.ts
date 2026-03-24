import { describe, expect, it } from 'vitest'

import {
  generateArcPoints,
  getAltitudeProfile,
  greatCircleInterpolation,
  haversineDistance,
} from '@/features/missiles/geodesic'

describe('missile geodesic helpers', () => {
  it('calculates Tehran to Tel Aviv at roughly 1575 km', () => {
    const distanceKm = haversineDistance([51.389, 35.6892], [34.7818, 32.0853]) / 1000

    expect(distanceKm).toBeGreaterThan(1550)
    expect(distanceKm).toBeLessThan(1600)
  })

  it('keeps arc endpoints stable', () => {
    const start: [number, number] = [51.389, 35.6892]
    const end: [number, number] = [34.7818, 32.0853]
    const points = generateArcPoints(start, end, 12)

    expect(points[0]).toEqual(start)
    expect(points.at(-1)).toEqual(end)
    expect(greatCircleInterpolation(start, end, 0.5)).toHaveLength(2)
  })

  it('returns distinct altitude profiles per flight type', () => {
    const ballistic = getAltitudeProfile(0.5, 'ballistic')
    const cruise = getAltitudeProfile(0.5, 'cruise')
    const hypersonic = getAltitudeProfile(0.5, 'hypersonic')
    const interceptor = getAltitudeProfile(0.5, 'interceptor')

    expect(ballistic).toBeGreaterThan(cruise)
    expect(hypersonic).not.toBeCloseTo(ballistic, 3)
    expect(interceptor).toBeGreaterThan(cruise)
  })
})
