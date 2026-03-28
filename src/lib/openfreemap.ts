import type { ScenarioDocument } from '@/features/scenario/model'

type OpenFreeMapPreset = Extract<
  ScenarioDocument['basemap']['preset'],
  | 'openfreemap_liberty'
  | 'openfreemap_bright'
  | 'openfreemap_positron'
  | 'openfreemap_dark'
  | 'openfreemap_fiord'
>

export const OPENFREEMAP_STYLE_URLS: Record<OpenFreeMapPreset, string> = {
  openfreemap_liberty: 'https://tiles.openfreemap.org/styles/liberty',
  openfreemap_bright: 'https://tiles.openfreemap.org/styles/bright',
  openfreemap_positron: 'https://tiles.openfreemap.org/styles/positron',
  openfreemap_dark: '/styles/openfreemap/dark.json',
  openfreemap_fiord: '/styles/openfreemap/fiord.json',
}

export const OPENFREEMAP_LABELS: Record<OpenFreeMapPreset, string> = {
  openfreemap_liberty: 'OpenFreeMap Liberty',
  openfreemap_bright: 'OpenFreeMap Bright',
  openfreemap_positron: 'OpenFreeMap Positron',
  openfreemap_dark: 'OpenFreeMap Dark',
  openfreemap_fiord: 'OpenFreeMap Fiord',
}

export function isOpenFreeMapPreset(
  preset: ScenarioDocument['basemap']['preset'],
): preset is OpenFreeMapPreset {
  return (
    preset === 'openfreemap_liberty' ||
    preset === 'openfreemap_bright' ||
    preset === 'openfreemap_positron' ||
    preset === 'openfreemap_dark' ||
    preset === 'openfreemap_fiord'
  )
}

export function getOpenFreeMapStyleUrl(
  preset: ScenarioDocument['basemap']['preset'],
) {
  return isOpenFreeMapPreset(preset)
    ? OPENFREEMAP_STYLE_URLS[preset]
    : OPENFREEMAP_STYLE_URLS.openfreemap_liberty
}
