import { describe, expect, it } from 'vitest'

import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { scenarioDocumentSchema } from '@/features/scenario/model'

describe('scenarioDocumentSchema', () => {
  it('parses the default empty document', () => {
    const document = createDefaultScenarioDocument()
    const parsed = scenarioDocumentSchema.parse(document)

    expect(parsed.basemap.preset).toBe('openfreemap_dark')
    expect(parsed.stylePrefs.uiTheme).toBe('dark')
    expect(parsed.stylePrefs.backgroundPreset).toBe('broadcast_blue')
    expect(parsed.elements.length).toBe(0)
    expect(parsed.labelOptions.showDisputedOverlay).toBe(true)
    expect(parsed.scene.activeContinents).toEqual([])
    expect(parsed.scene.focusPreset).toBeNull()
    expect(parsed.alerts).toEqual({
      enabled: false,
      autoZoomEnabled: true,
      editorSoundEnabled: false,
      editorVolume: 0.55,
      eventSounds: {
        drone: { enabled: true, maxPlaySeconds: null },
        earlyWarning: { enabled: true, maxPlaySeconds: null },
        incidentEnded: { enabled: false, maxPlaySeconds: null },
        rocket: { enabled: true, maxPlaySeconds: null },
      },
      presentationSoundEnabled: false,
      presentationVolume: 0.55,
      bannerAutoDismissSec: 15,
      sharedSelectedAlertId: null,
      sharedFocusedSystemMessageKey: null,
      sharedDrawerSelectionKey: null,
    })
    expect(parsed.missiles).toEqual({
      selectedMissileIds: [],
      activeMissileId: null,
      targetCoord: null,
      launchSiteByMissileId: {},
      playbackSpeedMode: 'fast',
      recentLaunches: [],
    })
    expect(parsed.briefing).toBeUndefined()
  })

  it('fills missing legacy event sound settings at parse time', () => {
    const document = createDefaultScenarioDocument()
    expect(document.alerts).toBeDefined()
    if (!document.alerts) {
      throw new Error('Expected default alerts to be present')
    }
    delete (document.alerts as Partial<typeof document.alerts>).eventSounds

    const parsed = scenarioDocumentSchema.parse(document)
    expect(parsed.alerts).toBeDefined()
    if (!parsed.alerts) {
      throw new Error('Expected alerts to be present')
    }

    expect(parsed.alerts.eventSounds.rocket.enabled).toBe(true)
    expect(parsed.alerts.eventSounds.earlyWarning.enabled).toBe(true)
    expect(parsed.alerts.eventSounds.incidentEnded.enabled).toBe(false)
  })
})
