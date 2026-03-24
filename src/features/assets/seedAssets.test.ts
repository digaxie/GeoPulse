import { describe, expect, it } from 'vitest'

import { seedAssets } from './seedAssets'

describe('seedAssets', () => {
  it('ships flags plus both general and NATO symbol families', () => {
    const flags = seedAssets.filter((asset) => asset.kind === 'flag')

    expect(flags.length).toBeGreaterThan(200)
    expect(seedAssets.find((asset) => asset.id === 'flag-tr')?.label).toContain('Bayra')

    expect(seedAssets.find((asset) => asset.id === 'general-air-drone')?.tags).toContain(
      'general',
    )
    expect(seedAssets.find((asset) => asset.id === 'general-danger-nuclear')?.tags).toContain(
      'general',
    )
    expect(seedAssets.find((asset) => asset.id === 'air-fighter')?.tags).toContain('nato')
    expect(seedAssets.find((asset) => asset.id === 'ground-artillery')?.tags).toContain('nato')
    expect(seedAssets.find((asset) => asset.id === 'danger-fallout')?.tags).toContain('nato')
  })
})
