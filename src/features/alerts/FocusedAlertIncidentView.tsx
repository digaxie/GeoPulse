import { useEffect, useMemo, useState } from 'react'

import {
  formatAlertTimeOnlyTr,
  getAlertCityCount,
  getAlertTypeLabel,
  getAlertZoneCount,
  groupAlertCitiesByZone,
  type AlertIncidentDockItem,
} from '@/features/alerts/types'
import type { EnrichedCity } from '@/features/alerts/tzevaadomService'

type FocusedAlertIncidentViewProps = {
  focusedItem: AlertIncidentDockItem
  streamItems: AlertIncidentDockItem[]
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
  onSelectStreamItem: (key: string) => void
  onDismiss: () => void
  variant: 'overlay' | 'sidebar'
}

type DockTone = 'red' | 'green' | 'orange'
type CityGroup = {
  zone: string
  cities: { name: string; lat: number; lon: number }[]
}

function getSystemTone(type: string): DockTone {
  return type === 'incident_ended' ? 'green' : 'orange'
}

function getSystemTypeLabel(type: string) {
  return type === 'incident_ended' ? 'Olay sonu' : 'Erken uyari'
}

function groupSystemCitiesByZone(cities: EnrichedCity[] | undefined): CityGroup[] {
  if (!cities || cities.length === 0) {
    return []
  }

  const groups = new Map<string, CityGroup['cities']>()
  for (const city of cities) {
    if (city.lat == null || city.lng == null) {
      continue
    }

    const zone = city.zone_en?.trim() || 'Bilinmeyen bolge'
    const existing = groups.get(zone)
    const normalizedCity = {
      name: city.en || city.he,
      lat: city.lat,
      lon: city.lng,
    }

    if (existing) {
      existing.push(normalizedCity)
      continue
    }

    groups.set(zone, [normalizedCity])
  }

  return Array.from(groups.entries()).map(([zone, groupedCities]) => ({
    zone,
    cities: groupedCities,
  }))
}

function getFocusedTone(item: AlertIncidentDockItem): DockTone {
  return item.kind === 'alert' ? 'red' : getSystemTone(item.message.type)
}

function getFocusedSummary(item: AlertIncidentDockItem) {
  if (item.kind === 'alert') {
    const cityCount = getAlertCityCount(item.alert)
    const zoneCount = getAlertZoneCount(item.alert)
    return [
      formatAlertTimeOnlyTr(item.receivedAtMs),
      getAlertTypeLabel(item.alert.alertTypeId),
      `${cityCount} sehir`,
      zoneCount > 1 ? `${zoneCount} bolge` : null,
    ]
      .filter(Boolean)
      .join(' • ')
  }

  const cityCount = item.message.citiesEnriched?.length ?? 0
  const zoneCount = groupSystemCitiesByZone(item.message.citiesEnriched).length
  return [
    formatAlertTimeOnlyTr(item.receivedAtMs),
    getSystemTypeLabel(item.message.type),
    cityCount > 0 ? `${cityCount} sehir` : null,
    zoneCount > 1 ? `${zoneCount} bolge` : null,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getStreamSummary(item: AlertIncidentDockItem) {
  if (item.kind === 'alert') {
    const cityCount = getAlertCityCount(item.alert)
    const zoneCount = getAlertZoneCount(item.alert)
    return [
      formatAlertTimeOnlyTr(item.receivedAtMs),
      getAlertTypeLabel(item.alert.alertTypeId),
      `${cityCount} sehir`,
      zoneCount > 1 ? `${zoneCount} bolge` : null,
    ]
      .filter(Boolean)
      .join(' • ')
  }

  const cityCount = item.message.citiesEnriched?.length ?? 0
  const zoneCount = groupSystemCitiesByZone(item.message.citiesEnriched).length
  return [
    formatAlertTimeOnlyTr(item.receivedAtMs),
    getSystemTypeLabel(item.message.type),
    cityCount > 0 ? `${cityCount} sehir` : null,
    zoneCount > 1 ? `${zoneCount} bolge` : null,
  ]
    .filter(Boolean)
    .join(' • ')
}

function getFadeOpacity(expiresAtMs: number | null, now: number, receivedAtMs: number) {
  if (expiresAtMs === null || expiresAtMs <= now) {
    return expiresAtMs === null ? 1 : 0
  }

  const lifetimeMs = Math.max(1_000, expiresAtMs - receivedAtMs)
  const fadeWindowMs = Math.max(Math.min(Math.round(lifetimeMs * 0.25), 8_000), 1_000)
  const fadeStartsAtMs = expiresAtMs - fadeWindowMs

  if (now <= fadeStartsAtMs) {
    return 1
  }

  const progress = (expiresAtMs - now) / fadeWindowMs
  return Math.max(0.22, Math.min(1, progress))
}

export function FocusedAlertIncidentView({
  focusedItem,
  streamItems,
  onFocusCity,
  onSelectStreamItem,
  onDismiss,
  variant,
}: FocusedAlertIncidentViewProps) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 1_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  const tone = getFocusedTone(focusedItem)
  const summary = getFocusedSummary(focusedItem)
  const groupedCities = useMemo(
    () =>
      focusedItem.kind === 'alert'
        ? groupAlertCitiesByZone(focusedItem.alert)
        : groupSystemCitiesByZone(focusedItem.message.citiesEnriched),
    [focusedItem],
  )
  const visibleStreamItems = useMemo(
    () => streamItems.filter((item) => item.key !== focusedItem.key),
    [focusedItem.key, streamItems],
  )
  const focusedOpacity = getFadeOpacity(
    focusedItem.expiresAtMs,
    now,
    focusedItem.receivedAtMs,
  )

  return (
    <section
      className={`incident-focus-panel incident-focus-panel-${variant} incident-focus-panel-tone-${tone}`}
    >
      <div
        className="incident-focus-panel-main"
        style={focusedItem.isLive ? { opacity: focusedOpacity } : undefined}
      >
        <div className="incident-focus-panel-header">
          <div>
            <p className="incident-focus-panel-eyebrow">
              {focusedItem.kind === 'alert' ? 'Canli olay' : 'Sistem olayi'}
            </p>
            <h3>{summary}</h3>
          </div>
          <button
            aria-label="Incident panelini kapat"
            className="incident-focus-panel-dismiss"
            onClick={onDismiss}
            type="button"
          >
            ×
          </button>
        </div>

        {focusedItem.kind === 'system' && focusedItem.message.bodyEn ? (
          <p className="incident-focus-system-body">{focusedItem.message.bodyEn}</p>
        ) : null}

        <div className="incident-focus-groups">
          {groupedCities.map((group) => (
            <section className="incident-focus-group" key={group.zone}>
              <h4>{group.zone}</h4>
              <div className="incident-focus-city-chips">
                {group.cities.map((city, index) => (
                  <button
                    key={`${group.zone}-${city.name}-${index}`}
                    className="incident-focus-city-chip"
                    onClick={() => onFocusCity({ lat: city.lat, lon: city.lon, name: city.name })}
                    type="button"
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {visibleStreamItems.length > 0 ? (
        <div className="incident-focus-stream-list">
          {visibleStreamItems.map((item) => (
            <button
              key={item.key}
              className={`incident-focus-stream-item incident-focus-stream-item-${item.kind === 'alert' ? 'red' : getSystemTone(item.message.type)}`}
              onClick={() => onSelectStreamItem(item.key)}
              style={{ opacity: getFadeOpacity(item.expiresAtMs, now, item.receivedAtMs) }}
              type="button"
            >
              {getStreamSummary(item)}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
