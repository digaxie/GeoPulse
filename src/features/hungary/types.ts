export type HungaryDataMode = 'turnout' | 'results'
export type HungarySourceMode = 'direct' | 'proxy'
export type HungaryMapMode = 'turnout' | 'previous' | 'results'
export type HungaryContestKind = 'live-close' | 'battleground'

export type HungaryCheckpoint = {
  code: string
  label: string
  tooltip: string
  budapestTime: string
  istanbulTime: string
}

export type HungaryCandidateResult = {
  ejId: number
  name: string
  alliance: string
  ballotOrder: number | null
  statusCode: string
  statusLabel: string
  votes: number | null
  votePct: number | null
  seatWon: boolean
}

export type HungaryPreviousResult = {
  winnerName: string
  winnerAlliance: string
  winnerVotes: number
  winnerVotePct: number
  runnerUpName: string
  runnerUpAlliance: string
  runnerUpVotes: number
  runnerUpVotePct: number
  marginVotes: number
  marginPct: number
}

export type HungaryConstituencySnapshot = {
  id: string
  countyCode: string
  countyName: string
  countyNameEn: string
  constituencyCode: string
  name: string
  nameEn: string
  seat: string
  seatEn: string
  electorate: number
  candidateVoteLimit: number
  turnoutCount: number | null
  turnoutPct: number | null
  checkpointCode: string | null
  previousResult: HungaryPreviousResult | null
  leadingCandidateId: number | null
  leadingCandidateName: string | null
  leadingAlliance: string | null
  processedPct: number | null
  resultStatus: string | null
  isOfficial: boolean
  candidates: HungaryCandidateResult[]
}

export type HungaryCountySnapshot = {
  code: string
  name: string
  nameEn: string
  electorate: number
  turnoutCount: number
  turnoutPct: number
  constituencyCount: number
}

export type HungaryListKind = 'national' | 'minority' | 'joint'

export type HungaryListSnapshot = {
  listId: number
  shortName: string
  kind: HungaryListKind
  ballotOrder: number | null
  drawOrder: number
  thresholdPct: number | null
  thresholdLabel: string
  statusCode: string
  statusLabel: string
  candidateCount: number
  voteCount: number | null
  votePct: number | null
  seatCount: number | null
  thresholdMet: boolean | null
  validVotesBase: number | null
}

export type HungaryCloseContest = {
  kind: HungaryContestKind
  constituencyId: string
  constituencyName: string
  countyName: string
  processedPct: number | null
  leaderName: string
  leaderAlliance: string
  leaderVotes: number
  leaderVotePct: number
  runnerUpName: string
  runnerUpAlliance: string
  runnerUpVotes: number
  runnerUpVotePct: number
  marginVotes: number
  marginPct: number
  remainingSwingVotes: number | null
}

export type HungaryTurnoutPoint = {
  checkpointCode: string
  label: string
  turnoutCount: number
  turnoutPct: number
}

export type HungaryNationalSummary = {
  electorate: number
  turnoutCount: number
  turnoutPct: number
  checkpointCode: string | null
  reportingConstituencies: number
  totalConstituencies: number
  listValidVotes: number | null
  listValidVotesPct: number | null
}

export type HungaryThresholds = {
  totalListVotes: number | null
  threshold5: number | null
  threshold10: number | null
  threshold15: number | null
  minorityPreference: number | null
}

export type HungaryGeometryRecord = {
  id: string
  center: [number, number] | null
  polygon: string
}

export type HungaryElectionSnapshot = {
  mode: HungaryDataMode
  sourceMode: HungarySourceMode
  generatedAt: string
  configVersion: string
  turnoutVersion: string
  resultVersion: string | null
  checkpoint: HungaryCheckpoint | null
  checkpoints: HungaryCheckpoint[]
  national: HungaryNationalSummary
  turnoutTimeline: HungaryTurnoutPoint[]
  counties: HungaryCountySnapshot[]
  constituencies: HungaryConstituencySnapshot[]
  lists: HungaryListSnapshot[]
  closeContests: HungaryCloseContest[]
  thresholds: HungaryThresholds
}

export type HungarySnapshotBundle = {
  snapshot: HungaryElectionSnapshot
  geometryVersion: string
  geometryRecords: HungaryGeometryRecord[]
  pollIntervalMs: number
}
