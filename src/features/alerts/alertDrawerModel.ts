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
export type DrawerEventFamily = 'rocket' | 'drone' | 'early_warning' | 'incident_ended'

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

type GroupableDrawerCardItem = DrawerCardItem & { kind: 'alert' | 'system' }

type DrawerGroupedItem = {
  key: string
  kind: 'group'
  family: DrawerEventFamily
  timestampMs: number
  timeRangeStartMs: number
  timeRangeEndMs: number
  isLive: boolean
  memberItems: GroupableDrawerCardItem[]
}

export type DrawerCity = { name: string; lat: number | null; lon: number | null }
export type DrawerCityGroup = { zone: string; cities: DrawerCity[] }

export type DrawerGroupMemberViewModel = {
  key: string
  kind: 'alert' | 'system'
  timestampMs: number
  color: DrawerCardColor
  icon: string
  title: string
  body: string
  groups: DrawerCityGroup[]
}

export type DrawerCardViewModel =
  | {
      key: string
      kind: 'alert'
      family: 'rocket' | 'drone'
      alertId: string
      timestampMs: number
      isLive: boolean
      color: DrawerCardColor
      icon: string
      title: string
      body: string
      searchText: string
      previewCities: DrawerCity[]
      totalCityCount: number
      groups: DrawerCityGroup[]
    }
  | {
      key: string
      kind: 'system'
      family: 'early_warning' | 'incident_ended'
      systemMessageKey: string
      timestampMs: number
      isLive: boolean
      color: DrawerCardColor
      icon: string
      title: string
      body: string
      searchText: string
      previewCities: DrawerCity[]
      totalCityCount: number
      groups: DrawerCityGroup[]
    }
  | {
      key: string
      kind: 'group'
      family: DrawerEventFamily
      timestampMs: number
      timeRangeStartMs: number
      timeRangeEndMs: number
      isLive: boolean
      color: DrawerCardColor
      icon: string
      title: string
      body: string
      searchText: string
      previewCities: DrawerCity[]
      totalCityCount: number
      memberAlertIds: string[]
      memberSystemMessageKeys: string[]
      members: DrawerGroupMemberViewModel[]
    }

const DRAWER_PREVIEW_CITY_LIMIT = 5
const DRAWER_GROUPING_WINDOW_MS = 60_000

export function normalizeDrawerSearchText(value: string) {
  return value.normalize('NFC').trim().toLowerCase()
}

function sortDrawerItemsByNewest<T extends { key: string; timestampMs: number }>(items: T[]) {
  return [...items].sort((left, right) => {
    if (right.timestampMs !== left.timestampMs) {
      return right.timestampMs - left.timestampMs
    }

    return right.key.localeCompare(left.key, 'en')
  })
}

function getPreviewCities(groups: DrawerCityGroup[]) {
  return groups.flatMap((group) => group.cities)
}

function getUniqueCities(cities: DrawerCity[]) {
  const seen = new Set<string>()
  const nextCities: DrawerCity[] = []

  for (const city of cities) {
    const key = [
      city.name.trim().toLowerCase(),
      city.lat ?? 'na',
      city.lon ?? 'na',
    ].join('|')
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    nextCities.push(city)
  }

  return nextCities
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

function getAlertFamily(alert: RocketAlert): 'rocket' | 'drone' {
  return alert.alertTypeId === 2 ? 'drone' : 'rocket'
}

function getSystemFamily(message: TzevaadomSystemMessage): 'early_warning' | 'incident_ended' | null {
  if (message.type === 'early_warning' || message.type === 'incident_ended') {
    return message.type
  }

  return null
}

function getItemFamily(item: DrawerCardItem): DrawerEventFamily | null {
  if (item.kind === 'alert') {
    return getAlertFamily(item.alert)
  }

  return getSystemFamily(item.message)
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

function buildStandaloneColor(item: DrawerCardItem): DrawerCardColor {
  return getTimelineItemColor(
    item.kind === 'alert'
      ? { kind: 'alert', alert: item.alert, timestampMs: item.timestampMs, isActive: item.isLive }
      : { kind: 'system', message: item.message, timestampMs: item.timestampMs },
  )
}

function buildStandaloneIcon(item: DrawerCardItem): string {
  return getTimelineItemIcon(
    item.kind === 'alert'
      ? { kind: 'alert', alert: item.alert, timestampMs: item.timestampMs, isActive: item.isLive }
      : { kind: 'system', message: item.message, timestampMs: item.timestampMs },
  )
}

function buildStandaloneSearchText(title: string, body: string, groups: DrawerCityGroup[]) {
  return normalizeDrawerSearchText([
    title,
    body,
    ...groups.flatMap((group) => [group.zone, ...group.cities.map((city) => city.name)]),
  ].join(' '))
}

function buildStandaloneViewModel(item: DrawerCardItem): Extract<DrawerCardViewModel, { kind: 'alert' | 'system' }> {
  const color = buildStandaloneColor(item)
  const icon = buildStandaloneIcon(item)
  const title = getCardTitle(item)
  const body = getCardBody(item)
  const groups = getCardGroups(item)
  const allCities = getUniqueCities(getPreviewCities(groups))
  const previewCities = allCities.slice(0, DRAWER_PREVIEW_CITY_LIMIT)
  const searchText = buildStandaloneSearchText(title, body, groups)

  if (item.kind === 'alert') {
    return {
      key: item.key,
      kind: 'alert',
      family: getAlertFamily(item.alert),
      alertId: item.alert.id,
      timestampMs: item.timestampMs,
      isLive: item.isLive,
      color,
      icon,
      title,
      body,
      searchText,
      previewCities,
      totalCityCount: allCities.length,
      groups,
    }
  }

  const family = getSystemFamily(item.message)
  if (!family) {
    throw new Error(`Unexpected system message family for drawer item ${item.key}`)
  }

  return {
    key: item.key,
    kind: 'system',
    family,
    systemMessageKey: getSystemMessageStreamKey(item.message),
    timestampMs: item.timestampMs,
    isLive: item.isLive,
    color,
    icon,
    title,
    body,
    searchText,
    previewCities,
    totalCityCount: allCities.length,
    groups,
  }
}

function getGroupFamilyLabel(family: DrawerEventFamily) {
  switch (family) {
    case 'rocket':
      return 'Roket'
    case 'drone':
      return 'İHA'
    case 'early_warning':
      return 'Erken uyarı'
    case 'incident_ended':
      return 'Olay sonu'
  }
}

function getGroupZoneTitle(memberViews: DrawerGroupMemberViewModel[]) {
  const zones: string[] = []
  const seen = new Set<string>()

  for (const member of memberViews) {
    for (const group of member.groups) {
      const zone = group.zone.trim()
      if (!zone) {
        continue
      }

      const key = zone.toLowerCase()
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      zones.push(zone)
    }
  }

  if (zones.length === 0) {
    for (const member of memberViews) {
      const fallback = member.title.trim()
      if (!fallback) {
        continue
      }

      const key = fallback.toLowerCase()
      if (seen.has(key)) {
        continue
      }

      seen.add(key)
      zones.push(fallback)
    }
  }

  if (zones.length <= 3) {
    return zones.join(', ')
  }

  return `${zones.slice(0, 3).join(', ')}, +${zones.length - 3} bölge`
}

function buildGroupSearchText(
  title: string,
  body: string,
  memberViews: DrawerGroupMemberViewModel[],
  previewCities: DrawerCity[],
) {
  return normalizeDrawerSearchText([
    title,
    body,
    ...memberViews.flatMap((member) => [
      member.title,
      member.body,
      ...member.groups.flatMap((group) => [group.zone, ...group.cities.map((city) => city.name)]),
    ]),
    ...previewCities.map((city) => city.name),
  ].join(' '))
}

function buildGroupedFamilyItems(
  family: DrawerEventFamily,
  items: GroupableDrawerCardItem[],
): Array<DrawerCardItem | DrawerGroupedItem> {
  const groupedItems: Array<DrawerCardItem | DrawerGroupedItem> = []

  for (let index = 0; index < items.length; index += 1) {
    const first = items[index]
    if (!first) {
      continue
    }

    const members: GroupableDrawerCardItem[] = [first]
    let nextIndex = index + 1

    while (nextIndex < items.length) {
      const candidate = items[nextIndex]
      if (!candidate) {
        break
      }

      const previousMember = members[members.length - 1] ?? first
      if (previousMember.timestampMs - candidate.timestampMs > DRAWER_GROUPING_WINDOW_MS) {
        break
      }

      members.push(candidate)
      nextIndex += 1
    }

    if (members.length === 1) {
      groupedItems.push(first)
    } else {
      groupedItems.push({
        key: `group:${family}:${first.timestampMs}:${members.map((member) => member.key).join('|')}`,
        kind: 'group',
        family,
        timestampMs: first.timestampMs,
        timeRangeStartMs: members[members.length - 1]?.timestampMs ?? first.timestampMs,
        timeRangeEndMs: first.timestampMs,
        isLive: members.some((member) => member.isLive),
        memberItems: members,
      })
    }

    index = nextIndex - 1
  }

  return groupedItems
}

function groupDrawerItems(items: DrawerCardItem[]) {
  const sortedItems = sortDrawerItemsByNewest(items)
  const itemsByFamily = new Map<DrawerEventFamily, GroupableDrawerCardItem[]>()
  const standaloneItems: Array<DrawerCardItem | DrawerGroupedItem> = []

  for (const item of sortedItems) {
    const family = getItemFamily(item)
    if (!family) {
      standaloneItems.push(item)
      continue
    }

    const familyItems = itemsByFamily.get(family)
    if (familyItems) {
      familyItems.push(item)
      continue
    }

    itemsByFamily.set(family, [item])
  }

  for (const [family, familyItems] of itemsByFamily.entries()) {
    standaloneItems.push(...buildGroupedFamilyItems(family, familyItems))
  }

  return sortDrawerItemsByNewest(standaloneItems)
}

function buildGroupViewModel(item: DrawerGroupedItem): Extract<DrawerCardViewModel, { kind: 'group' }> {
  const memberViews = item.memberItems.map((member) => {
    const view = buildStandaloneViewModel(member)
    return {
      key: view.key,
      kind: view.kind,
      timestampMs: view.timestampMs,
      color: view.color,
      icon: view.icon,
      title: view.title,
      body: view.body,
      groups: view.groups,
    } satisfies DrawerGroupMemberViewModel
  })

  const uniqueCities = getUniqueCities(
    memberViews.flatMap((member) =>
      member.groups.flatMap((group) => group.cities),
    ),
  )
  const previewCities = uniqueCities.slice(0, DRAWER_PREVIEW_CITY_LIMIT)
  const title = getGroupZoneTitle(memberViews)
  const body = `${getGroupFamilyLabel(item.family)} • ${memberViews.length} olay • ${uniqueCities.length} şehir`
  const searchText = buildGroupSearchText(title, body, memberViews, uniqueCities)
  const firstMember = memberViews[0]

  return {
    key: item.key,
    kind: 'group',
    family: item.family,
    timestampMs: item.timestampMs,
    timeRangeStartMs: item.timeRangeStartMs,
    timeRangeEndMs: item.timeRangeEndMs,
    isLive: item.isLive,
    color: firstMember?.color ?? 'red',
    icon: firstMember?.icon ?? '•',
    title,
    body,
    searchText,
    previewCities,
    totalCityCount: uniqueCities.length,
    memberAlertIds: item.memberItems
      .filter((member): member is Extract<DrawerCardItem, { kind: 'alert' }> => member.kind === 'alert')
      .map((member) => member.alert.id),
    memberSystemMessageKeys: item.memberItems
      .filter((member): member is Extract<DrawerCardItem, { kind: 'system' }> => member.kind === 'system')
      .map((member) => getSystemMessageStreamKey(member.message)),
    members: memberViews,
  }
}

export function buildDrawerCardViewModels(items: DrawerCardItem[]): DrawerCardViewModel[] {
  return groupDrawerItems(items).map((item) =>
    item.kind === 'group' ? buildGroupViewModel(item) : buildStandaloneViewModel(item),
  )
}
