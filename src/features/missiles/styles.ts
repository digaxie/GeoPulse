import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'
import Text from 'ol/style/Text'
import { Circle as CircleStyle, RegularShape } from 'ol/style'

import type { MissileCountry } from '@/features/missiles/types'

export const MISSILE_LAYER_Z_INDEX = 22

export const MISSILE_COUNTRY_COLORS: Record<
  MissileCountry,
  {
    fill: string
    stroke: string
    solid: string
    trail: string
  }
> = {
  iran: {
    fill: 'rgba(220, 38, 38, 0.12)',
    stroke: 'rgba(220, 38, 38, 0.7)',
    solid: '#dc2626',
    trail: '#fb7185',
  },
  israel: {
    fill: 'rgba(37, 99, 235, 0.12)',
    stroke: 'rgba(37, 99, 235, 0.7)',
    solid: '#2563eb',
    trail: '#60a5fa',
  },
}

const MISSILE_COUNTRY_VARIANTS: Record<
  MissileCountry,
  Array<{
    solid: string
    trail: string
  }>
> = {
  iran: [
    { solid: '#dc2626', trail: '#fb7185' },
    { solid: '#f97316', trail: '#fdba74' },
    { solid: '#e11d48', trail: '#f472b6' },
    { solid: '#b91c1c', trail: '#fca5a5' },
    { solid: '#ef4444', trail: '#fecaca' },
  ],
  israel: [
    { solid: '#2563eb', trail: '#60a5fa' },
    { solid: '#0ea5e9', trail: '#67e8f9' },
    { solid: '#4f46e5', trail: '#a5b4fc' },
    { solid: '#0891b2', trail: '#7dd3fc' },
    { solid: '#3b82f6', trail: '#bfdbfe' },
  ],
}

function hashKey(input: string) {
  let hash = 0
  for (const chunk of input) {
    hash = (hash * 31 + chunk.charCodeAt(0)) >>> 0
  }
  return hash
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const safe =
    normalized.length === 3
      ? normalized
          .split('')
          .map((chunk) => `${chunk}${chunk}`)
          .join('')
      : normalized
  const red = Number.parseInt(safe.slice(0, 2), 16)
  const green = Number.parseInt(safe.slice(2, 4), 16)
  const blue = Number.parseInt(safe.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function getMissileVisualPalette(country: MissileCountry, key: string) {
  const variants = MISSILE_COUNTRY_VARIANTS[country]
  const variant = variants[hashKey(key) % variants.length]

  return {
    solid: variant.solid,
    trail: variant.trail,
    fill: hexToRgba(variant.solid, 0.12),
    stroke: hexToRgba(variant.solid, 0.7),
    halo: hexToRgba(variant.solid, 0.26),
  }
}

export function createRangeStyle(country: MissileCountry, label: string) {
  const palette = MISSILE_COUNTRY_COLORS[country]

  return new Style({
    fill: new Fill({ color: palette.fill }),
    stroke: new Stroke({
      color: palette.stroke,
      width: 2,
      lineDash: [10, 6],
    }),
    text: new Text({
      text: label,
      font: '700 12px "IBM Plex Mono", monospace',
      padding: [4, 8, 4, 8],
      fill: new Fill({ color: '#ffffff' }),
      backgroundFill: new Fill({ color: 'rgba(13, 27, 46, 0.84)' }),
      backgroundStroke: new Stroke({ color: 'rgba(255, 255, 255, 0.16)', width: 1 }),
      offsetY: -10,
    }),
  })
}

export function createTargetStyle(options: { inRange: boolean; label: string }) {
  const color = options.inRange ? '#22c55e' : '#ef4444'

  return [
    new Style({
      image: new CircleStyle({
        radius: 7,
        fill: new Fill({ color }),
        stroke: new Stroke({ color: '#ffffff', width: 2 }),
      }),
    }),
    new Style({
      image: new RegularShape({
        points: 4,
        radius: 12,
        radius2: 6,
        angle: Math.PI / 4,
        fill: new Fill({ color: `${color}26` }),
        stroke: new Stroke({ color, width: 1.5 }),
      }),
      text: new Text({
        text: options.label,
        offsetY: -20,
        font: '700 12px "IBM Plex Mono", monospace',
        padding: [4, 8, 4, 8],
        fill: new Fill({ color: '#ffffff' }),
        backgroundFill: new Fill({ color: 'rgba(13, 27, 46, 0.9)' }),
        backgroundStroke: new Stroke({ color: 'rgba(255, 255, 255, 0.16)', width: 1 }),
      }),
    }),
  ]
}

export function createFlightTargetStyle(color: string, label?: string) {
  const styles = [
    new Style({
      image: new CircleStyle({
        radius: 6,
        fill: new Fill({ color: hexToRgba(color, 0.18) }),
        stroke: new Stroke({ color, width: 2.2 }),
      }),
    }),
    new Style({
      image: new RegularShape({
        points: 4,
        radius: 11,
        radius2: 6,
        angle: Math.PI / 4,
        fill: new Fill({ color: hexToRgba(color, 0.12) }),
        stroke: new Stroke({ color, width: 1.4 }),
      }),
    }),
  ]

  if (!label) {
    return styles
  }

  return [
    ...styles,
    new Style({
      text: new Text({
        text: label,
        offsetY: -18,
        font: '700 11px "IBM Plex Mono", monospace',
        padding: [3, 7, 3, 7],
        fill: new Fill({ color: '#ffffff' }),
        backgroundFill: new Fill({ color: 'rgba(13, 27, 46, 0.88)' }),
        backgroundStroke: new Stroke({ color: hexToRgba(color, 0.85), width: 1 }),
      }),
    }),
  ]
}

export function createLaunchSiteStyle(country: MissileCountry) {
  const palette = MISSILE_COUNTRY_COLORS[country]

  return new Style({
    image: new CircleStyle({
      radius: 5,
      fill: new Fill({ color: palette.solid }),
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
    }),
  })
}

export function createImpactRingStyle(color: string) {
  return new Style({
    stroke: new Stroke({
      color,
      width: 2,
    }),
  })
}

export function createFlightGlyphStyle(color: string) {
  return new Style({
    image: new RegularShape({
      points: 3,
      radius: 10,
      rotation: Math.PI / 2,
      fill: new Fill({ color }),
      stroke: new Stroke({ color: '#ffffff', width: 1.5 }),
    }),
  })
}
