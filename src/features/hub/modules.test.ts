import { describe, expect, it } from 'vitest'

import { createHubModules } from '@/features/hub/modules'

describe('createHubModules', () => {
  it('always exposes scenarios, deck, and coming-soon modules', () => {
    const modules = createHubModules({
      enableLocalHub: false,
      deckLocalUrl: 'https://geodeck.fly.dev',
    })

    expect(modules.map((module) => module.id)).toEqual([
      'scenarios',
      'deck',
      'tv',
      'hungary',
      'notes',
    ])
    expect(modules.find((module) => module.id === 'deck')?.healthCheckUrl).toBeUndefined()
  })

  it('keeps local health checks only for local deck urls when hub mode is enabled', () => {
    const modules = createHubModules({
      enableLocalHub: true,
      deckLocalUrl: 'http://127.0.0.1:3211/',
    })

    expect(modules.map((module) => module.id)).toEqual([
      'scenarios',
      'deck',
      'tv',
      'hungary',
      'notes',
    ])
    expect(modules.find((module) => module.id === 'deck')?.healthCheckUrl).toBe(
      'http://127.0.0.1:3211/api/health',
    )
  })

  it('does not add a health check for production deck urls', () => {
    const modules = createHubModules({
      enableLocalHub: true,
      deckLocalUrl: 'https://geodeck.fly.dev',
    })

    expect(modules.find((module) => module.id === 'deck')?.healthCheckUrl).toBeUndefined()
  })
})
