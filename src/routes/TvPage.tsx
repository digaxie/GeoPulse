import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { TvGrid } from '@/features/tv/components/TvGrid'
import '@/features/tv/tv.css'
import type { TvChannel } from '@/features/tv/types'

export function TvPage() {
  const [channels, setChannels] = useState<TvChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const res = await fetch(
          new URL('/data/tv/channels.json', window.location.origin).href,
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as TvChannel[]
        if (active) {
          setChannels(data)
          setError(null)
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? `Kanal listesi yüklenemedi: ${e.message}`
              : 'Kanal listesi yüklenemedi',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="tv-page" data-testid="tv-page">
      <header className="tv-page-header">
        <div className="tv-page-header-left">
          <Link className="tv-back-link" to="/app">
            ← Hub
          </Link>
          <h1 className="tv-page-title">GeoPulse TV</h1>
        </div>
        <p className="tv-page-subtitle">
          {loading
            ? 'Kanallar yükleniyor...'
            : `${channels.length} kanal hazır`}
        </p>
      </header>

      {error ? <p className="workspace-alert">{error}</p> : null}

      {!loading && channels.length > 0 ? <TvGrid channels={channels} /> : null}

      {!loading && channels.length === 0 && !error ? (
        <div className="tv-empty">
          <p>Kanal verisi bulunamadı.</p>
          <p>
            <code>npm run sync:tv</code> komutuyla kanal listesini senkronize edin.
          </p>
        </div>
      ) : null}
    </main>
  )
}
