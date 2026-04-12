import { create } from 'zustand'

import type {
  HungaryElectionSnapshot,
  HungaryGeometryRecord,
  HungaryMapMode,
  HungarySnapshotBundle,
} from './types'

type HungaryStoreState = {
  snapshot: HungaryElectionSnapshot | null
  geometryVersion: string | null
  geometryRecords: HungaryGeometryRecord[]
  mapMode: HungaryMapMode
  selectedConstituencyId: string | null
  hoveredConstituencyId: string | null
  isLoading: boolean
  isRefreshing: boolean
  error: string | null
  isStale: boolean
  staleMessage: string | null
  lastSuccessAt: string | null
}

type HungaryStoreActions = {
  startFetch: (initialLoad: boolean) => void
  applyBundle: (bundle: HungarySnapshotBundle) => void
  markFetchFailure: (message: string) => void
  setMapMode: (mode: HungaryMapMode) => void
  selectConstituency: (constituencyId: string | null) => void
  hoverConstituency: (constituencyId: string | null) => void
  clearInteraction: () => void
}

export const useHungaryStore = create<HungaryStoreState & HungaryStoreActions>((set) => ({
  snapshot: null,
  geometryVersion: null,
  geometryRecords: [],
  mapMode: 'turnout',
  selectedConstituencyId: null,
  hoveredConstituencyId: null,
  isLoading: true,
  isRefreshing: false,
  error: null,
  isStale: false,
  staleMessage: null,
  lastSuccessAt: null,

  startFetch(initialLoad) {
    set((current) => ({
      isLoading: initialLoad && !current.snapshot,
      isRefreshing: !initialLoad && Boolean(current.snapshot),
      error: initialLoad && !current.snapshot ? null : current.error,
    }))
  },

  applyBundle(bundle) {
    set((current) => {
      const hasSelection = current.selectedConstituencyId
        ? bundle.snapshot.constituencies.some(
            (constituency) => constituency.id === current.selectedConstituencyId,
          )
        : false

      const geometryUnchanged = current.geometryVersion === bundle.geometryVersion

      return {
        snapshot: bundle.snapshot,
        geometryVersion: bundle.geometryVersion,
        geometryRecords: geometryUnchanged ? current.geometryRecords : bundle.geometryRecords,
        mapMode:
          current.mapMode === 'results' && bundle.snapshot.mode === 'turnout'
            ? 'turnout'
            : current.mapMode,
        selectedConstituencyId: hasSelection ? current.selectedConstituencyId : null,
        hoveredConstituencyId: current.hoveredConstituencyId,
        isLoading: false,
        isRefreshing: false,
        error: null,
        isStale: false,
        staleMessage: null,
        lastSuccessAt: bundle.snapshot.generatedAt,
      }
    })
  },

  markFetchFailure(message) {
    set((current) => ({
      isLoading: false,
      isRefreshing: false,
      error: current.snapshot ? current.error : message,
      isStale: Boolean(current.snapshot),
      staleMessage: current.snapshot ? message : null,
    }))
  },

  setMapMode(mapMode) {
    set({ mapMode })
  },

  selectConstituency(selectedConstituencyId) {
    set({ selectedConstituencyId })
  },

  hoverConstituency(hoveredConstituencyId) {
    set({ hoveredConstituencyId })
  },

  clearInteraction() {
    set({
      selectedConstituencyId: null,
      hoveredConstituencyId: null,
      mapMode: 'turnout',
    })
  },
}))
