import { describe, expect, it } from 'vitest'

import {
  formatEstimatedFlightMinutes,
  getEstimatedFlightDurationMs,
  getHostileInterceptSnapshot,
  getLaunchCommandDurationMs,
  isLaunchCommandStale,
} from '@/features/missiles/flightAnimation'
import { getMissileById } from '@/features/missiles/missileData'

describe('flightAnimation timing helpers', () => {
  it('keeps fast mode on short fixed durations', () => {
    const definition = getMissileById('iran_shahab_3')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    const durationMs = getEstimatedFlightDurationMs(
      definition,
      definition.defaultLaunchCoord,
      [34.7818, 32.0853],
      'fast',
    )

    expect(durationMs).toBe(3800)
    expect(formatEstimatedFlightMinutes(durationMs)).toBe('~0 dk')
  })

  it('computes realistic ballistic durations from range and Mach', () => {
    const definition = getMissileById('iran_shahab_3')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    const durationMs = getEstimatedFlightDurationMs(
      definition,
      definition.defaultLaunchCoord,
      [34.7818, 32.0853],
      'realistic',
    )

    expect(durationMs).toBeGreaterThan(10 * 60 * 1000)
    expect(durationMs).toBeLessThan(30 * 60 * 1000)
  })

  it('computes realistic cruise durations with the cruise speed factor', () => {
    const definition = getMissileById('iran_hoveyzeh')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    const durationMs = getEstimatedFlightDurationMs(
      definition,
      definition.defaultLaunchCoord,
      [34.7818, 32.0853],
      'realistic',
    )

    expect(durationMs).toBeGreaterThan(60 * 60 * 1000)
    expect(durationMs).toBeLessThan(120 * 60 * 1000)
  })

  it('uses fallback Mach values when the missile definition does not provide one', () => {
    const definition = getMissileById('israel_jericho_4')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    const durationMs = getEstimatedFlightDurationMs(
      definition,
      definition.defaultLaunchCoord,
      [51.389, 35.6892],
      'realistic',
    )

    expect(durationMs).toBeGreaterThan(0)
  })

  it('finds a feasible mid-air intercept snapshot for an in-range hostile flight', () => {
    const interceptor = getMissileById('israel_arrow_3')
    if (!interceptor) {
      throw new Error('Interceptor definition bekleniyordu')
    }

    const hostileStartTime = 1_700_000_000_000
    const hostileDuration = 16 * 60 * 1000
    const launchedAt = hostileStartTime + hostileDuration * 0.25
    const snapshot = getHostileInterceptSnapshot(
      {
        launchCoord: [51.67, 32.65],
        targetCoord: [34.7818, 32.0853],
        progress: 0.25,
        duration: hostileDuration,
        startTime: hostileStartTime,
      },
      interceptor,
      interceptor.defaultLaunchCoord,
      launchedAt,
      'realistic',
    )

    expect(snapshot).not.toBeNull()
    expect(snapshot?.remainingToInterceptMs).toBeGreaterThan(0)
    expect(snapshot?.interceptorTravelMs ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      snapshot?.remainingToInterceptMs ?? 0,
    )
  })

  it('treats command duration snapshot as the source of truth for stale detection', () => {
    const definition = getMissileById('iran_shahab_3')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    const command = {
      id: 'launch-1',
      missileId: definition.id,
      launchCoord: definition.defaultLaunchCoord,
      targetCoord: [34.7818, 32.0853] as [number, number],
      launchedAt: 1_700_000_000_000,
      durationMs: 120_000,
      salvoGroupId: null,
      interceptLaunchId: null,
      interceptOutcome: null,
      interceptProbability: null,
    }

    expect(getLaunchCommandDurationMs(command, definition)).toBe(120_000)
    expect(isLaunchCommandStale(command, definition, 1_700_000_100_000)).toBe(false)
    expect(isLaunchCommandStale(command, definition, 1_700_000_123_000)).toBe(true)
  })
})
