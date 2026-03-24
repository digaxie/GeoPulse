import { DEFAULT_SCENARIO_ALERT_SETTINGS } from '@/features/alerts/types'
import { scenarioDocumentSchema, type ScenarioDocument } from '@/features/scenario/model'
import { EMPTY_SCENARIO_MISSILES_STATE } from '@/features/missiles/types'

export function createDefaultScenarioDocument(): ScenarioDocument {
  return scenarioDocumentSchema.parse({
    viewport: {
      center: [18, 22],
      zoom: 2.6,
      rotation: 0,
    },
    basemap: {
      preset: 'openfreemap_liberty',
      projection: 'web_mercator',
    },
    labelOptions: {
      showCountries: true,
      showAdmin1: true,
      showCities: true,
      showDisputedOverlay: true,
      locale: 'tr',
    },
    scene: {
      activeContinents: [],
      focusPreset: null,
    },
    stylePrefs: {
      backgroundPreset: 'broadcast_blue',
      oceanColor: '#a9d6ff',
      landPalette: 'broadcast',
      performanceMode: false,
      admin1Opacity: 0.48,
      countryLabelSize: 16,
      cityLabelSize: 12,
    },
    selectedTool: 'select',
    revision: 1,
    elements: [],
    alerts: DEFAULT_SCENARIO_ALERT_SETTINGS,
    missiles: EMPTY_SCENARIO_MISSILES_STATE,
  })
}
