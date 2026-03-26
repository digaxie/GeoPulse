import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { formatTimelineDualTime } from '@/features/alerts/types'
import type {
  DrawerCardViewModel,
  DrawerCity,
  DrawerCityGroup,
} from '@/features/alerts/alertDrawerModel'
import { normalizeDrawerSearchText } from '@/features/alerts/alertDrawerModel'

type AlertDrawerProps = {
  collapsed: boolean
  enabled: boolean
  historyTruncated: boolean
  items: DrawerCardViewModel[]
  selectedKey: string | null
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
  onSelectItem: (key: string) => void
  onToggleCollapsed: () => void
}

const INITIAL_VISIBLE_COUNT = 60
const VISIBLE_COUNT_STEP = 60
const MINUTE_MS = 60_000
const SEARCH_DEBOUNCE_MS = 200

function isCityFocusable(city: DrawerCity) {
  return city.lat != null && city.lon != null && city.lat !== 0 && city.lon !== 0
}

function getClockText(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(timestampMs)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'hour' | 'minute' | 'second', string>>

  return `${values.hour ?? '00'}:${values.minute ?? '00'}:${values.second ?? '00'}`
}

function getDateText(timestampMs: number) {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).formatToParts(timestampMs)

  const values = Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  ) as Partial<Record<'weekday' | 'year' | 'month' | 'day', string>>

  const weekday = values.weekday
    ? `${values.weekday.charAt(0).toLocaleUpperCase('tr-TR')}${values.weekday.slice(1)}`
    : ''

  return `${values.day ?? '0'} ${values.month ?? ''} ${values.year ?? ''} ${weekday}`.trim()
}

function getInitialRelativeNow() {
  const now = Date.now()
  return now - (now % MINUTE_MS)
}

function getNextMinuteDelay(now: number) {
  const remainder = now % MINUTE_MS
  return remainder === 0 ? MINUTE_MS : MINUTE_MS - remainder
}

function useRelativeNow() {
  const [relativeNow, setRelativeNow] = useState(() => getInitialRelativeNow())

  useEffect(() => {
    let intervalId: number | null = null
    const timeoutId = window.setTimeout(() => {
      setRelativeNow(getInitialRelativeNow())
      intervalId = window.setInterval(() => {
        setRelativeNow(getInitialRelativeNow())
      }, MINUTE_MS)
    }, getNextMinuteDelay(Date.now()))

    return () => {
      window.clearTimeout(timeoutId)
      if (intervalId !== null) {
        window.clearInterval(intervalId)
      }
    }
  }, [])

  return relativeNow
}

function DrawerCityPreview({
  color,
  cities,
  itemKey,
  onFocusCity,
}: {
  color: DrawerCardViewModel['color']
  cities: DrawerCity[]
  itemKey: string
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
}) {
  if (cities.length === 0) {
    return null
  }

  return (
    <div className="alerts-city-chips alert-drawer-city-preview">
      {cities.map((city, index) => {
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
    </div>
  )
}

function DrawerExpandedGroups({
  color,
  groups,
  itemKey,
  onFocusCity,
}: {
  color: DrawerCardViewModel['color']
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

const AlertDrawerHeaderClock = memo(function AlertDrawerHeaderClock() {
  const [clockNow, setClockNow] = useState(() => Date.now())

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setClockNow(Date.now())
    }, 1_000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  return (
    <div className="alert-drawer-header-time">
      <strong>{getClockText(clockNow)}</strong>
      <span>{getDateText(clockNow)}</span>
    </div>
  )
})

const AlertDrawerCard = memo(function AlertDrawerCard({
  item,
  onFocusCity,
  onSelect,
  relativeNow,
  selected,
}: {
  item: DrawerCardViewModel
  onFocusCity: (coord: { lat: number; lon: number; name: string }) => void
  onSelect: (key: string) => void
  relativeNow: number
  selected: boolean
}) {
  const hiddenCount = item.groups.reduce((total, group) => total + group.cities.length, 0) - item.previewCities.length
  const relativeTime = useMemo(
    () => formatTimelineDualTime(item.timestampMs, relativeNow),
    [item.timestampMs, relativeNow],
  )

  return (
    <div className="alerts-card-wrapper alert-drawer-item">
      <button
        aria-expanded={selected}
        aria-label={`Alarm olayi: ${item.title}`}
        className={`alerts-card alerts-card-${item.color} alert-drawer-timeline-card${selected ? ' alerts-card-active alert-drawer-timeline-card-active' : ''}${item.isLive ? ' alerts-card-live' : ''}`}
        onClick={() => onSelect(item.key)}
        type="button"
      >
        <div className="alerts-card-body">
          <strong className="alerts-card-title">{item.title}</strong>
          <span className="alerts-card-time">{relativeTime}</span>
          <span className="alerts-card-area">{item.body}</span>
        </div>
        <span aria-hidden="true" className="alerts-card-icon">
          {item.icon}
        </span>
      </button>

      {!selected ? (
        <>
          <DrawerCityPreview
            cities={item.previewCities}
            color={item.color}
            itemKey={item.key}
            onFocusCity={onFocusCity}
          />
          {hiddenCount > 0 ? (
            <div className="alert-drawer-preview-meta">
              <span className="alerts-city-chip alerts-city-chip-more">+{hiddenCount} daha</span>
            </div>
          ) : null}
        </>
      ) : null}

      {selected ? (
        <DrawerExpandedGroups
          color={item.color}
          groups={item.groups}
          itemKey={item.key}
          onFocusCity={onFocusCity}
        />
      ) : null}
    </div>
  )
})

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
  const [localSelectedKey, setLocalSelectedKey] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const relativeNow = useRelativeNow()
  const searchDebounceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current)
      }
    }
  }, [])

  const effectiveSelectedKey = useMemo(() => {
    const hasSelectedKey = selectedKey !== null && items.some((item) => item.key === selectedKey)
    return (
      (hasSelectedKey ? selectedKey : null) ??
      (localSelectedKey && items.some((item) => item.key === localSelectedKey)
        ? localSelectedKey
        : (items[0]?.key ?? null))
    )
  }, [items, localSelectedKey, selectedKey])

  const filteredItems = useMemo(() => {
    if (!debouncedQuery) {
      return items
    }

    return items.filter((item) => item.searchText.includes(debouncedQuery))
  }, [debouncedQuery, items])

  const renderedSelectedKey = useMemo(() => {
    if (filteredItems.some((item) => item.key === effectiveSelectedKey)) {
      return effectiveSelectedKey
    }

    return filteredItems[0]?.key ?? null
  }, [effectiveSelectedKey, filteredItems])

  const selectedIndex = useMemo(
    () => filteredItems.findIndex((item) => item.key === renderedSelectedKey),
    [filteredItems, renderedSelectedKey],
  )

  const effectiveVisibleCount = useMemo(() => {
    if (selectedIndex < 0) {
      return Math.min(visibleCount, filteredItems.length)
    }

    return Math.min(Math.max(visibleCount, selectedIndex + 1), filteredItems.length)
  }, [filteredItems.length, selectedIndex, visibleCount])

  const visibleItems = useMemo(
    () => filteredItems.slice(0, effectiveVisibleCount),
    [effectiveVisibleCount, filteredItems],
  )

  const canLoadMore = effectiveVisibleCount < filteredItems.length
  const visibleItemCount = Math.min(effectiveVisibleCount, filteredItems.length)

  const handleSelect = useCallback(
    (key: string) => {
      setLocalSelectedKey(key)
      onSelectItem(key)
    },
    [onSelectItem],
  )

  const handleCollapse = useCallback(() => {
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current)
      searchDebounceTimerRef.current = null
    }
    setSearchInput('')
    setDebouncedQuery('')
    setVisibleCount(INITIAL_VISIBLE_COUNT)
    onToggleCollapsed()
  }, [onToggleCollapsed])

  const handleExpand = useCallback(() => {
    onToggleCollapsed()
  }, [onToggleCollapsed])

  const handleLoadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + VISIBLE_COUNT_STEP, filteredItems.length))
  }, [filteredItems.length])

  const handleSearchChange = useCallback((nextValue: string) => {
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current)
    }

    setSearchInput(nextValue)
    setVisibleCount(INITIAL_VISIBLE_COUNT)

    searchDebounceTimerRef.current = window.setTimeout(() => {
      setDebouncedQuery(normalizeDrawerSearchText(nextValue))
      searchDebounceTimerRef.current = null
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  if (collapsed) {
    return (
      <button
        aria-label="Alarm drawer'ini ac"
        className="alert-drawer-collapsed-handle"
        onClick={handleExpand}
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
          onClick={handleCollapse}
          type="button"
        >
          {'<'}
        </button>
        <AlertDrawerHeaderClock />
      </div>

      <div className="alert-drawer-section-header">
        <h3>{historyTruncated ? 'Son 24 Saat (kısmi)' : 'Son 24 Saat'}</h3>
        <span>{visibleItemCount} / {filteredItems.length}</span>
      </div>

      <label className="alert-drawer-search">
        <input
          aria-label="Alarm olaylarını ara"
          className="alert-drawer-search-input"
          onChange={(event) => handleSearchChange(event.target.value)}
          placeholder="Şehir, bölge veya olay ara..."
          type="text"
          value={searchInput}
        />
      </label>

      {!enabled ? (
        <p className="alert-drawer-empty">Canlı alarm akışı şu anda kapalı.</p>
      ) : items.length === 0 ? (
        <p className="alert-drawer-empty">Son 24 saatte görüntülenecek olay yok.</p>
      ) : filteredItems.length === 0 ? (
        <p className="alert-drawer-empty">Arama ile eşleşen olay bulunamadı.</p>
      ) : (
        <div className="alert-drawer-list">
          {visibleItems.map((item) => (
            <AlertDrawerCard
              item={item}
              key={item.key}
              onFocusCity={onFocusCity}
              onSelect={handleSelect}
              relativeNow={relativeNow}
              selected={item.key === renderedSelectedKey}
            />
          ))}
          {canLoadMore ? (
            <button className="alert-drawer-load-more" onClick={handleLoadMore} type="button">
              60 daha yukle
            </button>
          ) : null}
        </div>
      )}
    </aside>
  )
}
