import { useEffect, useState } from 'react'

import {
  formatAlertShelterInstruction,
  formatTimelineDualTime,
  getAlertTypeLabel,
  getTimelineItemColor,
  getTimelineItemIcon,
  groupAlertCitiesByZone,
  type RocketAlert,
} from '@/features/alerts/types'
import type { EnrichedCity, TzevaadomSystemMessage } from '@/features/alerts/tzevaadomService'

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

type AlertDrawerProps = {
  collapsed: boolean
  enabled: boolean
  historyTruncated: boolean
  items: DrawerCardItem[]
  selectedKey: string | null
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
  onSelectItem: (key: string) => void
  onToggleCollapsed: () => void
}

type DrawerCity = { name: string; lat: number | null; lon: number | null }
type DrawerCityGroup = { zone: string; cities: DrawerCity[] }
const CITY_PREVIEW_LIMIT = 5

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

function isCityFocusable(city: DrawerCity) {
  return city.lat != null && city.lon != null && city.lat !== 0 && city.lon !== 0
}

function getClockText(timestampMs: number) {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(timestampMs)
}

function getDateText(timestampMs: number) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(timestampMs)
}

function DrawerCityPreview({
  color,
  groups,
  itemKey,
  onFocusCity,
}: {
  color: 'red' | 'green' | 'orange' | 'blue'
  groups: DrawerCityGroup[]
  itemKey: string
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
}) {
  const cities = getPreviewCities(groups)
  const visibleCities = cities.slice(0, CITY_PREVIEW_LIMIT)
  const hiddenCount = cities.length - visibleCities.length

  if (visibleCities.length === 0) {
    return null
  }

  return (
    <div className="alerts-city-chips alert-drawer-city-preview">
      {visibleCities.map((city, index) => {
        const hasCoord = isCityFocusable(city)
        return (
          <button
            key={`${itemKey}-preview-${city.name}-${index}`}
            className={`alerts-city-chip alerts-city-chip-${color}`}
            onClick={(event) => {
              event.stopPropagation()
              if (!hasCoord) {
                return
              }

              onFocusCity({
                lat: city.lat!,
                lon: city.lon!,
                name: city.name,
              })
            }}
            style={hasCoord ? undefined : { cursor: 'default', opacity: 0.55 }}
            type="button"
          >
            {city.name}
          </button>
        )
      })}
      {hiddenCount > 0 ? (
        <span className="alerts-city-chip alerts-city-chip-more">+{hiddenCount} daha</span>
      ) : null}
    </div>
  )
}

function DrawerExpandedGroups({
  color,
  groups,
  itemKey,
  onFocusCity,
}: {
  color: 'red' | 'green' | 'orange' | 'blue'
  groups: DrawerCityGroup[]
  itemKey: string
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
}) {
  if (groups.length === 0) {
    return null
  }

  return (
    <div className="alert-drawer-item-expanded">
      {groups.map((group) => (
        <section className="alert-drawer-item-group" key={`${itemKey}-${group.zone}`}>
          <h4>{group.zone}</h4>
          <div className="alerts-city-chips alert-drawer-city-groups">
            {group.cities.map((city, index) => {
              const hasCoord = isCityFocusable(city)
              return (
                <button
                  key={`${itemKey}-${group.zone}-${city.name}-${index}`}
                  className={`alerts-city-chip alerts-city-chip-${color}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (!hasCoord) {
                      return
                    }

                    onFocusCity({
                      lat: city.lat!,
                      lon: city.lon!,
                      name: city.name,
                    })
                  }}
                  style={hasCoord ? undefined : { cursor: 'default', opacity: 0.55 }}
                  type="button"
                >
                  {city.name}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function AlertDrawer({
  collapsed,
  enabled,
  historyTruncated,
  items,
  selectedKey,
  onFocusCity,
  onSelectItem,
  onToggleCollapsed,
}: AlertDrawerProps) {
  const [now, setNow] = useState(() => Date.now())
  const [localSelectedKey, setLocalSelectedKey] = useState<string | null>(null)

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const hasSelectedKey = selectedKey !== null && items.some((item) => item.key === selectedKey)
  const effectiveSelectedKey =
    (hasSelectedKey ? selectedKey : null) ??
    (localSelectedKey && items.some((item) => item.key === localSelectedKey)
      ? localSelectedKey
      : (items[0]?.key ?? null))
  if (collapsed) {
    return (
      <button
        aria-label="Alarm drawer'ini ac"
        className="alert-drawer-collapsed-handle"
        onClick={onToggleCollapsed}
        type="button"
      >
        {'>'}
      </button>
    )
  }

  return (
    <aside className="alert-drawer">
      <div className="alert-drawer-header">
        <button
          aria-label="Alarm drawer'ini kapat"
          className="alert-drawer-header-toggle"
          onClick={onToggleCollapsed}
          type="button"
        >
          {'<'}
        </button>
        <div className="alert-drawer-header-time">
          <strong>{getClockText(now)}</strong>
          <span>{getDateText(now)}</span>
        </div>
      </div>

      <div className="alert-drawer-section-header">
        <h3>{historyTruncated ? 'Son 24 Saat (kismi)' : 'Son 24 Saat'}</h3>
        <span>{items.length}</span>
      </div>

      {!enabled ? (
        <p className="alert-drawer-empty">Canli alarm feed'i su anda kapali.</p>
      ) : items.length === 0 ? (
        <p className="alert-drawer-empty">Son 24 saatte goruntulenecek olay yok.</p>
      ) : (
        <div className="alert-drawer-list">
          {items.map((item) => {
            const isSelected = item.key === effectiveSelectedKey
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
            const groups = getCardGroups(item)

            return (
              <div className="alerts-card-wrapper alert-drawer-item" key={item.key}>
                <button
                  aria-expanded={isSelected}
                  aria-label={`Alarm olayi: ${getCardTitle(item)}`}
                  className={`alerts-card alerts-card-${color} alert-drawer-timeline-card${isSelected ? ' alerts-card-active alert-drawer-timeline-card-active' : ''}${item.isLive ? ' alerts-card-live' : ''}`}
                  onClick={() => {
                    setLocalSelectedKey(item.key)
                    onSelectItem(item.key)
                  }}
                  type="button"
                >
                  <div className="alerts-card-body">
                    <strong className="alerts-card-title">{getCardTitle(item)}</strong>
                    <span className="alerts-card-time">
                      {formatTimelineDualTime(item.timestampMs, now)}
                    </span>
                    <span className="alerts-card-area">{getCardBody(item)}</span>
                  </div>
                  <span className="alerts-card-icon" aria-hidden="true">
                    {icon}
                  </span>
                </button>

                {!isSelected ? (
                  <DrawerCityPreview
                    color={color}
                    groups={groups}
                    itemKey={item.key}
                    onFocusCity={onFocusCity}
                  />
                ) : null}

                {isSelected ? (
                  <DrawerExpandedGroups
                    color={color}
                    groups={groups}
                    itemKey={item.key}
                    onFocusCity={onFocusCity}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </aside>
  )
}
