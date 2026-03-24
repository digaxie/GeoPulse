import type { ScenarioDocument } from '@/features/scenario/model'

type OpenFreeMapPreset = Extract<
  ScenarioDocument['basemap']['preset'],
  'openfreemap_liberty' | 'openfreemap_bright' | 'openfreemap_positron'
>

export const OPENFREEMAP_STYLE_URLS: Record<OpenFreeMapPreset, string> = {
  openfreemap_liberty: 'https://tiles.openfreemap.org/styles/liberty',
  openfreemap_bright: 'https://tiles.openfreemap.org/styles/bright',
  openfreemap_positron: 'https://tiles.openfreemap.org/styles/positron',
}

export const OPENFREEMAP_LABELS: Record<OpenFreeMapPreset, string> = {
  openfreemap_liberty: 'OpenFreeMap Liberty',
  openfreemap_bright: 'OpenFreeMap Bright',
  openfreemap_positron: 'OpenFreeMap Positron',
}

export function isOpenFreeMapPreset(
  preset: ScenarioDocument['basemap']['preset'],
): preset is OpenFreeMapPreset {
  return (
    preset === 'openfreemap_liberty' ||
    preset === 'openfreemap_bright' ||
    preset === 'openfreemap_positron'
  )
}

export function getOpenFreeMapStyleUrl(
  preset: ScenarioDocument['basemap']['preset'],
) {
  return isOpenFreeMapPreset(preset)
    ? OPENFREEMAP_STYLE_URLS[preset]
    : OPENFREEMAP_STYLE_URLS.openfreemap_liberty
}
