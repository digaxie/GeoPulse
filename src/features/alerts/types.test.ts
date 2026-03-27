import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SCENARIO_ALERT_SETTINGS,
  formatAlertOccurredAtTr,
  formatAlertShelterInstruction,
  getAlertAudioSettingsForRole,
  getAlertSirenThrottleWindowMs,
  getAlertTypeLabel,
} from '@/features/alerts/types'

describe('alert presentation helpers', () => {
  it('formats 0-second countdown as an immediate shelter instruction', () => {
    expect(formatAlertShelterInstruction(0)).toBe('Hemen sığınağa gidin!')
  })

  it('formats positive countdown values as a timed shelter instruction', () => {
    expect(formatAlertShelterInstruction(15)).toBe('15 sn içinde sığınağa gidin!')
  })

  it('formats occurredAtMs in Turkey time', () => {
    expect(formatAlertOccurredAtTr({ occurredAtMs: Date.parse('2026-03-22T04:19:23.000Z') })).toBe(
      '22.03.2026 07:19:23',
    )
  })

  it('uses Turkish labels for alert types', () => {
    expect(getAlertTypeLabel(2)).toBe('İHA')
    expect(getAlertTypeLabel(1)).toBe('Roket')
  })

  it('picks role-specific audio settings', () => {
    expect(getAlertAudioSettingsForRole(DEFAULT_SCENARIO_ALERT_SETTINGS, 'editor')).toEqual({
      soundEnabled: false,
      volume: 0.55,
    })

    expect(
      getAlertAudioSettingsForRole(
        {
          enabled: true,
          autoZoomEnabled: true,
          editorSoundEnabled: true,
          editorVolume: 0.8,
          presentationSoundEnabled: false,
          presentationVolume: 0.3,
          bannerAutoDismissSec: 15,
          sharedSelectedAlertId: null,
          sharedFocusedSystemMessageKey: null,
          sharedDrawerSelectionKey: null,
        },
        'presentation',
      ),
    ).toEqual({
      soundEnabled: false,
      volume: 0.3,
    })
  })

  it('uses the longer of siren duration and 1 second as the throttle window', () => {
    expect(getAlertSirenThrottleWindowMs(800)).toBe(1000)
    expect(getAlertSirenThrottleWindowMs(1800)).toBe(1800)
    expect(getAlertSirenThrottleWindowMs(null)).toBe(1000)
  })
})
