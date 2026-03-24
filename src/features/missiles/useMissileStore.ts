import { create } from 'zustand'

import { getMissileById } from '@/features/missiles/missileData'
import type { Flight, FlightPhase, MissileCountry } from '@/features/missiles/types'

type MissileRuntimeStore = {
  activeCountryTab: MissileCountry
  isTargetPickArmed: boolean
  selectedInterceptTargetId: string | null
  activeFlights: Flight[]
  activeIntercepts: Flight[]
  flightPhase: FlightPhase
  consumedLaunchIds: string[]
  setActiveCountryTab: (country: MissileCountry) => void
  armTargetPick: () => void
  cancelTargetPick: () => void
  setSelectedInterceptTargetId: (launchId: string | null) => void
  setRuntimeFlights: (flights: Flight[]) => void
  markLaunchConsumed: (launchId: string) => void
  resetRuntime: () => void
}

function deriveFlightPhase(flights: Flight[]): FlightPhase {
  if (flights.length === 0) {
    return 'idle'
  }

  if (flights.some((flight) => flight.progress < 0.12)) {
    return 'launching'
  }

  if (flights.some((flight) => flight.progress < 1)) {
    return 'inflight'
  }

  return 'complete'
}

export const useMissileStore = create<MissileRuntimeStore>((set) => ({
  activeCountryTab: 'iran',
  isTargetPickArmed: false,
  selectedInterceptTargetId: null,
  activeFlights: [],
  activeIntercepts: [],
  flightPhase: 'idle',
  consumedLaunchIds: [],

  setActiveCountryTab(activeCountryTab) {
    set({ activeCountryTab })
  },

  armTargetPick() {
    set({ isTargetPickArmed: true })
  },

  cancelTargetPick() {
    set({ isTargetPickArmed: false })
  },

  setSelectedInterceptTargetId(selectedInterceptTargetId) {
    set({ selectedInterceptTargetId })
  },

  setRuntimeFlights(activeFlights) {
    set({
      activeFlights,
      activeIntercepts: activeFlights.filter((flight) => {
        const definition = getMissileById(flight.missileId)
        return Boolean(definition && (definition.type === 'interceptor' || definition.type === 'directed_energy'))
      }),
      flightPhase: deriveFlightPhase(activeFlights),
    })
  },

  markLaunchConsumed(launchId) {
    set((current) =>
      current.consumedLaunchIds.includes(launchId)
        ? current
        : { consumedLaunchIds: [...current.consumedLaunchIds, launchId] },
    )
  },

  resetRuntime() {
    set({
      isTargetPickArmed: false,
      selectedInterceptTargetId: null,
      activeFlights: [],
      activeIntercepts: [],
      flightPhase: 'idle',
      consumedLaunchIds: [],
    })
  },
}))
