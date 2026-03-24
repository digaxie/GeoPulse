import { useCallback, useEffect, useRef, useState } from 'react'

import { type GeocodingResult, searchLocation, zoomForType } from '@/lib/geocoding'

type LocationSearchProps = {
  onFlyTo: (center: [number, number], zoom: number) => void
}

export function LocationSearch({ onFlyTo }: LocationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const trimmed = value.trim()
    if (!trimmed) {
      setResults([])
      setOpen(false)
      return
    }

    debounceRef.current = setTimeout(() => {
      setLoading(true)
      searchLocation(trimmed)
        .then((data) => {
          setResults(data)
          setOpen(data.length > 0)
        })
        .catch(() => {
          setResults([])
        })
        .finally(() => setLoading(false))
    }, 500)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const value = event.target.value
    setQuery(value)
    doSearch(value)
  }

  function handleSelect(result: GeocodingResult) {
    onFlyTo([result.lon, result.lat], zoomForType(result.type))
    setQuery(result.displayName.split(',')[0] ?? '')
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false)
      ;(event.target as HTMLInputElement).blur()
    }
  }

  return (
    <div className="location-search" ref={containerRef}>
      <input
        className="location-search-input"
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Konum ara..."
        type="text"
        value={query}
      />
      {loading && <span className="location-search-loading">...</span>}
      {open && results.length > 0 && (
        <ul className="location-search-results">
          {results.map((result, i) => (
            <li
              className="location-search-item"
              key={`${result.lat}-${result.lon}-${i}`}
              onClick={() => handleSelect(result)}
            >
              {result.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
