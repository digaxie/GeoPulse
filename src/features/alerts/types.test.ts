import { describe, expect, it } from 'vitest'

import {
  DEFAULT_SCENARIO_ALERT_SETTINGS,
  isAlertWithinRetention,
  isSystemMessageWithinRetention,
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
          eventSounds: {
            rocket: { enabled: true, mode: 'long' },
            drone: { enabled: true, mode: 'long' },
            earlyWarning: { enabled: true, mode: 'long' },
            incidentEnded: { enabled: false, mode: 'long' },
          },
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

  it('keeps alerts active while they remain inside the retention window', () => {
    const now = Date.parse('2026-03-28T12:00:00.000Z')

    expect(
      isAlertWithinRetention(
        {
          occurredAtMs: now - 90_000,
        },
        120_000,
        now,
      ),
    ).toBe(true)

    expect(
      isAlertWithinRetention(
        {
          occurredAtMs: now - 121_000,
        },
        120_000,
        now,
      ),
    ).toBe(false)
  })

  it('keeps streamable system messages active only while they remain inside retention', () => {
    const now = Date.parse('2026-03-28T12:00:00.000Z')

    expect(
      isSystemMessageWithinRetention(
        {
          type: 'early_warning',
          receivedAtMs: now - 60_000,
          citiesEnriched: [
            {
              en: 'Haifa',
              he: '',
              lat: 32.794,
              lng: 34.9896,
              zone_en: 'North',
              countdown: 0,
            },
          ],
        },
        120_000,
        now,
      ),
    ).toBe(true)

    expect(
      isSystemMessageWithinRetention(
        {
          type: 'early_warning',
          receivedAtMs: now - 121_000,
          citiesEnriched: [
            {
              en: 'Haifa',
              he: '',
              lat: 32.794,
              lng: 34.9896,
              zone_en: 'North',
              countdown: 0,
            },
          ],
        },
        120_000,
        now,
      ),
    ).toBe(false)

    expect(
      isSystemMessageWithinRetention(
        {
          type: 'unknown',
          receivedAtMs: now - 60_000,
          citiesEnriched: [
            {
              en: 'Haifa',
              he: '',
              lat: 32.794,
              lng: 34.9896,
              zone_en: 'North',
              countdown: 0,
            },
          ],
        },
        120_000,
        now,
      ),
    ).toBe(false)
  })
})
