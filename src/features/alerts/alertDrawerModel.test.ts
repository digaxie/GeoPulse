import { describe, expect, it } from 'vitest'

import { buildDrawerCardViewModels, type DrawerCardItem } from '@/features/alerts/alertDrawerModel'
import type { RocketAlert } from '@/features/alerts/types'
import type { TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

const baseAlert: RocketAlert = {
  id: 'alert-base',
  name: 'Alert',
  englishName: 'City',
  lat: 33.1,
  lon: 35.1,
  alertTypeId: 1,
  countdownSec: 30,
  areaNameEn: 'Upper Galilee',
  timeStampRaw: '2026-03-27T09:49:40.000Z',
  occurredAtMs: Date.UTC(2026, 2, 27, 9, 49, 40),
  fetchedAtMs: Date.UTC(2026, 2, 27, 9, 49, 41),
  taCityId: null,
  citiesDetail: [
    { name: 'Yaara', lat: 33.08, lon: 35.22, zone: 'Upper Galilee', countdown: 30 },
  ],
}

const baseSystemMessage: TzevaadomSystemMessage = {
  id: 11,
  type: 'early_warning',
  time: '12:49',
  titleEn: 'Home Front Command - Early Warning',
  titleHe: '',
  bodyEn: 'Possible hostile aircraft activity.',
  bodyHe: '',
  bodyAr: '',
  receivedAtMs: Date.UTC(2026, 2, 27, 9, 49, 40),
  citiesEnriched: [
    { en: 'Nahariya', he: '', lat: 33.01, lng: 35.09, zone_en: 'Western Galilee', countdown: 0 },
  ],
}

function createRocketAlert(id: string, offsetMs: number, zone: string, city: string): DrawerCardItem {
  return {
    key: `alert:${id}`,
    kind: 'alert',
    timestampMs: baseAlert.occurredAtMs + offsetMs,
    isLive: false,
    alert: {
      ...baseAlert,
      id,
      areaNameEn: zone,
      englishName: city,
      occurredAtMs: baseAlert.occurredAtMs + offsetMs,
      fetchedAtMs: baseAlert.fetchedAtMs + offsetMs,
      citiesDetail: [
        { name: city, lat: 33.08 + offsetMs / 10000000, lon: 35.22, zone, countdown: 30 },
      ],
    },
  }
}

function createDroneAlert(id: string, offsetMs: number, zone: string, city: string): DrawerCardItem {
  const rocketItem = createRocketAlert(id, offsetMs, zone, city) as Extract<DrawerCardItem, { kind: 'alert' }>
  return {
    ...rocketItem,
    alert: {
      ...rocketItem.alert,
      alertTypeId: 2,
      countdownSec: 0,
    },
  }
}

function createSystemItem(
  id: number,
  type: 'early_warning' | 'incident_ended',
  offsetMs: number,
  zone: string,
  city: string,
): DrawerCardItem {
  return {
    key: `system:${id}:${type}:${baseSystemMessage.receivedAtMs + offsetMs}`,
    kind: 'system',
    timestampMs: baseSystemMessage.receivedAtMs + offsetMs,
    isLive: false,
    message: {
      ...baseSystemMessage,
      id,
      type,
      receivedAtMs: baseSystemMessage.receivedAtMs + offsetMs,
      titleEn:
        type === 'incident_ended'
          ? 'Home Front Command - Incident Ended'
          : 'Home Front Command - Early Warning',
      bodyEn:
        type === 'incident_ended'
          ? 'The incident has ended.'
          : 'Possible hostile aircraft activity.',
      citiesEnriched: [
        { en: city, he: '', lat: 33.01 + offsetMs / 10000000, lng: 35.09, zone_en: zone, countdown: 0 },
      ],
    },
  }
}

describe('buildDrawerCardViewModels', () => {
  it('groups same-family rocket alerts inside a 60 second rolling window', () => {
    const items = [
      createRocketAlert('rocket-1', 30_000, 'Confrontation Line', 'Arab Al-Aramshe'),
      createRocketAlert('rocket-2', 0, 'Upper Galilee', 'Yaara'),
    ]

    const models = buildDrawerCardViewModels(items)

    expect(models).toHaveLength(1)
    expect(models[0]?.kind).toBe('group')
    expect(models[0]?.family).toBe('rocket')
    if (models[0]?.kind !== 'group') throw new Error('Expected rocket group')
    expect(models[0].memberAlertIds).toEqual(['rocket-1', 'rocket-2'])
    expect(models[0].title).toContain('Confrontation Line')
    expect(models[0].title).toContain('Upper Galilee')
  })

  it('groups same-family drone alerts inside a 60 second rolling window', () => {
    const models = buildDrawerCardViewModels([
      createDroneAlert('drone-1', 45_000, 'Northern Negev', 'Lahav'),
      createDroneAlert('drone-2', 5_000, 'Northern Negev', 'Eshkolot'),
    ])

    expect(models).toHaveLength(1)
    expect(models[0]?.kind).toBe('group')
    expect(models[0]?.family).toBe('drone')
  })

  it('keeps grouping same-family items even when other families are interleaved in the mixed list', () => {
    const models = buildDrawerCardViewModels([
      createRocketAlert('rocket-1', 50_000, 'Confrontation Line', 'Misgav Am'),
      createSystemItem(21, 'early_warning', 25_000, 'Upper Galilee', 'Nahariya'),
      createRocketAlert('rocket-2', 10_000, 'Confrontation Line', 'Kiryat Shmona'),
    ])

    expect(models).toHaveLength(2)
    expect(models[0]?.kind).toBe('group')
    expect(models[0]?.family).toBe('rocket')
    expect(models[1]?.kind).toBe('system')
    if (models[0]?.kind !== 'group') throw new Error('Expected rocket group')
    expect(models[0].memberAlertIds).toEqual(['rocket-1', 'rocket-2'])
  })

  it('groups early warning and incident ended events only with their own family', () => {
    const models = buildDrawerCardViewModels([
      createSystemItem(11, 'early_warning', 30_000, 'Western Galilee', 'Nahariya'),
      createSystemItem(12, 'early_warning', 5_000, 'Upper Galilee', 'Malkia'),
      createSystemItem(13, 'incident_ended', -90_000, 'Upper Galilee', 'Shlomi'),
    ])

    expect(models).toHaveLength(2)
    expect(models[0]?.kind).toBe('group')
    expect(models[0]?.family).toBe('early_warning')
    expect(models[1]?.kind).toBe('system')
    expect(models[1]?.family).toBe('incident_ended')
  })

  it('does not group same-family items when the oldest-newest gap exceeds 60 seconds', () => {
    const models = buildDrawerCardViewModels([
      createRocketAlert('rocket-1', 61_000, 'Confrontation Line', 'Arab Al-Aramshe'),
      createRocketAlert('rocket-2', 0, 'Upper Galilee', 'Yaara'),
    ])

    expect(models).toHaveLength(2)
    expect(models.every((model) => model.kind !== 'group')).toBe(true)
  })
})
