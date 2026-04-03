import { useMemo } from 'react'

import type { TvChannel } from '../types'
import { useTvStore } from '../useTvStore'

type TvChannelListProps = {
  channels: TvChannel[]
  onSelect: (channelId: string) => void
  onClose: () => void
}

export function TvChannelList({ channels, onSelect, onClose }: TvChannelListProps) {
  const {
    searchQuery,
    setSearchQuery,
    filterGroup,
    setFilterGroup,
    filterCountry,
    setFilterCountry,
    favorites,
    toggleFavorite,
  } = useTvStore()

  const groups = useMemo(() => {
    const set = new Set<string>()
    for (const ch of channels) {
      if (ch.group) set.add(ch.group)
    }
    return Array.from(set).sort()
  }, [channels])

  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const ch of channels) {
      if (ch.country) set.add(ch.country)
    }
    return Array.from(set).sort()
  }, [channels])

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return channels.filter((ch) => {
      if (q && !ch.name.toLowerCase().includes(q)) return false
      if (filterGroup && ch.group !== filterGroup) return false
      if (filterCountry && ch.country !== filterCountry) return false
      return true
    })
  }, [channels, searchQuery, filterGroup, filterCountry])

  const favSet = useMemo(() => new Set(favorites), [favorites])

  // Sort favorites first
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aFav = favSet.has(a.id) ? 0 : 1
      const bFav = favSet.has(b.id) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.name.localeCompare(b.name)
    })
  }, [filtered, favSet])

  return (
    <div className="tv-channel-list-overlay" onClick={onClose}>
      <div className="tv-channel-list" onClick={(e) => e.stopPropagation()}>
        <div className="tv-channel-list-header">
          <h3>Kanal Seç</h3>
          <button className="tv-tile-btn tv-tile-btn--close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="tv-channel-list-filters">
          <input
            className="tv-channel-search"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kanal ara..."
            type="text"
            value={searchQuery}
          />
          <select
            className="tv-channel-filter"
            onChange={(e) => setFilterGroup(e.target.value)}
            value={filterGroup}
          >
            <option value="">Tüm Kategoriler</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <select
            className="tv-channel-filter"
            onChange={(e) => setFilterCountry(e.target.value)}
            value={filterCountry}
          >
            <option value="">Tüm Ülkeler</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="tv-channel-list-body">
          {sorted.length === 0 ? (
            <p className="tv-channel-empty">Kanal bulunamadı.</p>
          ) : null}
          {sorted.map((ch) => (
            <button
              className={`tv-channel-item${favSet.has(ch.id) ? ' tv-channel-item--fav' : ''}`}
              key={ch.id}
              onClick={() => onSelect(ch.id)}
              type="button"
            >
              {ch.logoUrl ? (
                <img
                  alt=""
                  className="tv-channel-item-logo"
                  src={ch.logoUrl}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <span className="tv-channel-item-logo-placeholder">TV</span>
              )}
              <div className="tv-channel-item-info">
                <span className="tv-channel-item-name">{ch.name}</span>
                <span className="tv-channel-item-meta">
                  {ch.group}
                  {ch.country ? ` · ${ch.country}` : ''}
                </span>
              </div>
              <button
                className={`tv-fav-btn${favSet.has(ch.id) ? ' tv-fav-btn--active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFavorite(ch.id)
                }}
                title={favSet.has(ch.id) ? 'Favoriden Çıkar' : 'Favorilere Ekle'}
                type="button"
              >
                {favSet.has(ch.id) ? '★' : '☆'}
              </button>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
