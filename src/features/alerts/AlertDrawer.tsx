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
              <article
                className={`alert-drawer-card alert-drawer-card-${color}${isSelected ? ' alert-drawer-card-selected' : ''}${item.isLive ? ' alert-drawer-card-live' : ''}`}
                key={item.key}
              >
                <div
                  className="alert-drawer-card-button"
                  onClick={() => {
                    setLocalSelectedKey(item.key)
                    onSelectItem(item.key)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') {
                      return
                    }

                    event.preventDefault()
                    setLocalSelectedKey(item.key)
                    onSelectItem(item.key)
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="alert-drawer-card-main">
                    <strong className="alert-drawer-card-title">{getCardTitle(item)}</strong>
                    <span className="alert-drawer-card-time">
                      {formatTimelineDualTime(item.timestampMs, now)}
                    </span>
                    <span className="alert-drawer-card-body">{getCardBody(item)}</span>
                  </div>
                  <span className="alert-drawer-card-icon" aria-hidden="true">
                    {icon}
                  </span>
                </div>

                {isSelected ? (
                  <div className="alert-drawer-card-expanded">
                    {groups.map((group) => (
                      <section className="alert-drawer-card-group" key={`${item.key}-${group.zone}`}>
                        <h4>{group.zone}</h4>
                        <div className="alert-drawer-card-chips">
                          {group.cities.map((city, index) => {
                            const focusable = isCityFocusable(city)
                            return (
                              <button
                                key={`${item.key}-${group.zone}-${city.name}-${index}`}
                                className={`alert-drawer-card-chip alert-drawer-card-chip-${color}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  if (!focusable) {
                                    return
                                  }

                                  onFocusCity({
                                    lat: city.lat!,
                                    lon: city.lon!,
                                    name: city.name,
                                  })
                                }}
                                style={focusable ? undefined : { cursor: 'default', opacity: 0.55 }}
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
                ) : null}
              </article>
            )
          })}
        </div>
      )}
    </aside>
  )
}
