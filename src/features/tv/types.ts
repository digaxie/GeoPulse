export type TvChannel = {
  id: string
  name: string
  streamUrl: string
  logoUrl: string
  group: string
  country: string
  sourceName: string
  sourceUrl: string
}

export type TvGridLayout = 1 | 4 | 6 | 9

export type TvTileState = {
  channelId: string | null
  muted: boolean
  playing: boolean
}

export type TvStoreState = {
  layout: TvGridLayout
  tiles: TvTileState[]
  globalMuted: boolean
  favorites: string[]
  searchQuery: string
  filterGroup: string
  filterCountry: string
}

export type TvStoreActions = {
  setLayout: (layout: TvGridLayout) => void
  assignChannel: (tileIndex: number, channelId: string) => void
  clearTile: (tileIndex: number) => void
  toggleTileMute: (tileIndex: number) => void
  toggleTilePlay: (tileIndex: number) => void
  muteAll: () => void
  unmuteAll: () => void
  stopAll: () => void
  resetLayout: () => void
  toggleFavorite: (channelId: string) => void
  setSearchQuery: (query: string) => void
  setFilterGroup: (group: string) => void
  setFilterCountry: (country: string) => void
}
