import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMissileStore } from '@/features/missiles/useMissileStore'
import { useScenarioStore } from '@/features/scenario/store'
import { createDefaultScenarioDocument } from '@/features/scenario/defaults'

describe('useScenarioStore', () => {
  beforeEach(() => {
    useScenarioStore.getState().reset()
    useMissileStore.getState().resetRuntime()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds asset elements and keeps undo-redo history', () => {
    const store = useScenarioStore.getState()
    store.addAssetElement('flag-tr', [35, 39])

    expect(useScenarioStore.getState().document.elements.at(-1)?.kind).toBe('asset')
    const revisionAfterAdd = useScenarioStore.getState().document.revision

    useScenarioStore.getState().undo()
    expect(useScenarioStore.getState().document.revision).toBeLessThan(revisionAfterAdd)

    useScenarioStore.getState().redo()
    expect(useScenarioStore.getState().document.elements.at(-1)?.kind).toBe('asset')
  })

  it('updates label options without polluting undo stack', () => {
    const historyLength = useScenarioStore.getState().history.length
    useScenarioStore.getState().setLabelOption('showCities', false)

    expect(useScenarioStore.getState().document.labelOptions.showCities).toBe(false)
    expect(useScenarioStore.getState().history.length).toBe(historyLength)
  })

  it('stores reference zoom for new text elements', () => {
    const store = useScenarioStore.getState()
    store.setViewport(
      {
        center: [44, 39],
        zoom: 5.75,
        rotation: 0,
      },
      { persist: false },
    )
    store.addTextElement([44, 39])

    const element = useScenarioStore.getState().document.elements.at(-1)
    expect(element?.kind).toBe('text')
    expect(element?.meta.referenceZoom).toBe('5.75')
  })

  it('can unlock an already locked selected element', () => {
    const store = useScenarioStore.getState()
    store.addAssetElement('flag-tr', [35, 39])

    store.toggleSelectedLock()
    expect(useScenarioStore.getState().document.elements.at(-1)?.locked).toBe(true)

    store.toggleSelectedLock()
    expect(useScenarioStore.getState().document.elements.at(-1)?.locked).toBe(false)
  })

  it('rotates asset elements by updating their rotation value', () => {
    const store = useScenarioStore.getState()
    store.addAssetElement('flag-tr', [35, 39])

    store.updateSelectedElementNumeric('rotation', Math.PI / 2)

    const element = useScenarioStore.getState().document.elements.at(-1)
    expect(element?.kind).toBe('asset')
    expect(element?.rotation).toBeCloseTo(Math.PI / 2)
  })

  it('rotates polygon geometry around its center', () => {
    const store = useScenarioStore.getState()
    store.addPolygonElement([
      [
        [29, 41],
        [31, 41],
        [31, 39],
        [29, 39],
        [29, 41],
      ],
    ])

    const before = useScenarioStore.getState().document.elements.at(-1)
    expect(before?.kind).toBe('polygon')

    store.updateSelectedElementNumeric('rotation', Math.PI / 2)

    const after = useScenarioStore.getState().document.elements.at(-1)
    expect(after?.kind).toBe('polygon')
    expect(after?.rotation).toBeCloseTo(Math.PI / 2)
    if (before?.kind !== 'polygon' || after?.kind !== 'polygon') {
      throw new Error('Polygon bekleniyordu')
    }
    expect(after.coordinates[0]?.[0]?.[0]).not.toBeCloseTo(before.coordinates[0]?.[0]?.[0] ?? 0, 4)
    expect(after.coordinates[0]?.[0]?.[1]).not.toBeCloseTo(before.coordinates[0]?.[0]?.[1] ?? 0, 4)
  })

  it('does not bump revision for transient viewport sync', () => {
    const store = useScenarioStore.getState()
    const revisionBeforeMove = store.document.revision

    store.setViewport(
      {
        center: [12, 48],
        zoom: 4.2,
        rotation: 0.1,
      },
      { persist: false },
    )

    expect(useScenarioStore.getState().document.viewport.center).toEqual([12, 48])
    expect(useScenarioStore.getState().document.revision).toBe(revisionBeforeMove)
  })

  it('treats tool changes as UI state without touching revision history or save state', () => {
    const store = useScenarioStore.getState()
    store.setSaveState('saving')

    const revisionBeforeChange = store.document.revision
    const historyBeforeChange = store.history
    const futureBeforeChange = store.future

    store.setTool('text')

    const nextState = useScenarioStore.getState()
    expect(nextState.document.selectedTool).toBe('text')
    expect(nextState.document.revision).toBe(revisionBeforeChange)
    expect(nextState.history).toBe(historyBeforeChange)
    expect(nextState.future).toBe(futureBeforeChange)
    expect(nextState.saveState).toBe('saving')
  })

  it('normalizes legacy intl locale to tr on initialize', () => {
    const document = createDefaultScenarioDocument()
    document.labelOptions.locale = 'intl'

    useScenarioStore.getState().initialize(
      {
        id: 'scenario-1',
        title: 'Test',
        viewerSlug: 'test',
        document,
        updatedAt: new Date().toISOString(),
        revision: 1,
        lock: null,
      },
      'editor',
    )

    expect(useScenarioStore.getState().document.labelOptions.locale).toBe('tr')
  })

  it('switches between continent and focus scenes exclusively', () => {
    const store = useScenarioStore.getState()

    store.toggleContinentScene('europe')
    store.toggleContinentScene('africa')

    expect(useScenarioStore.getState().document.scene.activeContinents).toEqual([
      'europe',
      'africa',
    ])
    expect(useScenarioStore.getState().document.scene.focusPreset).toBeNull()

    store.setFocusScene('middle_east')

    expect(useScenarioStore.getState().document.scene.activeContinents).toEqual([])
    expect(useScenarioStore.getState().document.scene.focusPreset).toBe('middle_east')

    store.toggleContinentScene('asia')

    expect(useScenarioStore.getState().document.scene.activeContinents).toEqual(['asia'])
    expect(useScenarioStore.getState().document.scene.focusPreset).toBeNull()
  })

  it('creates slides from the current view and activates them', () => {
    const store = useScenarioStore.getState()
    store.addAssetElement('flag-tr', [35, 39])
    store.addTextElement([36, 40])

    store.createSlideFromCurrentView()

    const briefing = useScenarioStore.getState().document.briefing
    expect(briefing?.slides).toHaveLength(1)
    expect(briefing?.activeSlideId).toBe(briefing?.slides[0]?.id)
    expect(briefing?.slides[0]?.visibleElementIds).toHaveLength(2)
  })

  it('adds new elements to the active slide automatically', () => {
    const store = useScenarioStore.getState()
    store.createSlideFromCurrentView()
    const activeSlideId = useScenarioStore.getState().document.briefing?.activeSlideId
    expect(activeSlideId).toBeTruthy()

    store.addAssetElement('flag-tr', [35, 39])
    const elementId = useScenarioStore.getState().document.elements.at(-1)?.id

    expect(elementId).toBeTruthy()
    expect(
      useScenarioStore.getState().document.briefing?.slides[0]?.visibleElementIds.includes(elementId ?? ''),
    ).toBe(true)
  })

  it('mirrors viewport basemap and scene to the active slide without mirroring visible elements', () => {
    const store = useScenarioStore.getState()
    store.addAssetElement('flag-tr', [35, 39])
    store.createSlideFromCurrentView()
    const activeSlideId = useScenarioStore.getState().document.briefing?.activeSlideId
    const originalVisibleIds = [
      ...(useScenarioStore.getState().document.briefing?.slides[0]?.visibleElementIds ?? []),
    ]

    store.setViewport(
      {
        center: [12, 48],
        zoom: 4.2,
        rotation: 0.3,
      },
      { persist: false },
    )
    store.setBasemapPreset('osm_standard')
    store.setFocusScene('middle_east')

    const activeSlide = useScenarioStore.getState().document.briefing?.slides.find((slide) => slide.id === activeSlideId)
    expect(activeSlide?.viewport.center).toEqual([12, 48])
    expect(activeSlide?.basemapPreset).toBe('osm_standard')
    expect(activeSlide?.sceneSelection.focusPreset).toBe('middle_east')
    expect(activeSlide?.visibleElementIds).toEqual(originalVisibleIds)
  })

  it('removes deleted elements from every slide visibility list', () => {
    const store = useScenarioStore.getState()
    const firstId = store.addAssetElement('flag-tr', [35, 39])
    const secondId = store.addAssetElement('flag-ir', [53, 32])
    store.createSlideFromCurrentView()

    store.removeElementById(firstId)

    const visibleIds = useScenarioStore.getState().document.briefing?.slides[0]?.visibleElementIds ?? []
    expect(visibleIds).not.toContain(firstId)
    expect(visibleIds).toContain(secondId)
  })

  it('lets the active slide hide a selected element without mirroring visibility back in', () => {
    const store = useScenarioStore.getState()
    const elementId = store.addAssetElement('flag-tr', [35, 39])
    store.createSlideFromCurrentView()
    const activeSlideId = useScenarioStore.getState().document.briefing?.activeSlideId
    expect(activeSlideId).toBeTruthy()

    store.setElementVisibilityOnSlide(activeSlideId ?? '', elementId, false)

    expect(useScenarioStore.getState().selectedElementId).toBeNull()
    expect(
      useScenarioStore.getState().document.briefing?.slides[0]?.visibleElementIds.includes(elementId),
    ).toBe(false)
  })

  it('queues a launch command for an in-range missile target', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    store.setActiveMissile('iran_shahab_3')
    store.setMissileTarget([44.3661, 33.3152])
    store.queueMissileLaunch('iran_shahab_3')

    const launches = useScenarioStore.getState().document.missiles?.recentLaunches ?? []
    expect(launches).toHaveLength(1)
    expect(launches[0]?.missileId).toBe('iran_shahab_3')
    expect(launches[0]?.launchedAt).toBe(1_700_000_000_000)
    expect(launches[0]?.durationMs).toBeGreaterThan(0)
  })

  it('stores launch site selection per missile and clears it back to default', () => {
    const store = useScenarioStore.getState()

    store.setMissileLaunchSite('iran_shahab_3', [48.2875, 33.4913])
    expect(useScenarioStore.getState().document.missiles?.launchSiteByMissileId).toEqual({
      iran_shahab_3: [48.2875, 33.4913],
    })

    store.setMissileLaunchSite('iran_shahab_3', null)
    expect(useScenarioStore.getState().document.missiles?.launchSiteByMissileId).toEqual({})
  })

  it('uses the selected launch site for single-launch commands', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    store.setMissileLaunchSite('iran_shahab_3', [48.2875, 33.4913])
    store.setMissileTarget([34.7818, 32.0853])
    store.queueMissileLaunch('iran_shahab_3')

    const launches = useScenarioStore.getState().document.missiles?.recentLaunches ?? []
    expect(launches).toHaveLength(1)
    expect(launches[0]?.launchCoord).toEqual([48.2875, 33.4913])
    expect(launches[0]?.durationMs).toBeGreaterThan(0)
  })

  it('stores missile playback speed mode in shared missile state', () => {
    const store = useScenarioStore.getState()

    store.setMissilePlaybackSpeedMode('realistic')

    expect(useScenarioStore.getState().document.missiles?.playbackSpeedMode).toBe('realistic')
  })

  it('stores shared alert feed settings for editor and presentation clients', () => {
    const store = useScenarioStore.getState()

    store.setAlertsEnabled(true)
    store.setAlertAutoZoomEnabled(false)
    store.setEditorAlertSoundEnabled(true)
    store.setEditorAlertVolume(0.8)
    store.setPresentationAlertSoundEnabled(true)
    store.setPresentationAlertVolume(0.35)

    expect(useScenarioStore.getState().document.alerts).toEqual({
      enabled: true,
      autoZoomEnabled: false,
      editorSoundEnabled: true,
      editorVolume: 0.8,
      presentationSoundEnabled: true,
      presentationVolume: 0.35,
      bannerAutoDismissSec: 15,
      sharedSelectedAlertId: null,
      sharedFocusedSystemMessageKey: null,
    })
  })

  it('blocks launch commands when the target is out of range', () => {
    const store = useScenarioStore.getState()
    store.setActiveMissile('iran_fateh_110')
    store.setMissileTarget([46.6753, 24.7136])

    store.queueMissileLaunch('iran_fateh_110')

    expect(useScenarioStore.getState().document.missiles?.recentLaunches).toEqual([])
  })

  it('queues salvo launches with 200ms offsets and caps history at twenty commands', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    store.setMissileTarget([44.3661, 33.3152])
    for (let index = 0; index < 7; index += 1) {
      store.queueMissileSalvo([
        'iran_shahab_3',
        'iran_ghadr',
        'iran_emad',
      ])
    }

    const launches = useScenarioStore.getState().document.missiles?.recentLaunches ?? []
    expect(launches).toHaveLength(20)
    const lastSalvo = launches.slice(-3)
    expect(lastSalvo[0]?.launchedAt).toBe(1_700_000_000_000)
    expect(lastSalvo[1]?.launchedAt).toBe(1_700_000_000_200)
    expect(lastSalvo[2]?.launchedAt).toBe(1_700_000_000_400)
    expect(lastSalvo.every((launch) => launch.durationMs > 0)).toBe(true)
  })

  it('uses each missile launch site selection independently during salvo launch', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    store.setMissileLaunchSite('iran_shahab_3', [48.2875, 33.4913])
    store.setMissileLaunchSite('iran_ghadr', [47.2222, 34.3958])
    store.setMissileTarget([34.7818, 32.0853])

    store.queueMissileSalvo(['iran_shahab_3', 'iran_ghadr'])

    const launches = useScenarioStore.getState().document.missiles?.recentLaunches ?? []
    expect(launches).toHaveLength(2)
    expect(launches[0]?.launchCoord).toEqual([48.2875, 33.4913])
    expect(launches[1]?.launchCoord).toEqual([47.2222, 34.3958])
    expect(launches[1]?.launchedAt).toBe(1_700_000_000_200)
  })

  it('snapshots launch duration at launch time so later mode changes do not retime existing commands', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)

    store.setMissileTarget([34.7818, 32.0853])
    store.setMissilePlaybackSpeedMode('realistic')
    store.queueMissileLaunch('iran_khorramshahr')
    const realisticDuration = useScenarioStore.getState().document.missiles?.recentLaunches[0]?.durationMs ?? 0

    store.setMissilePlaybackSpeedMode('fast')
    store.queueMissileLaunch('iran_khorramshahr')
    const launches = useScenarioStore.getState().document.missiles?.recentLaunches ?? []

    expect(launches[0]?.durationMs).toBe(realisticDuration)
    expect(launches[1]?.durationMs).toBeLessThan(realisticDuration)
  })

  it('snapshots successful interceptor outcome and probability on launch', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    vi.spyOn(Math, 'random').mockReturnValue(0.05)

    store.setMissileTarget([34.7818, 32.0853])
    store.queueMissileLaunch('iran_khorramshahr')
    const hostileLaunch = useScenarioStore.getState().document.missiles?.recentLaunches[0]
    if (!hostileLaunch) {
      throw new Error('Hostile launch bekleniyordu')
    }

    useMissileStore.getState().setRuntimeFlights([
      {
        id: hostileLaunch.id,
        missileId: hostileLaunch.missileId,
        launchCoord: hostileLaunch.launchCoord,
        targetCoord: hostileLaunch.targetCoord,
        startTime: hostileLaunch.launchedAt,
        duration: hostileLaunch.durationMs,
        phase: 'midcourse',
        progress: 0.3,
        interceptOutcome: null,
        interceptProbability: null,
      },
    ])

    store.queueMissileLaunch('israel_arrow_3', hostileLaunch.id)

    const interceptorLaunch = useScenarioStore.getState().document.missiles?.recentLaunches.at(-1)
    expect(interceptorLaunch?.missileId).toBe('israel_arrow_3')
    expect(interceptorLaunch?.interceptProbability).toBe(0.9)
    expect(interceptorLaunch?.interceptOutcome).toBe('success')
    expect(interceptorLaunch?.targetCoord).not.toEqual(hostileLaunch.targetCoord)
    expect(interceptorLaunch?.durationMs ?? 0).toBeGreaterThanOrEqual(800)
  })

  it('snapshots failed interceptor outcome and keeps it deterministic', () => {
    const store = useScenarioStore.getState()
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    vi.spyOn(Math, 'random').mockReturnValue(0.99)

    store.setMissileTarget([34.7818, 32.0853])
    store.queueMissileLaunch('iran_khorramshahr')
    const hostileLaunch = useScenarioStore.getState().document.missiles?.recentLaunches[0]
    if (!hostileLaunch) {
      throw new Error('Hostile launch bekleniyordu')
    }

    useMissileStore.getState().setRuntimeFlights([
      {
        id: hostileLaunch.id,
        missileId: hostileLaunch.missileId,
        launchCoord: hostileLaunch.launchCoord,
        targetCoord: hostileLaunch.targetCoord,
        startTime: hostileLaunch.launchedAt,
        duration: hostileLaunch.durationMs,
        phase: 'midcourse',
        progress: 0.45,
        interceptOutcome: null,
        interceptProbability: null,
      },
    ])

    store.queueMissileLaunch('israel_arrow_2', hostileLaunch.id)

    const interceptorLaunch = useScenarioStore.getState().document.missiles?.recentLaunches.at(-1)
    expect(interceptorLaunch?.missileId).toBe('israel_arrow_2')
    expect(interceptorLaunch?.interceptProbability).toBe(0.82)
    expect(interceptorLaunch?.interceptOutcome).toBe('failure')
  })
})
