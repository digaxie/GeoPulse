import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLogger, shouldEmitLog, shouldForwardToSentry } from '@/lib/logger'

describe('logger helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('filters levels by minimum severity', () => {
    expect(shouldEmitLog('error', 'warn')).toBe(true)
    expect(shouldEmitLog('warn', 'warn')).toBe(true)
    expect(shouldEmitLog('info', 'warn')).toBe(false)
  })

  it('only forwards supported levels to sentry outside dev mode', () => {
    expect(shouldForwardToSentry('error', {}, false)).toBe(true)
    expect(shouldForwardToSentry('warn', { report: true }, false)).toBe(true)
    expect(shouldForwardToSentry('warn', {}, false)).toBe(false)
    expect(shouldForwardToSentry('error', {}, true)).toBe(false)
  })

  it('injects the logger component into console context', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const logger = createLogger('ScenarioRuntime')

    logger.info('Mesaj', { action: 'load', scenarioId: 'scenario-1' })

    expect(consoleSpy).toHaveBeenCalled()
    const lastCall = consoleSpy.mock.calls.at(-1) ?? []
    expect(lastCall.at(-1)).toMatchObject({
      component: 'ScenarioRuntime',
      action: 'load',
      scenarioId: 'scenario-1',
    })
  })
})
