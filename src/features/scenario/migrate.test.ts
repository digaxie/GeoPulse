import { describe, expect, it } from 'vitest'

import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import { migrateScenarioDocument } from '@/features/scenario/migrate'

describe('migrateScenarioDocument', () => {
  it('accepts legacy documents without briefing', () => {
    const legacyDocument = createDefaultScenarioDocument()
    delete (legacyDocument as { briefing?: unknown }).briefing

    const migrated = migrateScenarioDocument(legacyDocument)

    expect(migrated.briefing).toBeUndefined()
    expect(migrated.elements).toEqual([])
  })

  it('keeps an empty slides array valid', () => {
    const document = createDefaultScenarioDocument()
    const migrated = migrateScenarioDocument({
      ...document,
      briefing: {
        slides: [],
        activeSlideId: null,
      },
    })

    expect(migrated.briefing).toEqual({
      slides: [],
      activeSlideId: null,
    })
  })

  it('drops invalid activeSlideId values when there are no slides', () => {
    const document = createDefaultScenarioDocument()
    const migrated = migrateScenarioDocument({
      ...document,
      briefing: {
        slides: [],
        activeSlideId: 'slide-1',
      },
    })

    expect(migrated.briefing?.activeSlideId).toBeNull()
  })

  it('cleans stale visibleElementIds from slides', () => {
    const document = createDefaultScenarioDocument()
    const migrated = migrateScenarioDocument({
      ...document,
      elements: [
        {
          id: 'asset-1',
          kind: 'asset',
          position: [35, 39],
          assetId: 'flag-tr',
          label: '',
          size: 48,
          rotation: 0,
          scale: 1,
          zIndex: 1,
          locked: false,
          meta: {},
          style: {
            strokeColor: '#12213f',
            fillColor: 'rgba(18, 33, 63, 0.12)',
            textColor: '#12213f',
            lineWidth: 3,
            opacity: 1,
            lineDash: [],
            endArrow: false,
          },
        },
      ],
      briefing: {
        slides: [
          {
            id: 'slide-1',
            title: 'Bir',
            notes: '',
            viewport: document.viewport,
            basemapPreset: document.basemap.preset,
            sceneSelection: document.scene,
            visibleElementIds: ['asset-1', 'missing-1', 'missing-2'],
          },
        ],
        activeSlideId: 'slide-1',
      },
    })

    expect(migrated.briefing?.slides[0]?.visibleElementIds).toEqual(['asset-1'])
  })

  it('is idempotent', () => {
    const document = createDefaultScenarioDocument()
    const once = migrateScenarioDocument({
      ...document,
      briefing: {
        slides: [],
        activeSlideId: 'missing-slide',
      },
    })
    const twice = migrateScenarioDocument(once)

    expect(twice).toEqual(once)
  })

  it('fills missing missile state when the document does not have missiles', () => {
    const document = createDefaultScenarioDocument()
    delete (document as { missiles?: unknown }).missiles

    const migrated = migrateScenarioDocument(document)

    expect(migrated.missiles).toEqual({
      selectedMissileIds: [],
      activeMissileId: null,
      targetCoord: null,
      launchSiteByMissileId: {},
      playbackSpeedMode: 'fast',
      recentLaunches: [],
    })
  })

  it('fills missing alert settings when the document does not have alerts', () => {
    const document = createDefaultScenarioDocument()
    delete (document as { alerts?: unknown }).alerts

    const migrated = migrateScenarioDocument(document)

    expect(migrated.alerts).toEqual({
      enabled: false,
      autoZoomEnabled: true,
      editorSoundEnabled: false,
      editorVolume: 0.55,
      eventSounds: {
        drone: { enabled: true, mode: 'long' },
        earlyWarning: { enabled: true, mode: 'long' },
        incidentEnded: { enabled: false, mode: 'long' },
        rocket: { enabled: true, mode: 'long' },
      },
      presentationSoundEnabled: false,
      presentationVolume: 0.55,
      bannerAutoDismissSec: 15,
      sharedSelectedAlertId: null,
      sharedFocusedSystemMessageKey: null,
      sharedDrawerSelectionKey: null,
    })
  })

  it('defaults missing uiTheme to light for legacy documents while preserving basemap theme', () => {
    const document = createDefaultScenarioDocument()
    const legacyDocument = {
      ...document,
      stylePrefs: {
        ...document.stylePrefs,
        backgroundPreset: 'paper_light' as const,
      },
    }

    delete (legacyDocument.stylePrefs as { uiTheme?: unknown }).uiTheme

    const migrated = migrateScenarioDocument(legacyDocument)

    expect(migrated.stylePrefs.uiTheme).toBe('light')
    expect(migrated.stylePrefs.backgroundPreset).toBe('paper_light')
  })

  it('upgrades legacy alert audio settings into editor and presentation channels', () => {
    const document = createDefaultScenarioDocument()
    const migrated = migrateScenarioDocument({
      ...document,
      alerts: {
        enabled: true,
        soundEnabled: true,
        volume: 0.8,
      },
    })

    expect(migrated.alerts).toEqual({
      enabled: true,
      autoZoomEnabled: true,
      editorSoundEnabled: true,
      editorVolume: 0.8,
      eventSounds: {
        drone: { enabled: true, mode: 'long' },
        earlyWarning: { enabled: true, mode: 'long' },
        incidentEnded: { enabled: false, mode: 'long' },
        rocket: { enabled: true, mode: 'long' },
      },
      presentationSoundEnabled: true,
      presentationVolume: 0.8,
      bannerAutoDismissSec: 15,
      sharedSelectedAlertId: null,
      sharedFocusedSystemMessageKey: null,
      sharedDrawerSelectionKey: null,
    })
  })

  it('drops unknown missile ids and trims legacy launch history', () => {
    const document = createDefaultScenarioDocument()
    const migrated = migrateScenarioDocument({
      ...document,
      missiles: {
        selectedMissileIds: ['iran_fateh_110', 'unknown-id', 'iran_fateh_110'],
        activeMissileId: 'missing-active',
        targetCoord: [34.7818, 32.0853],
        playbackSpeedMode: 'realistic',
        recentLaunches: Array.from({ length: 25 }, (_, index) => ({
          id: `launch-${index}`,
          missileId: index % 2 === 0 ? 'iran_fateh_110' : 'missing-id',
          launchCoord: [51.67, 32.65],
          targetCoord: [34.7818, 32.0853],
          launchedAt: 1_700_000_000_000 + index,
          durationMs: 0,
          salvoGroupId: null,
          interceptLaunchId: null,
        })),
      },
    })

    expect(migrated.missiles?.selectedMissileIds).toEqual(['iran_fateh_110'])
    expect(migrated.missiles?.activeMissileId).toBeNull()
    expect(migrated.missiles?.launchSiteByMissileId).toEqual({})
    expect(migrated.missiles?.playbackSpeedMode).toBe('realistic')
    expect(migrated.missiles?.recentLaunches).toHaveLength(13)
    expect(migrated.missiles?.recentLaunches.every((launch) => launch.missileId === 'iran_fateh_110')).toBe(true)
    expect(migrated.missiles?.recentLaunches.every((launch) => launch.durationMs > 0)).toBe(true)
  })

  it('drops invalid launch site coordinates while keeping valid missile site selections', () => {
    const document = createDefaultScenarioDocument()
    const migrated = migrateScenarioDocument({
      ...document,
      missiles: {
        selectedMissileIds: ['iran_shahab_3'],
        activeMissileId: 'iran_shahab_3',
        targetCoord: null,
        launchSiteByMissileId: {
          iran_shahab_3: [48.2875, 33.4913],
          iran_ghadr: [0, 0],
          missing_id: [34.9194, 31.7386],
        },
        playbackSpeedMode: 'fast',
        recentLaunches: [],
      },
    })

    expect(migrated.missiles?.launchSiteByMissileId).toEqual({
      iran_shahab_3: [48.2875, 33.4913],
    })
  })
})
