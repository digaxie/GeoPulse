import { describe, expect, it } from 'vitest'

import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { scenarioDocumentSchema } from '@/features/scenario/model'

describe('scenarioDocumentSchema', () => {
  it('parses the default empty document', () => {
    const document = createDefaultScenarioDocument()
    const parsed = scenarioDocumentSchema.parse(document)

    expect(parsed.basemap.preset).toBe('openfreemap_liberty')
    expect(parsed.elements.length).toBe(0)
    expect(parsed.labelOptions.showDisputedOverlay).toBe(true)
    expect(parsed.scene.activeContinents).toEqual([])
    expect(parsed.scene.focusPreset).toBeNull()
    expect(parsed.stylePrefs.performanceMode).toBe(false)
    expect(parsed.alerts).toEqual({
      enabled: false,
      autoZoomEnabled: true,
      editorSoundEnabled: false,
      editorVolume: 0.55,
      presentationSoundEnabled: false,
      presentationVolume: 0.55,
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
})
