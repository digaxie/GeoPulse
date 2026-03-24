import { DEFAULT_SCENARIO_ALERT_SETTINGS } from '@/features/alerts/types'
import { getMissileById } from '@/features/missiles/missileData'
import { getEstimatedFlightDurationMs } from '@/features/missiles/flightAnimation'
import { isValidLaunchSiteCoord } from '@/features/missiles/launchSites'
import { EMPTY_SCENARIO_MISSILES_STATE } from '@/features/missiles/types'
import {
  scenarioDocumentSchema,
  type ScenarioDocument,
} from '@/features/scenario/model'

function withElementReferenceZoom(document: ScenarioDocument): ScenarioDocument {
  return {
    ...document,
    elements: document.elements.map((element) =>
      (element.kind === 'asset' || element.kind === 'text') && !element.meta.referenceZoom
        ? {
            ...element,
            meta: {
              ...element.meta,
              referenceZoom: String(document.viewport.zoom),
            },
          }
        : element,
    ),
  }
}

function withNormalizedLabelLocale(document: ScenarioDocument): ScenarioDocument {
  return {
    ...document,
    labelOptions: {
      ...document.labelOptions,
      locale: document.labelOptions.locale === 'intl' ? 'tr' : document.labelOptions.locale,
    },
  }
}

function withNormalizedBriefing(document: ScenarioDocument): ScenarioDocument {
  if (!document.briefing) {
    return document
  }

  const elementIds = new Set(document.elements.map((element) => element.id))
  const slides = document.briefing.slides.map((slide) => ({
    ...slide,
    visibleElementIds: slide.visibleElementIds.filter((elementId) => elementIds.has(elementId)),
  }))
  const activeSlideExists = slides.some((slide) => slide.id === document.briefing?.activeSlideId)

  return {
    ...document,
    briefing: {
      slides,
      activeSlideId: activeSlideExists ? document.briefing.activeSlideId : null,
    },
  }
}

function withNormalizedMissiles(document: ScenarioDocument): ScenarioDocument {
  const missiles = document.missiles ?? EMPTY_SCENARIO_MISSILES_STATE
  const selectedMissileIds = Array.from(
    new Set(missiles.selectedMissileIds.filter((missileId) => Boolean(getMissileById(missileId)))),
  )
  const activeMissileId =
    missiles.activeMissileId && getMissileById(missiles.activeMissileId)
      ? missiles.activeMissileId
      : null
  const launchSiteByMissileId = Object.fromEntries(
    Object.entries(missiles.launchSiteByMissileId ?? {}).filter(([missileId, coord]) => {
      const definition = getMissileById(missileId)
      return Boolean(definition && isValidLaunchSiteCoord(definition, coord))
    }),
  )
  const recentLaunches = missiles.recentLaunches
    .filter((launch) => Boolean(getMissileById(launch.missileId)))
    .map((launch) => {
      const definition = getMissileById(launch.missileId)
      if (!definition) {
        return launch
      }

      return {
        ...launch,
        durationMs:
          launch.durationMs > 0
            ? launch.durationMs
            : getEstimatedFlightDurationMs(
                definition,
                launch.launchCoord,
                launch.targetCoord,
                missiles.playbackSpeedMode ?? EMPTY_SCENARIO_MISSILES_STATE.playbackSpeedMode,
              ),
        interceptOutcome: launch.interceptOutcome ?? null,
        interceptProbability: launch.interceptProbability ?? null,
      }
    })
    .slice(-20)

  return {
    ...document,
    missiles: {
      selectedMissileIds,
      activeMissileId,
      targetCoord: missiles.targetCoord ?? null,
      launchSiteByMissileId,
      playbackSpeedMode: missiles.playbackSpeedMode ?? EMPTY_SCENARIO_MISSILES_STATE.playbackSpeedMode,
      recentLaunches,
    },
  }
}

function withNormalizedAlerts(document: ScenarioDocument): ScenarioDocument {
  return {
    ...document,
    alerts: document.alerts ?? DEFAULT_SCENARIO_ALERT_SETTINGS,
  }
}

export function migrateScenarioDocument(raw: unknown): ScenarioDocument {
  const parsed = scenarioDocumentSchema.parse(raw)
  return withNormalizedAlerts(
    withNormalizedMissiles(
      withNormalizedBriefing(
        withElementReferenceZoom(
          withNormalizedLabelLocale(parsed),
        ),
      ),
    ),
  )
}
