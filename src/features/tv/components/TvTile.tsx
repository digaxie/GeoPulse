import { useCallback, useRef } from 'react'

import type { TvChannel, TvTileState } from '../types'
import { useTvStore } from '../useTvStore'
import { HlsPlayer } from './HlsPlayer'

type TvTileProps = {
  index: number
  tile: TvTileState
  channel: TvChannel | undefined
  onSelectChannel: (tileIndex: number) => void
}

export function TvTile({ index, tile, channel, onSelectChannel }: TvTileProps) {
  const { toggleTileMute, toggleTilePlay, clearTile } = useTvStore()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void el.requestFullscreen()
    }
  }, [])

  const handleReload = useCallback(() => {
    if (!channel) return
    // Re-assign same channel to force reload
    useTvStore.getState().assignChannel(index, channel.id)
  }, [channel, index])

  if (!tile.channelId || !channel) {
    return (
      <div className="tv-tile tv-tile--empty">
        <button
          className="tv-tile-add-btn"
          onClick={() => onSelectChannel(index)}
          type="button"
        >
          <span className="tv-tile-add-icon">+</span>
          <span>Kanal Seç</span>
        </button>
      </div>
    )
  }

  return (
    <div className="tv-tile" ref={containerRef}>
      <div className="tv-tile-player">
        <HlsPlayer
          src={channel.streamUrl}
          muted={tile.muted}
          playing={tile.playing}
        />
      </div>

      <div className="tv-tile-overlay">
        <div className="tv-tile-info">
          {channel.logoUrl ? (
            <img
              alt=""
              className="tv-tile-logo"
              src={channel.logoUrl}
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          ) : null}
          <span className="tv-tile-name">{channel.name}</span>
        </div>

        <div className="tv-tile-controls">
          <button
            className="tv-tile-btn"
            onClick={() => toggleTilePlay(index)}
            title={tile.playing ? 'Durdur' : 'Oynat'}
            type="button"
          >
            {tile.playing ? '⏸' : '▶'}
          </button>
          <button
            className="tv-tile-btn"
            onClick={() => toggleTileMute(index)}
            title={tile.muted ? 'Sesi Aç' : 'Sustur'}
            type="button"
          >
            {tile.muted ? '🔇' : '🔊'}
          </button>
          <button
            className="tv-tile-btn"
            onClick={handleReload}
            title="Yeniden Yükle"
            type="button"
          >
            ↻
          </button>
          <button
            className="tv-tile-btn"
            onClick={handleFullscreen}
            title="Tam Ekran"
            type="button"
          >
            ⛶
          </button>
          <button
            className="tv-tile-btn tv-tile-btn--close"
            onClick={() => clearTile(index)}
            title="Kanalı Kaldır"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>

      <button
        className="tv-tile-change-btn"
        onClick={() => onSelectChannel(index)}
        title="Kanal Değiştir"
        type="button"
      >
        Değiştir
      </button>
    </div>
  )
}
