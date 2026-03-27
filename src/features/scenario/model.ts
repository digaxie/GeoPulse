import { z } from 'zod'

import { DEFAULT_SCENARIO_ALERT_SETTINGS } from '@/features/alerts/types'
import { EMPTY_SCENARIO_MISSILES_STATE } from '@/features/missiles/types'
import {
  continentSceneIds,
  defaultSceneSelection,
  focusSceneIds,
} from '@/features/scenario/scenes'

export const coordinateSchema = z.tuple([z.number(), z.number()])
export const lineCoordinatesSchema = z.array(coordinateSchema).min(2)
export const polygonCoordinatesSchema = z.array(z.array(coordinateSchema).min(3)).min(1)

const elementStyleSchema = z.object({
  strokeColor: z.string().default('#f9427c'),
  fillColor: z.string().default('rgba(249, 66, 124, 0.2)'),
  textColor: z.string().default('#10203b'),
  lineWidth: z.number().min(1).max(12).default(3),
  opacity: z.number().min(0.1).max(1).default(1),
  lineDash: z.array(z.number()).default([]),
  endArrow: z.boolean().default(false),
})

const defaultElementStyle = {
  strokeColor: '#f9427c',
  fillColor: 'rgba(249, 66, 124, 0.2)',
  textColor: '#10203b',
  lineWidth: 3,
  opacity: 1,
  lineDash: [],
  endArrow: false,
} satisfies z.infer<typeof elementStyleSchema>

const baseElementSchema = z.object({
  id: z.string(),
  rotation: z.number().default(0),
  scale: z.number().min(0.2).max(5).default(1),
  zIndex: z.number().int().min(1).default(1),
  locked: z.boolean().default(false),
  meta: z.record(z.string(), z.string()).default({}),
  style: elementStyleSchema.default(defaultElementStyle),
})

const assetElementSchema = baseElementSchema.extend({
  kind: z.literal('asset'),
  position: coordinateSchema,
  assetId: z.string(),
  label: z.string().default(''),
  size: z.number().min(20).max(180).default(44),
})

export const uploadedAssetSnapshotSchema = z.object({
  id: z.string(),
  kind: z.enum(['flag', 'air', 'ground', 'sea', 'explosion', 'danger', 'custom']),
  label: z.string(),
  sourceType: z.literal('upload'),
  storagePath: z.string(),
  thumbnailPath: z.string(),
  intrinsicWidth: z.number().int().positive().optional(),
  intrinsicHeight: z.number().int().positive().optional(),
})

const assetElementSchemaWithSnapshot = assetElementSchema.extend({
  assetSnapshot: uploadedAssetSnapshotSchema.optional(),
})

const textElementSchema = baseElementSchema.extend({
  kind: z.literal('text'),
  position: coordinateSchema,
  text: z.string().min(1),
  fontSize: z.number().min(12).max(72).default(26),
  fontWeight: z.number().min(300).max(900).default(700),
  align: z.enum(['left', 'center', 'right']).default('center'),
})

const polylineElementSchema = baseElementSchema.extend({
  kind: z.literal('polyline'),
  coordinates: lineCoordinatesSchema,
})

const freehandElementSchema = baseElementSchema.extend({
  kind: z.literal('freehand'),
  coordinates: lineCoordinatesSchema,
})

const polygonElementSchema = baseElementSchema.extend({
  kind: z.literal('polygon'),
  coordinates: polygonCoordinatesSchema,
})

const calloutElementSchema = baseElementSchema.extend({
  kind: z.literal('callout'),
  position: coordinateSchema,
  anchor: coordinateSchema,
  text: z.string().min(1),
})

export const basemapPresetSchema = z.enum([
  'de_facto_world',
  'openfreemap_liberty',
  'openfreemap_bright',
  'openfreemap_positron',

  'osm_standard',
  'osm_humanitarian',
  'open_topo',
  'hgm_temel',
  'hgm_gece',
  'hgm_siyasi',
  'hgm_yukseklik',
  'hgm_uydu',
])

export const backgroundPresetSchema = z.enum([
  'broadcast_blue',
  'paper_light',
  'midnight',
])

export const uiThemeSchema = z.enum(['light', 'dark'])

export const landPaletteSchema = z.enum(['broadcast', 'atlas', 'muted'])

export const scenarioElementSchema = z.discriminatedUnion('kind', [
  assetElementSchemaWithSnapshot,
  textElementSchema,
  polylineElementSchema,
  freehandElementSchema,
  polygonElementSchema,
  calloutElementSchema,
])

export const scenarioToolSchema = z.enum([
  'select',
  'asset',
  'text',
  'arrow',
  'polyline',
  'freehand',
  'area',
  'rectangle',
  'circle',
  'triangle',
  'eraser',
])

export const labelLocaleSchema = z.enum(['intl', 'tr', 'en', 'original', 'dual'])
export const continentSceneSchema = z.enum(continentSceneIds)
export const focusSceneSchema = z.enum(focusSceneIds)
export const sceneSelectionSchema = z.object({
  activeContinents: z.array(continentSceneSchema).default(defaultSceneSelection.activeContinents),
  focusPreset: focusSceneSchema.nullable().default(defaultSceneSelection.focusPreset),
})
export const scenarioViewportSchema = z.object({
  center: coordinateSchema.default([67.7099, 33.9391]),
  zoom: z.number().min(1).max(18).default(5),
  rotation: z.number().default(0),
})
export const scenarioBasemapSchema = z.object({
  preset: basemapPresetSchema.default('de_facto_world'),
  projection: z.literal('web_mercator').default('web_mercator'),
})
export const missileLaunchCommandSchema = z.object({
  id: z.string(),
  missileId: z.string(),
  launchCoord: coordinateSchema,
  targetCoord: coordinateSchema,
  launchedAt: z.number(),
  durationMs: z.number().nonnegative().default(0),
  salvoGroupId: z.string().nullable().default(null),
  interceptLaunchId: z.string().nullable().default(null),
  interceptOutcome: z.enum(['success', 'failure']).nullable().default(null),
  interceptProbability: z.number().min(0).max(1).nullable().default(null),
})
export const scenarioMissilesStateSchema = z.object({
  selectedMissileIds: z.array(z.string()).default(EMPTY_SCENARIO_MISSILES_STATE.selectedMissileIds),
  activeMissileId: z.string().nullable().default(EMPTY_SCENARIO_MISSILES_STATE.activeMissileId),
  targetCoord: coordinateSchema.nullable().default(EMPTY_SCENARIO_MISSILES_STATE.targetCoord),
  launchSiteByMissileId: z.record(z.string(), coordinateSchema).default(EMPTY_SCENARIO_MISSILES_STATE.launchSiteByMissileId),
  playbackSpeedMode: z.enum(['fast', 'realistic']).default(EMPTY_SCENARIO_MISSILES_STATE.playbackSpeedMode),
  recentLaunches: z.array(missileLaunchCommandSchema).default(EMPTY_SCENARIO_MISSILES_STATE.recentLaunches),
})
export const scenarioAlertSettingsSchema = z
  .object({
    enabled: z.boolean().default(DEFAULT_SCENARIO_ALERT_SETTINGS.enabled),
    autoZoomEnabled: z.boolean().optional(),
    editorSoundEnabled: z.boolean().optional(),
    editorVolume: z.number().min(0).max(1).optional(),
    presentationSoundEnabled: z.boolean().optional(),
    presentationVolume: z.number().min(0).max(1).optional(),
    bannerAutoDismissSec: z.number().min(5).max(120).optional(),
    sharedSelectedAlertId: z.string().nullable().optional(),
    sharedFocusedSystemMessageKey: z.string().nullable().optional(),
    sharedDrawerSelectionKey: z.string().nullable().optional(),
    sharedFocusedSystemMessageId: z.number().int().nullable().optional(),
    soundEnabled: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
  })
  .transform((input) => {
    const legacySoundEnabled =
      input.soundEnabled ?? DEFAULT_SCENARIO_ALERT_SETTINGS.editorSoundEnabled
    const legacyVolume = input.volume ?? DEFAULT_SCENARIO_ALERT_SETTINGS.editorVolume

    return {
      enabled: input.enabled,
      autoZoomEnabled: input.autoZoomEnabled ?? DEFAULT_SCENARIO_ALERT_SETTINGS.autoZoomEnabled,
      editorSoundEnabled: input.editorSoundEnabled ?? legacySoundEnabled,
      editorVolume: input.editorVolume ?? legacyVolume,
      presentationSoundEnabled:
        input.presentationSoundEnabled ?? legacySoundEnabled,
      presentationVolume: input.presentationVolume ?? legacyVolume,
      bannerAutoDismissSec:
        input.bannerAutoDismissSec ?? DEFAULT_SCENARIO_ALERT_SETTINGS.bannerAutoDismissSec,
      sharedSelectedAlertId:
        input.sharedSelectedAlertId ?? DEFAULT_SCENARIO_ALERT_SETTINGS.sharedSelectedAlertId,
      sharedFocusedSystemMessageKey:
        input.sharedFocusedSystemMessageKey ??
        DEFAULT_SCENARIO_ALERT_SETTINGS.sharedFocusedSystemMessageKey,
      sharedDrawerSelectionKey:
        input.sharedDrawerSelectionKey ??
        DEFAULT_SCENARIO_ALERT_SETTINGS.sharedDrawerSelectionKey,
    }
  })
export const briefingSlideSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1).default('Slayt'),
  notes: z.string().default(''),
  viewport: scenarioViewportSchema,
  basemapPreset: basemapPresetSchema.default('de_facto_world'),
  sceneSelection: sceneSelectionSchema.default(defaultSceneSelection),
  visibleElementIds: z.array(z.string()).default([]),
})
export const scenarioBriefingSchema = z.object({
  slides: z.array(briefingSlideSchema).default([]),
  activeSlideId: z.string().nullable().default(null),
})

export const scenarioDocumentSchema = z.object({
  viewport: scenarioViewportSchema,
  basemap: scenarioBasemapSchema,
  labelOptions: z.object({
    showCountries: z.boolean().default(true),
    showAdmin1: z.boolean().default(true),
    showCities: z.boolean().default(true),
    showDisputedOverlay: z.boolean().default(true),
    locale: labelLocaleSchema.default('tr'),
  }),
  scene: sceneSelectionSchema.default(defaultSceneSelection),
  elements: z.array(scenarioElementSchema).default([]),
  selectedTool: scenarioToolSchema.default('select'),
  stylePrefs: z.object({
    uiTheme: uiThemeSchema.default('light'),
    backgroundPreset: backgroundPresetSchema.default('broadcast_blue'),
    oceanColor: z.string().default('#a7d1ff'),
    landPalette: landPaletteSchema.default('broadcast'),
    performanceMode: z.boolean().default(false),
    admin1Opacity: z.number().min(0).max(1).default(0.55),
    countryLabelSize: z.number().min(12).max(22).default(16),
    cityLabelSize: z.number().min(10).max(20).default(12),
  }),
  alerts: scenarioAlertSettingsSchema.optional(),
  missiles: scenarioMissilesStateSchema.optional(),
  briefing: scenarioBriefingSchema.optional(),
  revision: z.number().int().min(1).default(1),
})

export type Coordinate = z.infer<typeof coordinateSchema>
export type ScenarioElement = z.infer<typeof scenarioElementSchema>
export type ScenarioAssetElement = z.infer<typeof assetElementSchemaWithSnapshot>
export type ScenarioTool = z.infer<typeof scenarioToolSchema>
export type ScenarioDocument = z.infer<typeof scenarioDocumentSchema>
export type ElementStyle = z.infer<typeof elementStyleSchema>
export type UploadedAssetSnapshot = z.infer<typeof uploadedAssetSnapshotSchema>
export type BriefingSlide = z.infer<typeof briefingSlideSchema>
export type ScenarioBriefing = z.infer<typeof scenarioBriefingSchema>
export type MissileLaunchCommand = z.infer<typeof missileLaunchCommandSchema>
export type ScenarioMissilesState = z.infer<typeof scenarioMissilesStateSchema>

export function cloneScenarioDocument(document: ScenarioDocument): ScenarioDocument {
  return scenarioDocumentSchema.parse(structuredClone(document))
}

export function bumpRevision(document: ScenarioDocument) {
  return {
    ...document,
    revision: document.revision + 1,
  }
}
