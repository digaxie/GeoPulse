import { create } from 'zustand'

import type { TvGridLayout, TvStoreActions, TvStoreState, TvTileState } from './types'

const STORAGE_KEY = 'geopulse-tv-state'

function createEmptyTiles(count: number): TvTileState[] {
  return Array.from({ length: count }, () => ({
    channelId: null,
    muted: true,
    playing: false,
  }))
}

function loadPersistedState(): Partial<TvStoreState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Partial<TvStoreState>
    return {
      layout: parsed.layout,
      tiles: parsed.tiles,
      globalMuted: parsed.globalMuted,
      favorites: parsed.favorites,
    }
  } catch {
    return {}
  }
}

function persistState(state: TvStoreState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        layout: state.layout,
        tiles: state.tiles,
        globalMuted: state.globalMuted,
        favorites: state.favorites,
      }),
    )
  } catch {
    // localStorage full or unavailable
  }
}

const persisted = loadPersistedState()

const defaultLayout: TvGridLayout = 4

export const useTvStore = create<TvStoreState & TvStoreActions>((set, get) => ({
  layout: persisted.layout ?? defaultLayout,
  tiles: persisted.tiles ?? createEmptyTiles(defaultLayout),
  globalMuted: persisted.globalMuted ?? true,
  favorites: persisted.favorites ?? [],
  searchQuery: '',
  filterGroup: '',
  filterCountry: '',

  setLayout(layout) {
    const current = get().tiles
    const newTiles = createEmptyTiles(layout)
    // Preserve existing assignments
    for (let i = 0; i < Math.min(current.length, newTiles.length); i++) {
      newTiles[i] = current[i]
    }
    set({ layout, tiles: newTiles })
    persistState({ ...get(), layout, tiles: newTiles })
  },

  assignChannel(tileIndex, channelId) {
    const tiles = [...get().tiles]
    if (tileIndex < 0 || tileIndex >= tiles.length) return
    tiles[tileIndex] = { channelId, muted: get().globalMuted, playing: true }
    set({ tiles })
    persistState(get())
  },

  clearTile(tileIndex) {
    const tiles = [...get().tiles]
    if (tileIndex < 0 || tileIndex >= tiles.length) return
    tiles[tileIndex] = { channelId: null, muted: true, playing: false }
    set({ tiles })
    persistState(get())
  },

  toggleTileMute(tileIndex) {
    const tiles = [...get().tiles]
    if (tileIndex < 0 || tileIndex >= tiles.length) return
    tiles[tileIndex] = { ...tiles[tileIndex], muted: !tiles[tileIndex].muted }
    set({ tiles })
    persistState(get())
  },

  toggleTilePlay(tileIndex) {
    const tiles = [...get().tiles]
    if (tileIndex < 0 || tileIndex >= tiles.length) return
    tiles[tileIndex] = { ...tiles[tileIndex], playing: !tiles[tileIndex].playing }
    set({ tiles })
    persistState(get())
  },

  muteAll() {
    const tiles = get().tiles.map((t) => ({ ...t, muted: true }))
    set({ tiles, globalMuted: true })
    persistState(get())
  },

  unmuteAll() {
    const tiles = get().tiles.map((t) =>
      t.channelId ? { ...t, muted: false } : t,
    )
    set({ tiles, globalMuted: false })
    persistState(get())
  },

  stopAll() {
    const tiles = get().tiles.map((t) => ({ ...t, playing: false }))
    set({ tiles })
    persistState(get())
  },

  resetLayout() {
    const layout = defaultLayout
    const tiles = createEmptyTiles(layout)
    set({ layout, tiles, globalMuted: true })
    persistState(get())
  },

  toggleFavorite(channelId) {
    const favs = get().favorites
    const next = favs.includes(channelId)
      ? favs.filter((id) => id !== channelId)
      : [...favs, channelId]
    set({ favorites: next })
    persistState(get())
  },

  setSearchQuery(query) {
    set({ searchQuery: query })
  },

  setFilterGroup(group) {
    set({ filterGroup: group })
  },

  setFilterCountry(country) {
    set({ filterCountry: country })
  },
}))
