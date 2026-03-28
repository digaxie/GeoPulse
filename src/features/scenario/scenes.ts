export const continentSceneIds = [
  'europe',
  'africa',
  'asia',
  'north_america',
  'south_america',
  'oceania',
] as const

export const focusSceneIds = [
  'middle_east',
  'turkiye',
  'caucasus',
  'balkans',
] as const

export type ContinentSceneId = (typeof continentSceneIds)[number]
export type FocusSceneId = (typeof focusSceneIds)[number]
export type SceneExtent = [number, number, number, number]

export type SceneSelection = {
  activeContinents: ContinentSceneId[]
  focusPreset: FocusSceneId | null
}

type SceneViewport = {
  center: [number, number]
  zoom: number
}

type ScenePresetDefinition = {
  id: ContinentSceneId | FocusSceneId
  label: string
  type: 'continent' | 'focus'
  extent: SceneExtent
  fitExtent?: SceneExtent
  fitViewport?: SceneViewport
  minZoom?: number
  blobKey: string
  countries?: string[]
  continents?: string[]
}

export const scenePresetRegistry: Record<
  ContinentSceneId | FocusSceneId,
  ScenePresetDefinition
> = {
  europe: {
    id: 'europe',
    label: 'Avrupa',
    type: 'continent',
    extent: [-26, 33, 46, 72],
    fitExtent: [-15, 33, 45, 71],
    fitViewport: {
      center: [14, 50],
      zoom: 3.55,
    },
    minZoom: 3.15,
    blobKey: 'continents/europe.pmtiles',
    countries: [
      'ALB', 'AND', 'AUT', 'BEL', 'BGR', 'BIH', 'BLR', 'CHE', 'CYP', 'CZE', 'DEU',
      'DNK', 'ESP', 'EST', 'FIN', 'FRA', 'GBR', 'GRC', 'HRV', 'HUN', 'IRL', 'ISL',
      'ITA', 'KOS', 'LIE', 'LTU', 'LUX', 'LVA', 'MDA', 'MKD', 'MLT', 'MCO', 'MNE',
      'NLD', 'NOR', 'POL', 'PRT', 'ROU', 'SMR', 'SRB', 'SVK', 'SVN', 'SWE',
      'UKR', 'VAT',
    ],
  },
  africa: {
    id: 'africa',
    label: 'Afrika',
    type: 'continent',
    extent: [-20, -36, 55, 38],
    blobKey: 'continents/africa.pmtiles',
    continents: ['Africa'],
  },
  asia: {
    id: 'asia',
    label: 'Asya',
    type: 'continent',
    extent: [25, -11, 180, 82],
    blobKey: 'continents/asia.pmtiles',
    continents: ['Asia'],
  },
  north_america: {
    id: 'north_america',
    label: 'K. Amerika',
    type: 'continent',
    extent: [-172, 4, -12, 86],
    fitExtent: [-168, 8, -42, 79],
    fitViewport: {
      center: [-101, 49],
      zoom: 2.85,
    },
    minZoom: 2.55,
    blobKey: 'continents/north-america.pmtiles',
    countries: [
      'ATG', 'BHS', 'BLZ', 'BRB', 'CAN', 'CRI', 'CUB', 'DMA', 'DOM', 'GRD', 'GRL',
      'GTM', 'HND', 'HTI', 'JAM', 'KNA', 'LCA', 'MEX', 'NIC', 'PAN', 'SLV', 'TTO',
      'USA', 'VCT',
    ],
  },
  south_america: {
    id: 'south_america',
    label: 'G. Amerika',
    type: 'continent',
    extent: [-93, -57, -25, 18],
    blobKey: 'continents/south-america.pmtiles',
    continents: ['South America'],
  },
  oceania: {
    id: 'oceania',
    label: 'Okyanusya',
    type: 'continent',
    extent: [95, -55, 180, 21],
    fitExtent: [108, -52, 180, 12],
    fitViewport: {
      center: [149, -22],
      zoom: 3.2,
    },
    minZoom: 2.9,
    blobKey: 'continents/oceania.pmtiles',
    countries: [
      'AUS', 'FJI', 'FSM', 'KIR', 'MHL', 'NRU', 'NZL', 'PLW', 'PNG', 'SLB', 'TON',
      'TUV', 'VUT', 'WSM',
    ],
  },
  middle_east: {
    id: 'middle_east',
    label: 'Orta Doğu',
    type: 'focus',
    extent: [24, 10, 66, 43],
    blobKey: 'focus/middle-east.pmtiles',
    countries: ['TUR', 'IRN', 'IRQ', 'SYR', 'ISR', 'PSE', 'LBN', 'JOR', 'EGY', 'SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'OMN', 'YEM'],
  },
  turkiye: {
    id: 'turkiye',
    label: 'Türkiye',
    type: 'focus',
    extent: [25, 35, 45.5, 43],
    blobKey: 'focus/turkiye.pmtiles',
    countries: ['TUR'],
  },
  caucasus: {
    id: 'caucasus',
    label: 'Kafkasya',
    type: 'focus',
    extent: [29.5, 38, 52.5, 49.5],
    fitExtent: [35, 38.5, 51.2, 47.8],
    fitViewport: {
      center: [43.8, 42.6],
      zoom: 5.35,
    },
    minZoom: 4.7,
    blobKey: 'focus/caucasus.pmtiles',
    countries: ['ARM', 'AZE', 'GEO'],
  },
  balkans: {
    id: 'balkans',
    label: 'Balkanlar',
    type: 'focus',
    extent: [12, 36, 31, 49],
    blobKey: 'focus/balkans.pmtiles',
    countries: ['ALB', 'BIH', 'BGR', 'HRV', 'GRC', 'KOS', 'MNE', 'MKD', 'ROU', 'SRB', 'SVN', 'TUR'],
  },
}

export const defaultSceneSelection: SceneSelection = {
  activeContinents: [],
  focusPreset: null,
}

export function hasActiveSceneSelection(scene: SceneSelection) {
  return scene.focusPreset !== null || scene.activeContinents.length > 0
}

export function getSceneSelectionLabelList(scene: SceneSelection) {
  if (scene.focusPreset) {
    return [scenePresetRegistry[scene.focusPreset].label]
  }

  return scene.activeContinents.map((id) => scenePresetRegistry[id].label)
}

export function getActiveScenePreset(scene: SceneSelection) {
  if (scene.focusPreset) {
    return scenePresetRegistry[scene.focusPreset]
  }

  if (scene.activeContinents.length === 1) {
    return scenePresetRegistry[scene.activeContinents[0]]
  }

  return null
}

export function getSceneSelectionViewport(scene: SceneSelection) {
  return getActiveScenePreset(scene)?.fitViewport ?? null
}

export function getSceneSelectionMinZoom(scene: SceneSelection) {
  return getActiveScenePreset(scene)?.minZoom ?? 1
}

export function getSceneSelectionExtent(
  scene: SceneSelection,
  mode: 'render' | 'fit' = 'render',
): SceneExtent | null {
  const selectedIds =
    scene.focusPreset !== null ? [scene.focusPreset] : scene.activeContinents

  if (selectedIds.length === 0) {
    return null
  }

  return selectedIds.reduce<SceneExtent | null>((combined, id) => {
    const preset = scenePresetRegistry[id]
    const next = mode === 'fit' ? preset.fitExtent ?? preset.extent : preset.extent
    if (!combined) {
      return [...next] as SceneExtent
    }

    return [
      Math.min(combined[0], next[0]),
      Math.min(combined[1], next[1]),
      Math.max(combined[2], next[2]),
      Math.max(combined[3], next[3]),
    ]
  }, null)
}

export function getSceneManifestEntries() {
  return [...continentSceneIds, ...focusSceneIds].map((id) => ({
    id,
    label: scenePresetRegistry[id].label,
    type: scenePresetRegistry[id].type,
    extent: scenePresetRegistry[id].extent,
    blobKey: scenePresetRegistry[id].blobKey,
  }))
}

export function isSceneCompatibleOpenFreeMapPreset(preset: string) {
  return preset.startsWith('openfreemap_')
}
