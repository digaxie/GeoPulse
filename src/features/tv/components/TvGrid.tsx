import { useCallback, useEffect, useMemo, useState } from 'react'

import type { TvChannel } from '../types'
import { useTvStore } from '../useTvStore'
import { TvChannelList } from './TvChannelList'
import { TvControls } from './TvControls'
import { TvTile } from './TvTile'

/** Max number of tiles that auto-play on mount (performance guard) */
const MAX_AUTOPLAY = 4

type TvGridProps = {
  channels: TvChannel[]
}

export function TvGrid({ channels }: TvGridProps) {
  const { layout, tiles, assignChannel } = useTvStore()
  const [selectingTileIndex, setSelectingTileIndex] = useState<number | null>(null)

  const channelMap = useMemo(() => {
    const map = new Map<string, TvChannel>()
    for (const ch of channels) {
      map.set(ch.id, ch)
    }
    return map
  }, [channels])

  // Limit autoplay tiles on first render
  useEffect(() => {
    const store = useTvStore.getState()
    const activeTiles = store.tiles.filter((t) => t.channelId && t.playing)
    if (activeTiles.length > MAX_AUTOPLAY) {
      const newTiles = store.tiles.map((t, i) => {
        if (i >= MAX_AUTOPLAY && t.playing) {
          return { ...t, playing: false }
        }
        return t
      })
      useTvStore.setState({ tiles: newTiles })
    }
  }, [])

  const handleSelectChannel = useCallback((tileIndex: number) => {
    setSelectingTileIndex(tileIndex)
  }, [])

  const handleChannelSelected = useCallback(
    (channelId: string) => {
      if (selectingTileIndex !== null) {
        assignChannel(selectingTileIndex, channelId)
      }
      setSelectingTileIndex(null)
    },
    [selectingTileIndex, assignChannel],
  )

  const gridCols =
    layout === 1 ? 1 : layout === 4 ? 2 : layout === 6 ? 3 : 3
  const gridRows =
    layout === 1 ? 1 : layout === 4 ? 2 : layout === 6 ? 2 : 3

  return (
    <div className="tv-grid-wrapper">
      <TvControls />

      <div
        className="tv-grid"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
          gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        }}
      >
        {tiles.map((tile, index) => (
          <TvTile
            channel={tile.channelId ? channelMap.get(tile.channelId) : undefined}
            index={index}
            key={index}
            onSelectChannel={handleSelectChannel}
            tile={tile}
          />
        ))}
      </div>

      {selectingTileIndex !== null ? (
        <TvChannelList
          channels={channels}
          onClose={() => setSelectingTileIndex(null)}
          onSelect={handleChannelSelected}
        />
      ) : null}
    </div>
  )
}
