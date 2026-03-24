export type MissileCountry = 'iran' | 'israel'
export type MissilePlaybackSpeedMode = 'fast' | 'realistic'

export interface MissileLaunchSite {
  name: string
  coord: [number, number]
  type: 'fixed' | 'mobile' | 'underground'
}

export interface MissileDefinition {
  id: string
  country: MissileCountry
  name: string
  altNames: string[]
  category:
    | 'srbm'
    | 'mrbm'
    | 'irbm'
    | 'icbm'
    | 'cruise'
    | 'hypersonic'
    | 'asbm'
    | 'tactical'
    | 'interceptor'
    | 'directed_energy'
    | 'slv'
  type:
    | 'ballistic'
    | 'cruise'
    | 'hypersonic'
    | 'interceptor'
    | 'directed_energy'
    | 'slv_dual_use'
  propulsion: 'solid' | 'liquid' | 'turbojet' | 'ramjet' | 'laser' | 'hybrid'
  stages: number
  rangeMinKm: number | null
  rangeMaxKm: number | null
  payloadKg: number | null
  cepMeters: number | null
  guidance: string[]
  launchPlatform: string[]
  warheadType: string[]
  speed: 'subsonic' | 'supersonic' | 'hypersonic'
  machNumber: number | null
  firstYear: number
  status:
    | 'operational'
    | 'limited_operational'
    | 'in_development'
    | 'testing'
    | 'retired'
    | 'concept'
  features: string[]
  estimatedInventory: number | null
  interceptProbability: number | null
  defaultLaunchCoord: [number, number]
  knownLaunchSites: MissileLaunchSite[]
}

export interface Flight {
  id: string
  missileId: string
  launchCoord: [number, number]
  targetCoord: [number, number]
  startTime: number
  duration: number
  phase: 'boost' | 'midcourse' | 'terminal' | 'complete'
  progress: number
  interceptOutcome: 'success' | 'failure' | null
  interceptProbability: number | null
}

export type FlightPhase = 'idle' | 'ready' | 'launching' | 'inflight' | 'complete'

export interface MissileLaunchCommand {
  id: string
  missileId: string
  launchCoord: [number, number]
  targetCoord: [number, number]
  launchedAt: number
  durationMs: number
  salvoGroupId: string | null
  interceptLaunchId: string | null
  interceptOutcome: 'success' | 'failure' | null
  interceptProbability: number | null
}

export interface ScenarioMissilesState {
  selectedMissileIds: string[]
  activeMissileId: string | null
  targetCoord: [number, number] | null
  launchSiteByMissileId: Record<string, [number, number]>
  playbackSpeedMode: MissilePlaybackSpeedMode
  recentLaunches: MissileLaunchCommand[]
}

export const EMPTY_SCENARIO_MISSILES_STATE: ScenarioMissilesState = {
  selectedMissileIds: [],
  activeMissileId: null,
  targetCoord: null,
  launchSiteByMissileId: {},
  playbackSpeedMode: 'fast',
  recentLaunches: [],
}
