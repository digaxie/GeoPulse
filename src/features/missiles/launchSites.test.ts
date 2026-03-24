import { describe, expect, it } from 'vitest'

import { getMissileById } from '@/features/missiles/missileData'
import {
  areCoordsEqual,
  getLaunchSiteOptions,
  resolveMissileLaunchCoord,
} from '@/features/missiles/launchSites'

describe('launchSites helpers', () => {
  it('treats equal numeric tuples as the same coordinate even when references differ', () => {
    expect(areCoordsEqual([51.67, 32.65], [51.67, 32.65])).toBe(true)
  })

  it('dedupes launch site options that repeat the default coordinate', () => {
    const definition = getMissileById('iran_shahab_3')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    const options = getLaunchSiteOptions({
      ...definition,
      knownLaunchSites: [
        { name: 'Default copy', coord: [51.67, 32.65], type: 'fixed' },
        { name: 'Khorramabad', coord: [48.2875, 33.4913], type: 'underground' },
      ],
    })

    expect(options.map((option) => option.label)).toEqual(['Default', 'Khorramabad'])
  })

  it('falls back to the default launch coordinate when stored site is invalid', () => {
    const definition = getMissileById('iran_shahab_3')
    if (!definition) {
      throw new Error('Missile definition bekleniyordu')
    }

    expect(
      resolveMissileLaunchCoord(definition, {
        [definition.id]: [0, 0],
      }),
    ).toEqual(definition.defaultLaunchCoord)
  })
})
