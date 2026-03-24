import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Style from 'ol/style/Style'
import Text from 'ol/style/Text'
import { Circle as CircleStyle } from 'ol/style'

import type { RocketAlert, RocketAlertTypeId } from '@/features/alerts/types'

export const ALERT_LAYER_Z_INDEX = 24

export function getAlertColor(alertTypeId: RocketAlertTypeId) {
  return alertTypeId === 2 ? '#f97316' : '#ef4444'
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function createAlertStyle(alert: RocketAlert, isRecent: boolean, isSelected: boolean) {
  const color = getAlertColor(alert.alertTypeId)

  return new Style({
    image: new CircleStyle({
      radius: isSelected ? 8 : 6.5,
      fill: new Fill({
        color: isRecent ? hexToRgba(color, 0.94) : hexToRgba(color, 0.82),
      }),
      stroke: new Stroke({
        color: isSelected ? '#ffffff' : hexToRgba('#ffffff', 0.8),
        width: isSelected ? 2.2 : 1.5,
      }),
    }),
    text: new Text({
      font: "600 12px 'IBM Plex Mono', monospace",
      text: alert.englishName,
      offsetY: -18,
      padding: [3, 6, 3, 6],
      fill: new Fill({
        color: '#f8fbff',
      }),
      backgroundFill: new Fill({
        color: isSelected ? hexToRgba(color, 0.94) : 'rgba(13, 27, 46, 0.82)',
      }),
      stroke: new Stroke({
        color: 'rgba(13, 27, 46, 0.65)',
        width: 2,
      }),
    }),
    zIndex: isSelected ? 4 : 3,
  })
}

export function createAlertPulseStyles(color: string, elapsedMs: number) {
  const t = (elapsedMs % 1800) / 1800
  const radius = 10 + t * 18
  const alpha = Math.max(0, 0.42 * (1 - t))

  return [
    new Style({
      image: new CircleStyle({
        radius,
        fill: new Fill({
          color: hexToRgba(color, alpha * 0.14),
        }),
        stroke: new Stroke({
          color: hexToRgba(color, alpha),
          width: 2,
        }),
      }),
    }),
  ]
}
