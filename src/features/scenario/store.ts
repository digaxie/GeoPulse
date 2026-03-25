import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { fromLonLat, toLonLat } from 'ol/proj'

import { DEFAULT_SCENARIO_ALERT_SETTINGS } from '@/features/alerts/types'
import { backfillUploadedAssetSnapshots } from '@/features/assets/assetSnapshots'
import { getEstimatedFlightDurationMs, getHostileInterceptSnapshot } from '@/features/missiles/flightAnimation'
import { haversineDistance } from '@/features/missiles/geodesic'
import { areCoordsEqual, isValidLaunchSiteCoord, resolveMissileLaunchCoord } from '@/features/missiles/launchSites'
import { getMissileById } from '@/features/missiles/missileData'
import { EMPTY_SCENARIO_MISSILES_STATE } from '@/features/missiles/types'
import { useMissileStore } from '@/features/missiles/useMissileStore'
import { createDefaultScenarioDocument } from '@/features/scenario/defaults'
import {
  addElementToActiveSlide,
  createSlideFromCurrentView as createBriefingSlideFromCurrentView,
  deleteSlide as deleteBriefingSlide,
  duplicateSlide as duplicateBriefingSlide,
  getVisibleElementIdsForActiveSlide,
  moveSlideDown as moveBriefingSlideDown,
  moveSlideUp as moveBriefingSlideUp,
  removeElementIdsFromSlides,
  renameSlide as renameBriefingSlide,
  setActiveSlide as setBriefingActiveSlide,
  setElementVisibilityOnSlide as setBriefingElementVisibilityOnSlide,
  syncActiveSlideViewState,
  updateSlideNotes as updateBriefingSlideNotes,
} from '@/features/scenario/briefing'
import { migrateScenarioDocument } from '@/features/scenario/migrate'
import {
  bumpRevision,
  cloneScenarioDocument,
  type Coordinate,
  type MissileLaunchCommand,
  type ScenarioDocument,
  type ScenarioElement,
  type ScenarioMissilesState,
  type ScenarioTool,
  type UploadedAssetSnapshot,
} from '@/features/scenario/model'
import type { ContinentSceneId, FocusSceneId } from '@/features/scenario/scenes'
import type { AssetDefinition, ScenarioDetailRecord, ScenarioLock } from '@/lib/backend/types'
import { createLogger } from '@/lib/logger'
import { clamp } from '@/lib/utils'

const log = createLogger('ScenarioStore')

type EditorAccess = 'viewer' | 'editor' | 'locked'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

type MutationOptions = {
  trackHistory?: boolean
  incrementRevision?: boolean
}

type ViewportMutationOptions = {
  persist?: boolean
}

type ScenarioStore = {
  scenarioId: string | null
  viewerSlug: string | null
  updatedAt: string | null
  title: string
  document: ScenarioDocument
  selectedElementId: string | null
  activeAssetId: string | null
  textDraft: string
  textDefaults: {
    fontSize: number
    fontWeight: number
    align: 'left' | 'center' | 'right'
    textColor: string
  }
  penColor: string
  eraserSize: number
  access: EditorAccess
  lock: ScenarioLock | null
  saveState: SaveState
  lastSavedRevision: number
  history: ScenarioDocument[]
  future: ScenarioDocument[]
  initialize: (record: ScenarioDetailRecord, access: EditorAccess) => void
  reset: () => void
  setAccess: (access: EditorAccess) => void
  setLock: (lock: ScenarioLock | null) => void
  syncScenarioMetadata: (input: Pick<ScenarioDetailRecord, 'title' | 'viewerSlug' | 'updatedAt' | 'lock'>) => void
  setSaveState: (saveState: SaveState) => void
  markSaved: (revision: number) => void
  setSelectedElementId: (id: string | null) => void
  setTool: (tool: ScenarioTool) => void
  setActiveAssetId: (assetId: string | null) => void
  setTextDraft: (textDraft: string) => void
  setTextDefault: <K extends keyof ScenarioStore['textDefaults']>(
    key: K,
    value: ScenarioStore['textDefaults'][K],
  ) => void
  setPenColor: (color: string) => void
  setEraserSize: (size: number) => void
  setTitle: (title: string) => void
  setViewerSlug: (viewerSlug: string) => void
  setViewport: (
    viewport: ScenarioDocument['viewport'],
    options?: ViewportMutationOptions,
  ) => void
  setBasemapPreset: (preset: ScenarioDocument['basemap']['preset']) => void
  toggleContinentScene: (continent: ContinentSceneId) => void
  setFocusScene: (focusPreset: FocusSceneId | null) => void
  clearSceneSelection: () => void
  setAlertsEnabled: (enabled: boolean) => void
  setAlertAutoZoomEnabled: (enabled: boolean) => void
  setEditorAlertSoundEnabled: (enabled: boolean) => void
  setEditorAlertVolume: (volume: number) => void
  setPresentationAlertSoundEnabled: (enabled: boolean) => void
  setPresentationAlertVolume: (volume: number) => void
  setBannerAutoDismissSec: (seconds: number) => void
  toggleMissileSelection: (missileId: string) => void
  setActiveMissile: (missileId: string | null) => void
  setMissileTarget: (coord: Coordinate | null) => void
  setMissileLaunchSite: (missileId: string, coord: Coordinate | null) => void
  setMissilePlaybackSpeedMode: (mode: ScenarioMissilesState['playbackSpeedMode']) => void
  queueMissileLaunch: (missileId: string, interceptLaunchId?: string | null) => void
  queueMissileSalvo: (missileIds: string[], interceptLaunchId?: string | null) => void
  clearMissileState: () => void
  createSlideFromCurrentView: () => void
  duplicateSlide: (slideId: string) => void
  deleteSlide: (slideId: string) => void
  moveSlideUp: (slideId: string) => void
  moveSlideDown: (slideId: string) => void
  setActiveSlide: (slideId: string | null) => void
  renameSlide: (slideId: string, title: string) => void
  updateSlideNotes: (slideId: string, notes: string) => void
  setElementVisibilityOnSlide: (slideId: string, elementId: string, visible: boolean) => void
  setLabelOption: <K extends keyof ScenarioDocument['labelOptions']>(
    key: K,
    value: ScenarioDocument['labelOptions'][K],
  ) => void
  setStylePref: <K extends keyof ScenarioDocument['stylePrefs']>(
    key: K,
    value: ScenarioDocument['stylePrefs'][K],
  ) => void
  backfillUploadedAssetSnapshots: (assets: AssetDefinition[]) => void
  addElement: (element: ScenarioElement) => void
  addAssetElement: (
    assetId: string,
    position: Coordinate,
    assetSnapshot?: UploadedAssetSnapshot,
  ) => string
  addTextElement: (position: Coordinate) => string
  addLinearElement: (
    kind: 'polyline' | 'freehand',
    coordinates: Coordinate[],
    options?: {
      endArrow?: boolean
    },
  ) => void
  addPolygonElement: (coordinates: Coordinate[][]) => void
  updateElement: (id: string, updater: (element: ScenarioElement) => ScenarioElement) => void
  removeSelectedElement: () => void
  removeElementById: (id: string) => void
  clearAllElements: () => void
  updateSelectedElementStyle: (
    field: keyof ScenarioElement['style'],
    value: string | number | boolean | number[],
  ) => void
  updateSelectedElementNumeric: (
    field: 'rotation' | 'scale' | 'zIndex',
    value: number,
  ) => void
  toggleSelectedLock: () => void
  bringSelectedForward: () => void
  sendSelectedBackward: () => void
  undo: () => void
  redo: () => void
}

function createInitialState() {
  const document = createDefaultScenarioDocument()

  return {
    scenarioId: null,
    viewerSlug: null,
    updatedAt: null,
    title: 'Yeni Senaryo',
    document,
    selectedElementId: null,
    activeAssetId: null,
    textDraft: 'Yeni not',
    textDefaults: {
      fontSize: 24,
      fontWeight: 700,
      align: 'center' as const,
      textColor: '#12213f',
    },
    penColor: '#f9427c',
    eraserSize: 24,
    access: 'viewer' as EditorAccess,
    lock: null,
    saveState: 'idle' as SaveState,
    lastSavedRevision: document.revision,
    history: [] as ScenarioDocument[],
    future: [] as ScenarioDocument[],
  }
}

function applyMutation(
  current: ScenarioStore,
  nextDocument: ScenarioDocument,
  options: MutationOptions = {},
) {
  const shouldTrackHistory = options.trackHistory ?? true
  const shouldIncrementRevision = options.incrementRevision ?? true
  const parsed = migrateScenarioDocument(
    shouldIncrementRevision ? bumpRevision(nextDocument) : nextDocument,
  )

  return {
    document: parsed,
    selectedElementId: getValidSelectedElementId(parsed, current.selectedElementId),
    history: shouldTrackHistory
      ? [...current.history.slice(-39), cloneScenarioDocument(current.document)]
      : current.history,
    future: shouldTrackHistory ? [] : current.future,
    saveState: 'idle' as SaveState,
  }
}

function getValidSelectedElementId(document: ScenarioDocument, selectedElementId: string | null) {
  if (!selectedElementId) {
    return null
  }

  const elementExists = document.elements.some((element) => element.id === selectedElementId)
  if (!elementExists) {
    return null
  }

  const activeVisibleElementIds = getVisibleElementIdsForActiveSlide(document)
  if (activeVisibleElementIds && !activeVisibleElementIds.includes(selectedElementId)) {
    return null
  }

  return selectedElementId
}

function getMissilesState(document: ScenarioDocument): ScenarioMissilesState {
  return document.missiles ?? EMPTY_SCENARIO_MISSILES_STATE
}

function getAlertSettings(document: ScenarioDocument) {
  return document.alerts ?? DEFAULT_SCENARIO_ALERT_SETTINGS
}

function trimRecentLaunches(recentLaunches: MissileLaunchCommand[]) {
  return recentLaunches.slice(-20)
}

function createNextMissileDocument(
  document: ScenarioDocument,
  missiles: ScenarioMissilesState,
) {
  return {
    ...document,
    missiles,
  }
}

function buildMissileLaunchCommand(
  document: ScenarioDocument,
  missileId: string,
  launchedAt: number,
  interceptLaunchId: string | null = null,
): MissileLaunchCommand | null {
  const definition = getMissileById(missileId)
  if (!definition) {
    return null
  }

  const missilesState = getMissilesState(document)
  const launchCoord = resolveMissileLaunchCoord(definition, missilesState.launchSiteByMissileId)
  if (definition.type === 'interceptor' || definition.type === 'directed_energy') {
    if (!interceptLaunchId) {
      return null
    }

    const hostileLaunch = missilesState.recentLaunches.find((launch) => launch.id === interceptLaunchId) ?? null
    const hostileRuntimeFlight =
      useMissileStore.getState().activeFlights.find((flight) => flight.id === interceptLaunchId) ?? null
    const fallbackHostileFlight =
      hostileLaunch
        ? {
            launchCoord: hostileLaunch.launchCoord,
            targetCoord: hostileLaunch.targetCoord,
            progress: 0,
            duration: hostileLaunch.durationMs,
            startTime: hostileLaunch.launchedAt,
          }
        : null
    const hostileFlightSnapshot = hostileRuntimeFlight ?? fallbackHostileFlight

    if (!hostileFlightSnapshot) {
      return null
    }

    const interceptSnapshot = getHostileInterceptSnapshot(
      hostileFlightSnapshot,
      definition,
      launchCoord,
      launchedAt,
      missilesState.playbackSpeedMode,
    )
    if (!interceptSnapshot) {
      return null
    }
    const { interceptCoord, remainingToInterceptMs } = interceptSnapshot
    const interceptProbability = definition.interceptProbability ?? null
    const interceptOutcome =
      interceptProbability !== null
        ? Math.random() < interceptProbability
          ? 'success'
          : 'failure'
        : null

    return {
      id: nanoid(),
      missileId,
      launchCoord,
      targetCoord: interceptCoord,
      launchedAt,
      durationMs: Math.max(800, remainingToInterceptMs),
      salvoGroupId: null,
      interceptLaunchId,
      interceptOutcome,
      interceptProbability,
    }
  }

  if (!missilesState.targetCoord || definition.rangeMaxKm === null) {
    return null
  }

  const distanceKm = haversineDistance(launchCoord, missilesState.targetCoord) / 1000
  if (distanceKm > definition.rangeMaxKm) {
    return null
  }

  return {
    id: nanoid(),
    missileId,
    launchCoord,
    targetCoord: missilesState.targetCoord,
    launchedAt,
    durationMs: getEstimatedFlightDurationMs(
      definition,
      launchCoord,
      missilesState.targetCoord,
      missilesState.playbackSpeedMode,
    ),
    salvoGroupId: null,
    interceptLaunchId: null,
    interceptOutcome: null,
    interceptProbability: null,
  }
}

const ROTATION_LIMIT = Math.PI * 2

function toProjectedCoordinate([lon, lat]: Coordinate) {
  return fromLonLat([lon, lat]) as [number, number]
}

function toCoordinate([x, y]: [number, number]) {
  const [lon, lat] = toLonLat([x, y])
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))] satisfies Coordinate
}

function getRotationCenter(coordinates: Coordinate[]) {
  const projected = coordinates.map(toProjectedCoordinate)
  const xs = projected.map((coordinate) => coordinate[0])
  const ys = projected.map((coordinate) => coordinate[1])
  return [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
  ] as [number, number]
}

function rotateCoordinate(point: Coordinate, center: [number, number], delta: number) {
  const [x, y] = toProjectedCoordinate(point)
  const dx = x - center[0]
  const dy = y - center[1]
  const cos = Math.cos(delta)
  const sin = Math.sin(delta)

  return toCoordinate([
    center[0] + dx * cos - dy * sin,
    center[1] + dx * sin + dy * cos,
  ])
}

function rotateElementGeometry(element: ScenarioElement, nextRotation: number) {
  const delta = nextRotation - element.rotation
  if (Math.abs(delta) < 0.0001) {
    return {
      ...element,
      rotation: nextRotation,
    } satisfies ScenarioElement
  }

  if (element.kind === 'asset' || element.kind === 'text') {
    return {
      ...element,
      rotation: nextRotation,
    } satisfies ScenarioElement
  }

  if (element.kind === 'polyline' || element.kind === 'freehand') {
    const center = getRotationCenter(element.coordinates)
    return {
      ...element,
      rotation: nextRotation,
      coordinates: element.coordinates.map((coordinate) => rotateCoordinate(coordinate, center, delta)),
    } satisfies ScenarioElement
  }

  if (element.kind === 'polygon') {
    const center = getRotationCenter(element.coordinates.flat())
    return {
      ...element,
      rotation: nextRotation,
      coordinates: element.coordinates.map((ring) =>
        ring.map((coordinate) => rotateCoordinate(coordinate, center, delta)),
      ),
    } satisfies ScenarioElement
  }

  const center = getRotationCenter([element.anchor, element.position])
  return {
    ...element,
    rotation: nextRotation,
    anchor: rotateCoordinate(element.anchor, center, delta),
    position: rotateCoordinate(element.position, center, delta),
  } satisfies ScenarioElement
}

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  ...createInitialState(),

  initialize(record, access) {
    log.info('Senaryo baslatildi', { action: 'initialize', scenarioId: record.id, access })
    const normalizedDocument = migrateScenarioDocument(record.document)

    set({
      scenarioId: record.id,
      viewerSlug: record.viewerSlug,
      updatedAt: record.updatedAt,
      title: record.title,
      document: normalizedDocument,
      selectedElementId: null,
      access,
      lock: record.lock,
      lastSavedRevision: record.revision,
      history: [],
      future: [],
      saveState: 'saved',
    })
  },

  reset() {
    set(createInitialState())
  },

  setAccess(access) {
    set({ access })
  },

  setLock(lock) {
    set({ lock })
  },

  syncScenarioMetadata(input) {
    set({
      title: input.title,
      viewerSlug: input.viewerSlug,
      updatedAt: input.updatedAt,
      lock: input.lock,
    })
  },

  setSaveState(saveState) {
    set({ saveState })
  },

  markSaved(revision) {
    set({ lastSavedRevision: revision, saveState: 'saved' })
  },

  setSelectedElementId(id) {
    set((current) => ({
      selectedElementId: getValidSelectedElementId(current.document, id),
    }))
  },

  setTool(tool) {
    set((current) =>
      current.document.selectedTool === tool
        ? current
        : {
            document: {
              ...current.document,
              selectedTool: tool,
            },
          },
    )
  },

  setActiveAssetId(activeAssetId) {
    set({ activeAssetId })
  },

  setTextDraft(textDraft) {
    set({ textDraft })
  },

  setTextDefault(key, value) {
    set((current) => ({
      textDefaults: { ...current.textDefaults, [key]: value },
    }))
  },

  setPenColor(color) {
    set({ penColor: color })
  },

  setEraserSize(size) {
    set({ eraserSize: Math.max(10, Math.min(60, size)) })
  },

  setTitle(title) {
    set({ title })
  },

  setViewerSlug(viewerSlug) {
    set({ viewerSlug })
  },

  setViewport(viewport, options) {
    set((current) => ({
      ...(options?.persist === false
        ? (() => {
            const nextDocument = migrateScenarioDocument(
              syncActiveSlideViewState({
                ...current.document,
                viewport,
              }),
            )

            return {
              document: nextDocument,
              selectedElementId: getValidSelectedElementId(nextDocument, current.selectedElementId),
              saveState: current.saveState,
            }
          })()
        : applyMutation(
            current,
            syncActiveSlideViewState({
              ...current.document,
              viewport,
            }),
            { trackHistory: false },
          )),
    }))
  },

  setBasemapPreset(preset) {
    set((current) => ({
      ...applyMutation(
        current,
        syncActiveSlideViewState({
          ...current.document,
          basemap: {
            ...current.document.basemap,
            preset,
          },
        }),
        { trackHistory: false },
      ),
    }))
  },

  toggleContinentScene(continent) {
    set((current) => {
      const isActive = current.document.scene.activeContinents.includes(continent)
      const nextContinents = isActive
        ? current.document.scene.activeContinents.filter((item) => item !== continent)
        : [...current.document.scene.activeContinents, continent]

      return {
        ...applyMutation(
          current,
          syncActiveSlideViewState({
            ...current.document,
            scene: {
              activeContinents: nextContinents,
              focusPreset: null,
            },
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  setFocusScene(focusPreset) {
    set((current) => ({
      ...applyMutation(
        current,
        syncActiveSlideViewState({
          ...current.document,
          scene: {
            activeContinents: [],
            focusPreset,
          },
        }),
        { trackHistory: false },
      ),
    }))
  },

  clearSceneSelection() {
    set((current) => ({
      ...applyMutation(
        current,
        syncActiveSlideViewState({
          ...current.document,
          scene: {
            activeContinents: [],
            focusPreset: null,
          },
        }),
        { trackHistory: false },
      ),
    }))
  },

  setAlertsEnabled(enabled) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      if (alertsState.enabled === enabled) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              enabled,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  setAlertAutoZoomEnabled(enabled) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      if (alertsState.autoZoomEnabled === enabled) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              autoZoomEnabled: enabled,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  setEditorAlertSoundEnabled(enabled) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      if (alertsState.editorSoundEnabled === enabled) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              editorSoundEnabled: enabled,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  setEditorAlertVolume(volume) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      const nextVolume = clamp(volume, 0, 1)
      if (Math.abs(alertsState.editorVolume - nextVolume) < 0.0001) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              editorVolume: nextVolume,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  setPresentationAlertSoundEnabled(enabled) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      if (alertsState.presentationSoundEnabled === enabled) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              presentationSoundEnabled: enabled,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  setPresentationAlertVolume(volume) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      const nextVolume = clamp(volume, 0, 1)
      if (Math.abs(alertsState.presentationVolume - nextVolume) < 0.0001) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              presentationVolume: nextVolume,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  setBannerAutoDismissSec(seconds) {
    set((current) => {
      const alertsState = getAlertSettings(current.document)
      const nextSeconds = Math.round(Math.min(120, Math.max(5, seconds)))
      if (alertsState.bannerAutoDismissSec === nextSeconds) {
        return current
      }

      return {
        ...applyMutation(
          current,
          {
            ...current.document,
            alerts: {
              ...alertsState,
              bannerAutoDismissSec: nextSeconds,
            },
          },
          { trackHistory: false },
        ),
      }
    })
  },

  toggleMissileSelection(missileId) {
    set((current) => {
      const missilesState = getMissilesState(current.document)
      if (!getMissileById(missileId)) {
        return current
      }

      const alreadySelected = missilesState.selectedMissileIds.includes(missileId)
      const selectedMissileIds = alreadySelected
        ? missilesState.selectedMissileIds.filter((id) => id !== missileId)
        : [...missilesState.selectedMissileIds, missileId]
      const activeMissileId =
        missilesState.activeMissileId === missileId && alreadySelected
          ? null
          : missilesState.activeMissileId ?? missileId

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            selectedMissileIds,
            activeMissileId,
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  setActiveMissile(missileId) {
    set((current) => {
      if (missileId && !getMissileById(missileId)) {
        return current
      }

      const missilesState = getMissilesState(current.document)
      if (missilesState.activeMissileId === missileId) {
        return current
      }

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            activeMissileId: missileId,
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  setMissileTarget(coord) {
    set((current) => {
      const missilesState = getMissilesState(current.document)
      const sameTarget =
        missilesState.targetCoord?.[0] === coord?.[0] && missilesState.targetCoord?.[1] === coord?.[1]
      if (sameTarget) {
        return current
      }

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            targetCoord: coord,
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  setMissileLaunchSite(missileId, coord) {
    set((current) => {
      const definition = getMissileById(missileId)
      if (!definition) {
        return current
      }

      if (coord && !isValidLaunchSiteCoord(definition, coord)) {
        return current
      }

      const missilesState = getMissilesState(current.document)
      const currentCoord = resolveMissileLaunchCoord(definition, missilesState.launchSiteByMissileId)
      const nextStoredCoord = coord && !areCoordsEqual(coord, definition.defaultLaunchCoord) ? coord : null
      const nextResolvedCoord = nextStoredCoord ?? definition.defaultLaunchCoord

      if (areCoordsEqual(currentCoord, nextResolvedCoord)) {
        return current
      }

      const launchSiteByMissileId = { ...missilesState.launchSiteByMissileId }
      if (!nextStoredCoord) {
        delete launchSiteByMissileId[missileId]
      } else {
        launchSiteByMissileId[missileId] = nextStoredCoord
      }

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            launchSiteByMissileId,
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  setMissilePlaybackSpeedMode(mode) {
    set((current) => {
      const missilesState = getMissilesState(current.document)
      if (missilesState.playbackSpeedMode === mode) {
        return current
      }

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            playbackSpeedMode: mode,
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  queueMissileLaunch(missileId, interceptLaunchId = null) {
    set((current) => {
      const missilesState = getMissilesState(current.document)
      const command = buildMissileLaunchCommand(current.document, missileId, Date.now(), interceptLaunchId)
      if (!command) {
        return current
      }

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            recentLaunches: trimRecentLaunches([...missilesState.recentLaunches, command]),
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  queueMissileSalvo(missileIds, interceptLaunchId = null) {
    set((current) => {
      const missilesState = getMissilesState(current.document)
      const base = Date.now()
      const salvoGroupId = nanoid()
      const commands = missileIds
        .map((missileId, index) => {
          const command = buildMissileLaunchCommand(
            current.document,
            missileId,
            base + index * 200,
            interceptLaunchId,
          )

          return command
            ? {
                ...command,
                salvoGroupId,
              }
            : null
        })
        .filter(Boolean) as MissileLaunchCommand[]

      if (commands.length === 0) {
        return current
      }

      return {
        ...applyMutation(
          current,
          createNextMissileDocument(current.document, {
            ...missilesState,
            recentLaunches: trimRecentLaunches([...missilesState.recentLaunches, ...commands]),
          }),
          { trackHistory: false },
        ),
      }
    })
  },

  clearMissileState() {
    set((current) => ({
      ...applyMutation(
        current,
        createNextMissileDocument(current.document, EMPTY_SCENARIO_MISSILES_STATE),
        { trackHistory: false },
      ),
    }))
  },

  createSlideFromCurrentView() {
    set((current) => ({
      ...applyMutation(current, createBriefingSlideFromCurrentView(current.document)),
    }))
  },

  duplicateSlide(slideId) {
    set((current) => {
      const nextDocument = duplicateBriefingSlide(current.document, slideId)
      return nextDocument === current.document ? current : { ...applyMutation(current, nextDocument) }
    })
  },

  deleteSlide(slideId) {
    set((current) => {
      const nextDocument = deleteBriefingSlide(current.document, slideId)
      return nextDocument === current.document ? current : { ...applyMutation(current, nextDocument) }
    })
  },

  moveSlideUp(slideId) {
    set((current) => {
      const nextDocument = moveBriefingSlideUp(current.document, slideId)
      return nextDocument === current.document ? current : { ...applyMutation(current, nextDocument) }
    })
  },

  moveSlideDown(slideId) {
    set((current) => {
      const nextDocument = moveBriefingSlideDown(current.document, slideId)
      return nextDocument === current.document ? current : { ...applyMutation(current, nextDocument) }
    })
  },

  setActiveSlide(slideId) {
    set((current) => {
      const nextDocument = setBriefingActiveSlide(current.document, slideId)
      return nextDocument === current.document
        ? current
        : { ...applyMutation(current, nextDocument, { trackHistory: false }) }
    })
  },

  renameSlide(slideId, title) {
    set((current) => {
      const nextDocument = renameBriefingSlide(current.document, slideId, title)
      return nextDocument === current.document
        ? current
        : { ...applyMutation(current, nextDocument, { trackHistory: false }) }
    })
  },

  updateSlideNotes(slideId, notes) {
    set((current) => {
      const nextDocument = updateBriefingSlideNotes(current.document, slideId, notes)
      return nextDocument === current.document
        ? current
        : { ...applyMutation(current, nextDocument, { trackHistory: false }) }
    })
  },

  setElementVisibilityOnSlide(slideId, elementId, visible) {
    set((current) => {
      const nextDocument = setBriefingElementVisibilityOnSlide(current.document, slideId, elementId, visible)
      if (nextDocument === current.document) {
        return current
      }
      const mutation = applyMutation(current, nextDocument)

      return {
        ...mutation,
        selectedElementId: getValidSelectedElementId(
          mutation.document,
          !visible && current.selectedElementId === elementId ? null : current.selectedElementId,
        ),
      }
    })
  },

  setLabelOption(key, value) {
    set((current) => ({
      ...applyMutation(
        current,
        {
          ...current.document,
          labelOptions: {
            ...current.document.labelOptions,
            [key]: value,
          },
        },
        { trackHistory: false },
      ),
    }))
  },

  setStylePref(key, value) {
    set((current) => ({
      ...applyMutation(
        current,
        {
          ...current.document,
          stylePrefs: {
            ...current.document.stylePrefs,
            [key]: value,
          },
        },
        { trackHistory: false },
      ),
    }))
  },

  backfillUploadedAssetSnapshots(assets) {
    set((current) => {
      const { changed, document } = backfillUploadedAssetSnapshots(current.document, assets)
      if (!changed) {
        return current
      }

      return {
        ...applyMutation(current, document, { trackHistory: false }),
      }
    })
  },

  addElement(element) {
    log.debug('Element eklendi', { action: 'addElement', elementId: element.id, kind: element.kind })
    const current = get()
    const nextDocument = addElementToActiveSlide(
      {
        ...current.document,
        elements: [...current.document.elements, element],
      },
      element.id,
    )

    set((current) => ({
      ...applyMutation(current, nextDocument),
      selectedElementId: element.id,
    }))
  },

  addAssetElement(assetId, position, assetSnapshot) {
    const current = get()
    const nextId = nanoid()
    current.addElement({
      id: nextId,
      kind: 'asset',
      position,
      assetId,
      assetSnapshot,
      label: '',
      size: 48,
      rotation: 0,
      scale: 1,
      zIndex: current.document.elements.length + 1,
      locked: false,
      meta: {
        referenceZoom: String(current.document.viewport.zoom),
      },
      style: {
        strokeColor: '#12213f',
        fillColor: 'rgba(18, 33, 63, 0.12)',
        textColor: '#12213f',
        lineWidth: 3,
        opacity: 1,
        lineDash: [],
        endArrow: false,
      },
    })
    return nextId
  },

  addTextElement(position) {
    const current = get()
    const text = current.textDraft.trim() || 'Yeni not'
    const nextId = nanoid()
    const { fontSize, fontWeight, align, textColor } = current.textDefaults

    current.addElement({
      id: nextId,
      kind: 'text',
      position,
      text,
      fontSize,
      fontWeight,
      align,
      rotation: 0,
      scale: 1,
      zIndex: current.document.elements.length + 1,
      locked: false,
      meta: {
        referenceZoom: String(current.document.viewport.zoom),
      },
      style: {
        strokeColor: '#12213f',
        fillColor: 'rgba(0, 0, 0, 0)',
        textColor,
        lineWidth: 3,
        opacity: 1,
        lineDash: [],
        endArrow: false,
      },
    })
    return nextId
  },

  addLinearElement(kind, coordinates, options) {
    const current = get()
    const color = current.penColor
    const baseStyle = {
      strokeColor: color,
      fillColor: color + '2e',
      textColor: '#12213f',
      lineWidth: 4,
      opacity: 1,
      lineDash: [],
      endArrow: false,
    }

    current.addElement({
      id: nanoid(),
      kind,
      coordinates,
      rotation: 0,
      scale: 1,
      zIndex: current.document.elements.length + 1,
      locked: false,
      meta: {},
      style: {
        ...baseStyle,
        endArrow: options?.endArrow ?? false,
      },
    })
  },

  addPolygonElement(coordinates) {
    const current = get()
    const color = current.penColor
    current.addElement({
      id: nanoid(),
      kind: 'polygon',
      coordinates,
      rotation: 0,
      scale: 1,
      zIndex: current.document.elements.length + 1,
      locked: false,
      meta: {},
      style: {
        strokeColor: color,
        fillColor: color + '2e',
        textColor: '#12213f',
        lineWidth: 3,
        opacity: 1,
        lineDash: [],
        endArrow: false,
      },
    })
  },

  updateElement(id, updater) {
    set((current) => {
      const nextElements = current.document.elements.map((element) => {
        if (element.id !== id) {
          return element
        }

        if (element.locked) {
          return element
        }

        return updater(element)
      })

      return {
        ...applyMutation(current, {
          ...current.document,
          elements: nextElements,
        }),
      }
    })
  },

  removeSelectedElement() {
    const { selectedElementId } = get()
    if (!selectedElementId) {
      return
    }

    const element = get().document.elements.find((e) => e.id === selectedElementId)
    if (element?.locked) {
      log.debug('Kilitli element silinemez', { action: 'removeSelectedElement', elementId: selectedElementId })
      return
    }

    log.debug('Element silindi', { action: 'removeSelectedElement', elementId: selectedElementId })
    const current = get()
    const nextDocument = removeElementIdsFromSlides(
      {
        ...current.document,
        elements: current.document.elements.filter(
          (currentElement) => currentElement.id !== selectedElementId,
        ),
      },
      [selectedElementId],
    )

    set((current) => ({
      ...applyMutation(current, nextDocument),
      selectedElementId: null,
    }))
  },

  removeElementById(id) {
    const element = get().document.elements.find((e) => e.id === id)
    if (!element || element.locked) return

    const current = get()
    const nextDocument = removeElementIdsFromSlides(
      {
        ...current.document,
        elements: current.document.elements.filter((currentElement) => currentElement.id !== id),
      },
      [id],
    )

    set((current) => ({
      ...applyMutation(current, nextDocument),
      selectedElementId: current.selectedElementId === id ? null : current.selectedElementId,
    }))
  },

  clearAllElements() {
    log.info('Tum elementler temizlendi', { action: 'clearAllElements' })
    const current = get()
    const nextDocument = removeElementIdsFromSlides(
      {
        ...current.document,
        elements: [],
        selectedTool: 'select',
      },
      current.document.elements.map((element) => element.id),
    )

    set((current) => ({
      ...applyMutation(current, nextDocument),
      selectedElementId: null,
    }))
  },

  updateSelectedElementStyle(field, value) {
    const { selectedElementId } = get()
    if (!selectedElementId) {
      return
    }

    get().updateElement(selectedElementId, (element) => ({
      ...element,
      style: {
        ...element.style,
        [field]: value,
      },
    }))
  },

  updateSelectedElementNumeric(field, value) {
    const { selectedElementId } = get()
    if (!selectedElementId) {
      return
    }

    get().updateElement(selectedElementId, (element) => {
      if (field === 'rotation') {
        return rotateElementGeometry(element, clamp(value, -ROTATION_LIMIT, ROTATION_LIMIT))
      }

      return {
        ...element,
        [field]:
          field === 'scale'
            ? clamp(value, 0.35, 4)
            : field === 'zIndex'
              ? Math.round(clamp(value, 1, 80))
              : value,
      }
    })
  },

  toggleSelectedLock() {
    const { selectedElementId } = get()
    if (!selectedElementId) {
      return
    }

    set((current) => ({
      ...applyMutation(current, {
        ...current.document,
        elements: current.document.elements.map((element) =>
          element.id === selectedElementId
            ? {
                ...element,
                locked: !element.locked,
              }
            : element,
        ),
      }),
    }))
  },

  bringSelectedForward() {
    const { selectedElementId } = get()
    if (!selectedElementId) {
      return
    }

    get().updateElement(selectedElementId, (element) => ({
      ...element,
      zIndex: element.zIndex + 1,
    }))
  },

  sendSelectedBackward() {
    const { selectedElementId } = get()
    if (!selectedElementId) {
      return
    }

    get().updateElement(selectedElementId, (element) => ({
      ...element,
      zIndex: Math.max(1, element.zIndex - 1),
    }))
  },

  undo() {
    const current = get()
    const previous = current.history.at(-1)

    if (!previous) {
      return
    }

    log.debug('Geri al', { action: 'undo', historyDepth: current.history.length })

    set({
      document: previous,
      history: current.history.slice(0, -1),
      future: [cloneScenarioDocument(current.document), ...current.future].slice(0, 40),
      selectedElementId: null,
      saveState: 'idle',
    })
  },

  redo() {
    const current = get()
    const next = current.future[0]

    if (!next) {
      return
    }

    log.debug('Yinele', { action: 'redo', futureDepth: current.future.length })

    set({
      document: next,
      history: [...current.history, cloneScenarioDocument(current.document)].slice(-40),
      future: current.future.slice(1),
      selectedElementId: null,
      saveState: 'idle',
    })
  },
}))
