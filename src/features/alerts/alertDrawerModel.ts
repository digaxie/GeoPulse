import {
  formatAlertShelterInstruction,
  getAlertTypeLabel,
  getSystemMessageStreamKey,
  getTimelineItemColor,
  getTimelineItemIcon,
  groupAlertCitiesByZone,
  type RocketAlert,
} from '@/features/alerts/types'
import type { EnrichedCity, TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

type DrawerCardColor = 'red' | 'green' | 'orange' | 'blue'

export type DrawerCardItem =
  | {
      key: string
      kind: 'alert'
      timestampMs: number
      isLive: boolean
      alert: RocketAlert
    }
  | {
      key: string
      kind: 'system'
      timestampMs: number
      isLive: boolean
      message: TzevaadomSystemMessage
    }

export type DrawerCity = { name: string; lat: number | null; lon: number | null }
export type DrawerCityGroup = { zone: string; cities: DrawerCity[] }

export type DrawerCardViewModel =
  | {
      key: string
      kind: 'alert'
      alertId: string
      timestampMs: number
      isLive: boolean
      color: DrawerCardColor
      icon: string
      title: string
      body: string
      previewCities: DrawerCity[]
      groups: DrawerCityGroup[]
    }
  | {
      key: string
      kind: 'system'
      systemMessageKey: string
      timestampMs: number
      isLive: boolean
      color: DrawerCardColor
      icon: string
      title: string
      body: string
      previewCities: DrawerCity[]
      groups: DrawerCityGroup[]
    }

const DRAWER_PREVIEW_CITY_LIMIT = 5

function getPreviewCities(groups: DrawerCityGroup[]) {
  return groups.flatMap((group) => group.cities)
}

function groupSystemCitiesByZone(cities: EnrichedCity[] | undefined): DrawerCityGroup[] {
  if (!cities || cities.length === 0) {
    return []
  }

  const groups = new Map<string, DrawerCity[]>()
  for (const city of cities) {
    const zone = city.zone_en?.trim() || 'Unknown zone'
    const nextCity = {
      name: city.en || city.he,
      lat: city.lat,
      lon: city.lng,
    }
    const current = groups.get(zone)
    if (current) {
      current.push(nextCity)
      continue
    }

    groups.set(zone, [nextCity])
  }

  return Array.from(groups.entries()).map(([zone, groupedCities]) => ({
    zone,
    cities: groupedCities,
  }))
}

function getAlertCityGroups(alert: RocketAlert): DrawerCityGroup[] {
  if (alert.citiesDetail && alert.citiesDetail.length > 0) {
    return groupAlertCitiesByZone(alert).map((group) => ({
      zone: group.zone,
      cities: group.cities.map((city) => ({
        name: city.name,
        lat: city.lat,
        lon: city.lon,
      })),
    }))
  }

  return [
    {
      zone: alert.areaNameEn || 'Alert',
      cities: [
        {
          name: alert.englishName || alert.name,
          lat: alert.lat || null,
          lon: alert.lon || null,
        },
      ],
    },
  ]
}

function getCardGroups(item: DrawerCardItem): DrawerCityGroup[] {
  return item.kind === 'alert'
    ? getAlertCityGroups(item.alert)
    : groupSystemCitiesByZone(item.message.citiesEnriched)
}

function getCardTitle(item: DrawerCardItem) {
  if (item.kind === 'alert') {
    return item.alert.areaNameEn || item.alert.englishName || item.alert.name
  }

  return item.message.titleEn || item.message.titleHe || 'System message'
}

function getCardBody(item: DrawerCardItem) {
  if (item.kind === 'alert') {
    return `${getAlertTypeLabel(item.alert.alertTypeId)} - ${formatAlertShelterInstruction(item.alert.countdownSec)}`
  }

  return item.message.bodyEn || item.message.bodyHe || ''
}

export function buildDrawerCardViewModels(items: DrawerCardItem[]): DrawerCardViewModel[] {
  return items.map((item) => {
    const color = getTimelineItemColor(
      item.kind === 'alert'
        ? { kind: 'alert', alert: item.alert, timestampMs: item.timestampMs, isActive: item.isLive }
        : { kind: 'system', message: item.message, timestampMs: item.timestampMs },
    )
    const icon = getTimelineItemIcon(
      item.kind === 'alert'
        ? { kind: 'alert', alert: item.alert, timestampMs: item.timestampMs, isActive: item.isLive }
        : { kind: 'system', message: item.message, timestampMs: item.timestampMs },
    )
    const title = getCardTitle(item)
    const body = getCardBody(item)
    const groups = getCardGroups(item)
    const previewCities = getPreviewCities(groups).slice(0, DRAWER_PREVIEW_CITY_LIMIT)

    if (item.kind === 'alert') {
      return {
        key: item.key,
        kind: 'alert',
        alertId: item.alert.id,
        timestampMs: item.timestampMs,
        isLive: item.isLive,
        color,
        icon,
        title,
        body,
        previewCities,
        groups,
      } satisfies DrawerCardViewModel
    }

    return {
      key: item.key,
      kind: 'system',
      systemMessageKey: getSystemMessageStreamKey(item.message),
      timestampMs: item.timestampMs,
      isLive: item.isLive,
      color,
      icon,
      title,
      body,
      previewCities,
      groups,
    } satisfies DrawerCardViewModel
  })
}
