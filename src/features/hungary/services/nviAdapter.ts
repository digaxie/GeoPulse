import { createLogger } from '@/lib/logger'

import {
  HUNGARY_CONFIG_POLL_MS,
  HUNGARY_FETCH_TIMEOUT_MS,
  HUNGARY_OFFICIAL_DATA_BASE_URL,
  HUNGARY_PROXY_ENDPOINT,
  HUNGARY_RESULTS_POLL_MS,
  HUNGARY_TURNOUT_POLL_MS,
  buildHungaryCheckpointList,
  formatHungaryThreshold,
} from '../constants'
import type {
  HungaryCandidateResult,
  HungaryCheckpoint,
  HungaryCloseContest,
  HungaryDataMode,
  HungaryElectionSnapshot,
  HungaryGeometryRecord,
  HungaryListKind,
  HungaryListSnapshot,
  HungaryPreviousResult,
  HungarySnapshotBundle,
  HungarySourceMode,
  HungaryTurnoutPoint,
} from '../types'

const log = createLogger('HungaryNviAdapter')

type ConfigPayload = {
  ver: string
  napkozi: string
  szavossz: string | null
}

type RawHeader = {
  generated?: string
}

type RawPayload<TItem> = {
  PvOnHeader?: RawHeader
  header?: RawHeader
  list?: TItem[]
  data?: unknown
}

type RawConstituencyMeta = {
  maz: string
  maz_nev: string
  maz_nev_en?: string
  evk: string
  evk_nev: string
  evk_nev_en?: string
  szekhely: string
  szekhely_en?: string
  oevk_jeloltre_szavhat?: number
  letszam?: {
    osszesen?: number
  }
}

type RawPolygonMeta = {
  maz: string
  evk: string
  centrum?: string
  poligon: string
}

type RawCodeRow = {
  tabla: string
  kod: string
  megnev: string
}

type RawListRow = {
  tl_id: number
  sorsolt_sorsz: number
  szavlap_sorsz: number | null
  jlcs_nev: string
  lista_tip: string
  hatar: string | null
  allapot: string
  jeloltek?: Array<unknown>
  jelolo_szervezetek?: number[]
}

type RawIndividualCandidate = {
  ej_id: number
  maz: string
  evk: string
  sorsolt_sorsz?: number
  szavlap_sorsz?: number
  neve: string
  jlcs_nev: string
  allapot: string
}

type RawPreviousResult = {
  maz: string
  evk: string
  neve: string
  jlcs_nev: string
  szavazat: number
  szavazat_szaz: number
}

type RawNationalTurnout = {
  jelido: string
  valp: number
  megj: number
}

type RawCountyTurnout = {
  jelido: string
  maz: string
  valp: number
  megj: number
}

type RawConstituencyTurnout = {
  jelido: string
  maz: string
  evk: string
  valp: number
  megj: number
}

type RawResultLine = {
  ej_id: number
  sorsz?: number
  szavazat: number
  szavazat_szaz: number
  mandatum?: number
}

type RawConstituencyResult = {
  maz: string
  evk: string
  egyeni_jkv: {
    feldar: number
    jogeros: string
    vp_osszes?: number
    szavazott_osszesen?: number
    szavazott_osszesen_szaz?: number
    tetelek?: RawResultLine[]
  }
}

type RawLeader = {
  maz: string
  evk: string
  feldar: number
  ej_id: number
}

type RawCloseContest = {
  maz: string
  evk: string
  feldar: number
  ej_id1: number
  szavazat1: number
  szavazat1_szaz: number
  ej_id2: number
  szavazat2: number
  szavazat2_szaz: number
  szavazat_kulonbseg: number
  max_szavazat_nevj?: number
}

type RawNationalListResult = {
  oszint?: string
  vp_osszes?: number
  szavazott_osszesen?: number
  szavazott_osszesen_szaz?: number
  partlistara_szl_ervenyes?: number
  partlistara_szl_ervenyes_szaz?: number
  tetelek?: Array<{
    tl_id: number
    osszes_szavazat: number
    osszes_szavazat_szaz: number
    osszes_szavazat_partlistas_szaz?: number
    mandatum?: number
  }>
}

type RawThresholdData = {
  ossz_listas_szavazat?: number
  hatar_5?: number
  hatar_10?: number
  hatar_15?: number
  nemz_kedv_hatar?: number
}

type CandidateBase = Omit<HungaryCandidateResult, 'votes' | 'votePct' | 'seatWon'>

type ListBase = Omit<
  HungaryListSnapshot,
  'voteCount' | 'votePct' | 'seatCount' | 'thresholdMet' | 'validVotesBase'
>

type ConstituencyBase = {
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
  candidates: CandidateBase[]
  previousResult: HungaryPreviousResult | null
}

type StaticBundle = {
  generatedAt: string
  checkpoints: HungaryCheckpoint[]
  checkpointByCode: Map<string, HungaryCheckpoint>
  candidateById: Map<number, CandidateBase>
  listsById: Map<number, ListBase>
  constituencies: ConstituencyBase[]
  geometryRecords: HungaryGeometryRecord[]
}

type TurnoutBundle = {
  generatedAt: string
  latestCheckpointCode: string | null
  nationalRows: RawNationalTurnout[]
  countyRowsByCode: Map<string, RawCountyTurnout>
  constituencyRowsById: Map<string, RawConstituencyTurnout>
}

type ResultsBundle = {
  generatedAt: string
  constituencyResultsById: Map<string, RawConstituencyResult>
  leaderByConstituencyId: Map<string, RawLeader>
  closeContests: RawCloseContest[]
  nationalListResult: RawNationalListResult | null
  thresholds: RawThresholdData | null
}

let sourceModePromise: Promise<HungarySourceMode> | null = null
let configCache: { fetchedAt: number; value: ConfigPayload } | null = null
let staticCache: { version: string; data: StaticBundle } | null = null
let turnoutCache: { version: string; fetchedAt: number; data: TurnoutBundle } | null = null
let resultsCache: { version: string; fetchedAt: number; data: ResultsBundle } | null = null

function toConstituencyId(maz: string, evk: string) {
  return `${String(maz).padStart(2, '0')}-${String(evk).padStart(2, '0')}`
}

function toNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function percent(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (!numerator || !denominator) {
    return 0
  }

  return Number(((numerator / denominator) * 100).toFixed(2))
}

function readGeneratedAt<TItem>(payload: RawPayload<TItem>) {
  return payload.PvOnHeader?.generated ?? payload.header?.generated ?? new Date().toISOString()
}

function pickLatestTimestamp(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value))

  if (timestamps.length === 0) {
    return new Date().toISOString()
  }

  return new Date(Math.max(...timestamps)).toISOString()
}

function buildProxyUrl(path: string) {
  return `${HUNGARY_PROXY_ENDPOINT}?path=${encodeURIComponent(path)}`
}

function buildOfficialUrl(path: string) {
  return `${HUNGARY_OFFICIAL_DATA_BASE_URL}/${path}`
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), HUNGARY_FETCH_TIMEOUT_MS)
  const originalSignal = init.signal
  const abortFromOriginalSignal = () => controller.abort()

  if (originalSignal) {
    if (originalSignal.aborted) {
      controller.abort()
    } else {
      originalSignal.addEventListener('abort', abortFromOriginalSignal, { once: true })
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    globalThis.clearTimeout(timeoutId)
    originalSignal?.removeEventListener('abort', abortFromOriginalSignal)
  }
}

async function fetchJsonFromSource<TPayload>(
  path: string,
  sourceMode: HungarySourceMode,
  signal?: AbortSignal,
) {
  const url = sourceMode === 'direct' ? buildOfficialUrl(path) : buildProxyUrl(path)
  const response = await fetchWithTimeout(url, {
    signal,
    cache: 'no-store',
    mode: sourceMode === 'direct' ? 'cors' : undefined,
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Hungary veri istegi basarisiz (${response.status})`)
  }

  return (await response.json()) as TPayload
}

async function fetchHungaryJson<TPayload>(
  path: string,
  sourceMode: HungarySourceMode,
  signal?: AbortSignal,
): Promise<{ data: TPayload; sourceMode: HungarySourceMode }> {
  try {
    return {
      data: await fetchJsonFromSource<TPayload>(path, sourceMode, signal),
      sourceMode,
    }
  } catch (error) {
    if (sourceMode === 'direct') {
      log.warn('Direct Hungary fetch failed, retrying through proxy', {
        action: 'fetchHungaryJson',
        path,
        report: false,
        error,
      })

      sourceModePromise = Promise.resolve('proxy')

      return {
        data: await fetchJsonFromSource<TPayload>(path, 'proxy', signal),
        sourceMode: 'proxy',
      }
    }

    throw error
  }
}

async function resolveSourceMode(signal?: AbortSignal): Promise<HungarySourceMode> {
  if (!sourceModePromise) {
    sourceModePromise = (async () => {
      try {
        await fetchWithTimeout(buildOfficialUrl('config.json'), {
          signal,
          cache: 'no-store',
          mode: 'cors',
          headers: {
            Accept: 'application/json',
          },
        })

        return 'direct'
      } catch (error) {
        log.warn('Hungary data access fell back to proxy mode', {
          action: 'resolveSourceMode',
          report: false,
          error,
        })
        return 'proxy'
      }
    })()
  }

  return sourceModePromise
}

async function getConfig(signal?: AbortSignal) {
  const preferredSourceMode = await resolveSourceMode(signal)

  if (configCache && Date.now() - configCache.fetchedAt < HUNGARY_CONFIG_POLL_MS) {
    return {
      config: configCache.value,
      sourceMode: preferredSourceMode,
    }
  }

  const { data, sourceMode } = await fetchHungaryJson<ConfigPayload>('config.json', preferredSourceMode, signal)

  configCache = {
    fetchedAt: Date.now(),
    value: data,
  }

  return {
    config: data,
    sourceMode,
  }
}

function groupCodeTable(rows: RawCodeRow[]) {
  const tableMap = new Map<string, Map<string, string>>()

  for (const row of rows) {
    const existing = tableMap.get(row.tabla) ?? new Map<string, string>()
    existing.set(String(row.kod), row.megnev)
    tableMap.set(row.tabla, existing)
  }

  return tableMap
}

function readCodeLabel(codeTables: Map<string, Map<string, string>>, table: string, code: string | null | undefined) {
  if (!code) {
    return ''
  }

  return codeTables.get(table)?.get(code) ?? code
}

function parseCenter(value: string | undefined) {
  if (!value) {
    return null
  }

  const [latitude, longitude] = value.trim().split(/\s+/u).map(Number)

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null
  }

  return [longitude, latitude] as [number, number]
}

function inferListKind(value: RawListRow): HungaryListKind {
  if (value.lista_tip === 'N') {
    return 'minority'
  }

  if ((value.jelolo_szervezetek?.length ?? 0) > 1) {
    return 'joint'
  }

  return 'national'
}

function buildPreviousResult(rows: RawPreviousResult[]) {
  const sortedRows = rows
    .slice()
    .sort((left, right) => toNumber(right.szavazat) - toNumber(left.szavazat))

  if (sortedRows.length < 2) {
    return null
  }

  const winner = sortedRows[0]
  const runnerUp = sortedRows[1]

  return {
    winnerName: winner.neve,
    winnerAlliance: winner.jlcs_nev,
    winnerVotes: toNumber(winner.szavazat),
    winnerVotePct: toNumber(winner.szavazat_szaz),
    runnerUpName: runnerUp.neve,
    runnerUpAlliance: runnerUp.jlcs_nev,
    runnerUpVotes: toNumber(runnerUp.szavazat),
    runnerUpVotePct: toNumber(runnerUp.szavazat_szaz),
    marginVotes: Math.max(0, toNumber(winner.szavazat) - toNumber(runnerUp.szavazat)),
    marginPct: Number(
      (toNumber(winner.szavazat_szaz) - toNumber(runnerUp.szavazat_szaz)).toFixed(2),
    ),
  } satisfies HungaryPreviousResult
}

async function getStaticBundle(version: string, sourceMode: HungarySourceMode, signal?: AbortSignal) {
  if (staticCache?.version === version) {
    return {
      data: staticCache.data,
      sourceMode,
    }
  }

  const [
    constituencyMetaResponse,
    polygonResponse,
    listResponse,
    individualCandidateResponse,
    previousResultResponse,
    codeResponse,
  ] = await Promise.all([
    fetchHungaryJson<RawPayload<RawConstituencyMeta>>(`${version}/ver/OevkAdatok.json`, sourceMode, signal),
    fetchHungaryJson<RawPayload<RawPolygonMeta>>(`${version}/ver/OevkPoligonok.json`, sourceMode, signal),
    fetchHungaryJson<RawPayload<RawListRow>>(`${version}/ver/ListakEsJeloltek.json`, sourceMode, signal),
    fetchHungaryJson<RawPayload<RawIndividualCandidate>>(
      `${version}/ver/EgyeniJeloltek.json`,
      sourceMode,
      signal,
    ),
    fetchHungaryJson<RawPayload<RawPreviousResult>>(
      `${version}/ver/ElozoOevkEredmenyek.json`,
      sourceMode,
      signal,
    ),
    fetchHungaryJson<RawPayload<RawCodeRow>>(`${version}/ver/Kodtablak.json`, sourceMode, signal),
  ])

  const effectiveSourceMode = [
    constituencyMetaResponse.sourceMode,
    polygonResponse.sourceMode,
    listResponse.sourceMode,
    individualCandidateResponse.sourceMode,
    previousResultResponse.sourceMode,
    codeResponse.sourceMode,
  ].includes('proxy')
    ? 'proxy'
    : sourceMode

  const codeTables = groupCodeTable(codeResponse.data.list ?? [])
  const checkpoints = buildHungaryCheckpointList(
    (codeResponse.data.list ?? [])
      .filter((entry) => entry.tabla === 'JELIDO')
      .map((entry) => ({ code: entry.kod, label: entry.megnev })),
  )
  const checkpointByCode = new Map(checkpoints.map((checkpoint) => [checkpoint.code, checkpoint]))

  const previousRowsById = new Map<string, RawPreviousResult[]>()
  for (const row of previousResultResponse.data.list ?? []) {
    const constituencyId = toConstituencyId(row.maz, row.evk)
    const existing = previousRowsById.get(constituencyId) ?? []
    existing.push(row)
    previousRowsById.set(constituencyId, existing)
  }

  const candidatesByConstituencyId = new Map<string, CandidateBase[]>()
  const candidateById = new Map<number, CandidateBase>()
  for (const candidate of individualCandidateResponse.data.list ?? []) {
    const baseCandidate = {
      ejId: toNumber(candidate.ej_id),
      name: candidate.neve,
      alliance: candidate.jlcs_nev,
      ballotOrder:
        toNullableNumber(candidate.szavlap_sorsz) ?? toNullableNumber(candidate.sorsolt_sorsz),
      statusCode: candidate.allapot,
      statusLabel: readCodeLabel(codeTables, 'ALLAPOT', candidate.allapot),
    } satisfies CandidateBase

    candidateById.set(baseCandidate.ejId, baseCandidate)

    const constituencyId = toConstituencyId(candidate.maz, candidate.evk)
    const existing = candidatesByConstituencyId.get(constituencyId) ?? []
    existing.push(baseCandidate)
    candidatesByConstituencyId.set(constituencyId, existing)
  }

  for (const [constituencyId, candidates] of candidatesByConstituencyId) {
    candidatesByConstituencyId.set(
      constituencyId,
      candidates
        .slice()
        .sort(
          (left, right) =>
            (left.ballotOrder ?? Number.MAX_SAFE_INTEGER) -
            (right.ballotOrder ?? Number.MAX_SAFE_INTEGER),
        ),
    )
  }

  const listsById = new Map<number, ListBase>()
  for (const listEntry of listResponse.data.list ?? []) {
    const kind = inferListKind(listEntry)
    const thresholdPct = kind === 'minority' ? null : toNullableNumber(listEntry.hatar)
    listsById.set(listEntry.tl_id, {
      listId: toNumber(listEntry.tl_id),
      shortName: listEntry.jlcs_nev,
      kind,
      ballotOrder: toNullableNumber(listEntry.szavlap_sorsz),
      drawOrder: toNumber(listEntry.sorsolt_sorsz),
      thresholdPct,
      thresholdLabel: formatHungaryThreshold(thresholdPct),
      statusCode: listEntry.allapot,
      statusLabel: readCodeLabel(codeTables, 'ALLAPOT', listEntry.allapot),
      candidateCount: listEntry.jeloltek?.length ?? 0,
    })
  }

  const geometryById = new Map(
    (polygonResponse.data.list ?? []).map((record) => [
      toConstituencyId(record.maz, record.evk),
      {
        id: toConstituencyId(record.maz, record.evk),
        center: parseCenter(record.centrum),
        polygon: record.poligon,
      } satisfies HungaryGeometryRecord,
    ]),
  )

  const constituencies: ConstituencyBase[] = (constituencyMetaResponse.data.list ?? []).map((entry) => {
    const id = toConstituencyId(entry.maz, entry.evk)

    return {
      id,
      countyCode: entry.maz,
      countyName: entry.maz_nev,
      countyNameEn: entry.maz_nev_en ?? entry.maz_nev,
      constituencyCode: entry.evk,
      name: entry.evk_nev,
      nameEn: entry.evk_nev_en ?? entry.evk_nev,
      seat: entry.szekhely,
      seatEn: entry.szekhely_en ?? entry.szekhely,
      electorate: toNumber(entry.letszam?.osszesen),
      candidateVoteLimit: toNumber(entry.oevk_jeloltre_szavhat),
      candidates: candidatesByConstituencyId.get(id) ?? [],
      previousResult: buildPreviousResult(previousRowsById.get(id) ?? []),
    }
  })

  const staticBundle: StaticBundle = {
    generatedAt: pickLatestTimestamp([
      readGeneratedAt(constituencyMetaResponse.data),
      readGeneratedAt(polygonResponse.data),
      readGeneratedAt(listResponse.data),
      readGeneratedAt(individualCandidateResponse.data),
      readGeneratedAt(previousResultResponse.data),
      readGeneratedAt(codeResponse.data),
    ]),
    checkpoints,
    checkpointByCode,
    candidateById,
    listsById,
    constituencies,
    geometryRecords: constituencies
      .map((constituency) => geometryById.get(constituency.id))
      .filter((record): record is HungaryGeometryRecord => Boolean(record)),
  }

  staticCache = {
    version,
    data: staticBundle,
  }

  return {
    data: staticBundle,
    sourceMode: effectiveSourceMode,
  }
}

async function getTurnoutBundle(
  version: string,
  sourceMode: HungarySourceMode,
  mode: HungaryDataMode,
  signal?: AbortSignal,
) {
  const maxAge = mode === 'results' ? HUNGARY_RESULTS_POLL_MS : HUNGARY_TURNOUT_POLL_MS

  if (turnoutCache?.version === version && Date.now() - turnoutCache.fetchedAt < maxAge) {
    return {
      data: turnoutCache.data,
      sourceMode,
    }
  }

  const [nationalResponse, countyResponse, constituencyResponse] = await Promise.all([
    fetchHungaryJson<RawPayload<RawNationalTurnout>>(
      `${version}/napkozi/ReszvetelOrszag.json`,
      sourceMode,
      signal,
    ),
    fetchHungaryJson<RawPayload<RawCountyTurnout>>(
      `${version}/napkozi/ReszvetelMegye.json`,
      sourceMode,
      signal,
    ),
    fetchHungaryJson<RawPayload<RawConstituencyTurnout>>(
      `${version}/napkozi/ReszvetelOevk.json`,
      sourceMode,
      signal,
    ),
  ])

  const effectiveSourceMode =
    nationalResponse.sourceMode === 'proxy'
    || countyResponse.sourceMode === 'proxy'
    || constituencyResponse.sourceMode === 'proxy'
      ? 'proxy'
      : sourceMode

  const nationalRows = (nationalResponse.data.list ?? [])
    .slice()
    .sort((left, right) => toNumber(left.jelido) - toNumber(right.jelido))

  const latestCheckpointCode = nationalRows.at(-1)?.jelido ?? null

  const countyRowsByCode = new Map<string, RawCountyTurnout>()
  for (const row of countyResponse.data.list ?? []) {
    if (row.jelido === latestCheckpointCode) {
      countyRowsByCode.set(row.maz, row)
    }
  }

  const constituencyRowsById = new Map<string, RawConstituencyTurnout>()
  for (const row of constituencyResponse.data.list ?? []) {
    if (row.jelido === latestCheckpointCode) {
      constituencyRowsById.set(toConstituencyId(row.maz, row.evk), row)
    }
  }

  const turnoutBundle: TurnoutBundle = {
    generatedAt: pickLatestTimestamp([
      readGeneratedAt(nationalResponse.data),
      readGeneratedAt(countyResponse.data),
      readGeneratedAt(constituencyResponse.data),
    ]),
    latestCheckpointCode,
    nationalRows,
    countyRowsByCode,
    constituencyRowsById,
  }

  turnoutCache = {
    version,
    fetchedAt: Date.now(),
    data: turnoutBundle,
  }

  return {
    data: turnoutBundle,
    sourceMode: effectiveSourceMode,
  }
}

async function getResultsBundle(version: string, sourceMode: HungarySourceMode, signal?: AbortSignal) {
  if (resultsCache?.version === version && Date.now() - resultsCache.fetchedAt < HUNGARY_RESULTS_POLL_MS) {
    return {
      data: resultsCache.data,
      sourceMode,
    }
  }

  const [constituencyResultResponse, leaderResponse, closeContestResponse, listResponse, thresholdResponse] =
    await Promise.all([
      fetchHungaryJson<RawPayload<RawConstituencyResult>>(`${version}/szavossz/OevkJkv.json`, sourceMode, signal),
      fetchHungaryJson<RawPayload<RawLeader>>(`${version}/szavossz/OevkElsok.json`, sourceMode, signal),
      fetchHungaryJson<RawPayload<RawCloseContest>>(
        `${version}/szavossz/SzorosVerseny.json`,
        sourceMode,
        signal,
      ),
      fetchHungaryJson<RawPayload<RawNationalListResult>>(
        `${version}/szavossz/ListasJkv.json`,
        sourceMode,
        signal,
      ),
      fetchHungaryJson<RawPayload<never> & { data?: RawThresholdData }>(
        `${version}/szavossz/HatarszamEredmenye.json`,
        sourceMode,
        signal,
      ),
    ])

  const effectiveSourceMode =
    constituencyResultResponse.sourceMode === 'proxy'
    || leaderResponse.sourceMode === 'proxy'
    || closeContestResponse.sourceMode === 'proxy'
    || listResponse.sourceMode === 'proxy'
    || thresholdResponse.sourceMode === 'proxy'
      ? 'proxy'
      : sourceMode

  const resultsBundle: ResultsBundle = {
    generatedAt: pickLatestTimestamp([
      readGeneratedAt(constituencyResultResponse.data),
      readGeneratedAt(leaderResponse.data),
      readGeneratedAt(closeContestResponse.data),
      readGeneratedAt(listResponse.data),
      readGeneratedAt(thresholdResponse.data),
    ]),
    constituencyResultsById: new Map(
      (constituencyResultResponse.data.list ?? []).map((entry) => [
        toConstituencyId(entry.maz, entry.evk),
        entry,
      ]),
    ),
    leaderByConstituencyId: new Map(
      (leaderResponse.data.list ?? []).map((entry) => [toConstituencyId(entry.maz, entry.evk), entry]),
    ),
    closeContests: closeContestResponse.data.list ?? [],
    nationalListResult:
      (listResponse.data.list ?? []).find((entry) => entry.oszint === '5')
      ?? (listResponse.data.list ?? [])[0]
      ?? null,
    thresholds: (thresholdResponse.data.data ?? null) as RawThresholdData | null,
  }

  resultsCache = {
    version,
    fetchedAt: Date.now(),
    data: resultsBundle,
  }

  return {
    data: resultsBundle,
    sourceMode: effectiveSourceMode,
  }
}

function buildCandidateResults(
  candidates: CandidateBase[],
  candidateById: Map<number, CandidateBase>,
  resultLines: RawResultLine[] | undefined,
) {
  const linesByCandidateId = new Map<number, RawResultLine>()

  for (const line of resultLines ?? []) {
    linesByCandidateId.set(toNumber(line.ej_id), line)
  }

  const rows = new Map<number, HungaryCandidateResult>()

  for (const candidate of candidates) {
    const line = linesByCandidateId.get(candidate.ejId)
    rows.set(candidate.ejId, {
      ...candidate,
      votes: line ? toNumber(line.szavazat) : null,
      votePct: line ? toNumber(line.szavazat_szaz) : null,
      seatWon: line?.mandatum === 1,
    })
  }

  for (const line of resultLines ?? []) {
    const candidateId = toNumber(line.ej_id)

    if (rows.has(candidateId)) {
      continue
    }

    const fallbackCandidate = candidateById.get(candidateId)

    rows.set(candidateId, {
      ejId: candidateId,
      name: fallbackCandidate?.name ?? `Aday ${candidateId}`,
      alliance: fallbackCandidate?.alliance ?? 'Bilinmeyen',
      ballotOrder: fallbackCandidate?.ballotOrder ?? toNullableNumber(line.sorsz),
      statusCode: fallbackCandidate?.statusCode ?? '',
      statusLabel: fallbackCandidate?.statusLabel ?? '',
      votes: toNumber(line.szavazat),
      votePct: toNumber(line.szavazat_szaz),
      seatWon: line.mandatum === 1,
    })
  }

  return Array.from(rows.values()).sort((left, right) => {
    const leftVotes = left.votes ?? -1
    const rightVotes = right.votes ?? -1

    if (leftVotes !== rightVotes) {
      return rightVotes - leftVotes
    }

    return (left.ballotOrder ?? Number.MAX_SAFE_INTEGER) - (right.ballotOrder ?? Number.MAX_SAFE_INTEGER)
  })
}

function buildLiveCloseContests(
  staticData: StaticBundle,
  resultsData: ResultsBundle,
): HungaryCloseContest[] {
  return resultsData.closeContests
    .map((entry) => {
      const constituencyId = toConstituencyId(entry.maz, entry.evk)
      const constituency = staticData.constituencies.find((item) => item.id === constituencyId)
      const leader = staticData.candidateById.get(toNumber(entry.ej_id1))
      const runnerUp = staticData.candidateById.get(toNumber(entry.ej_id2))

      if (!constituency || !leader || !runnerUp) {
        return null
      }

      return {
        kind: 'live-close',
        constituencyId,
        constituencyName: constituency.name,
        countyName: constituency.countyName,
        processedPct: toNullableNumber(entry.feldar),
        leaderName: leader.name,
        leaderAlliance: leader.alliance,
        leaderVotes: toNumber(entry.szavazat1),
        leaderVotePct: toNumber(entry.szavazat1_szaz),
        runnerUpName: runnerUp.name,
        runnerUpAlliance: runnerUp.alliance,
        runnerUpVotes: toNumber(entry.szavazat2),
        runnerUpVotePct: toNumber(entry.szavazat2_szaz),
        marginVotes: toNumber(entry.szavazat_kulonbseg),
        marginPct: Number(
          (toNumber(entry.szavazat1_szaz) - toNumber(entry.szavazat2_szaz)).toFixed(2),
        ),
        remainingSwingVotes: toNullableNumber(entry.max_szavazat_nevj),
      }
    })
    .filter((entry): entry is HungaryCloseContest => entry !== null)
    .sort((left, right) => left.marginVotes - right.marginVotes)
    .slice(0, 8)
}

function buildBattlegrounds(
  constituencies: HungaryElectionSnapshot['constituencies'],
): HungaryCloseContest[] {
  return constituencies
    .filter((constituency) => constituency.previousResult)
    .sort(
      (left, right) =>
        (left.previousResult?.marginVotes ?? Number.MAX_SAFE_INTEGER)
        - (right.previousResult?.marginVotes ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 8)
    .map((constituency) => {
      const previous = constituency.previousResult!

      return {
        kind: 'battleground',
        constituencyId: constituency.id,
        constituencyName: constituency.name,
        countyName: constituency.countyName,
        processedPct: null,
        leaderName: previous.winnerName,
        leaderAlliance: previous.winnerAlliance,
        leaderVotes: previous.winnerVotes,
        leaderVotePct: previous.winnerVotePct,
        runnerUpName: previous.runnerUpName,
        runnerUpAlliance: previous.runnerUpAlliance,
        runnerUpVotes: previous.runnerUpVotes,
        runnerUpVotePct: previous.runnerUpVotePct,
        marginVotes: previous.marginVotes,
        marginPct: previous.marginPct,
        remainingSwingVotes: null,
      }
    })
}

function buildSnapshot(input: {
  config: ConfigPayload
  sourceMode: HungarySourceMode
  staticData: StaticBundle
  turnoutData: TurnoutBundle
  resultsData: ResultsBundle | null
}) {
  const { config, sourceMode, staticData, turnoutData, resultsData } = input
  const mode: HungaryDataMode = config.szavossz ? 'results' : 'turnout'

  const turnoutTimeline: HungaryTurnoutPoint[] = turnoutData.nationalRows.map((row) => {
    const checkpoint = staticData.checkpointByCode.get(row.jelido)

    return {
      checkpointCode: row.jelido,
      label: checkpoint?.label ?? row.jelido,
      turnoutCount: toNumber(row.megj),
      turnoutPct: percent(toNumber(row.megj), toNumber(row.valp)),
    }
  })

  const latestNationalTurnout = turnoutData.nationalRows.at(-1) ?? null

  const constituencies = staticData.constituencies.map((constituency) => {
    const turnoutRow = turnoutData.constituencyRowsById.get(constituency.id)
    const resultRow = resultsData?.constituencyResultsById.get(constituency.id)
    const leaderRow = resultsData?.leaderByConstituencyId.get(constituency.id)
    const candidateResults = buildCandidateResults(
      constituency.candidates,
      staticData.candidateById,
      resultRow?.egyeni_jkv.tetelek,
    )

    const leadingCandidateId =
      toNullableNumber(leaderRow?.ej_id)
      ?? candidateResults.find((candidate) => candidate.votes !== null)?.ejId
      ?? null
    const leadingCandidate = leadingCandidateId ? staticData.candidateById.get(leadingCandidateId) : null
    const liveElectorate =
      toNullableNumber(resultRow?.egyeni_jkv.vp_osszes)
      ?? toNullableNumber(turnoutRow?.valp)
      ?? constituency.electorate
    const turnoutCount =
      toNullableNumber(resultRow?.egyeni_jkv.szavazott_osszesen)
      ?? toNullableNumber(turnoutRow?.megj)
    const turnoutPct =
      toNullableNumber(resultRow?.egyeni_jkv.szavazott_osszesen_szaz)
      ?? percent(turnoutCount, liveElectorate)
    const processedPct = toNullableNumber(resultRow?.egyeni_jkv.feldar)
    const isOfficial = resultRow?.egyeni_jkv.jogeros === 'I'

    return {
      ...constituency,
      electorate: liveElectorate,
      turnoutCount,
      turnoutPct,
      checkpointCode: turnoutData.latestCheckpointCode,
      leadingCandidateId,
      leadingCandidateName: leadingCandidate?.name ?? null,
      leadingAlliance: leadingCandidate?.alliance ?? null,
      processedPct,
      resultStatus: !resultRow
        ? null
        : isOfficial
          ? 'Kesinlesti'
          : processedPct !== null
            ? `Sayim %${processedPct.toFixed(1)}`
            : 'Sonuc akisi acik',
      isOfficial,
      candidates: candidateResults,
    }
  })

  const countiesAccumulator = new Map<
    string,
    { code: string; name: string; nameEn: string; turnoutCount: number; electorate: number; constituencyCount: number }
  >()

  for (const constituency of constituencies) {
    const current = countiesAccumulator.get(constituency.countyCode) ?? {
      code: constituency.countyCode,
      name: constituency.countyName,
      nameEn: constituency.countyNameEn,
      turnoutCount: 0,
      electorate: 0,
      constituencyCount: 0,
    }

    current.turnoutCount += constituency.turnoutCount ?? 0
    current.electorate += constituency.electorate
    current.constituencyCount += 1
    countiesAccumulator.set(constituency.countyCode, current)
  }

  const counties = Array.from(countiesAccumulator.values())
    .map((county) => {
      const row = turnoutData.countyRowsByCode.get(county.code)
      const electorate = toNullableNumber(row?.valp) ?? county.electorate
      const turnoutCount = toNullableNumber(row?.megj) ?? county.turnoutCount

      return {
        code: county.code,
        name: county.name,
        nameEn: county.nameEn,
        electorate,
        turnoutCount,
        turnoutPct: percent(turnoutCount, electorate),
        constituencyCount: county.constituencyCount,
      }
    })
    .sort((left, right) => left.code.localeCompare(right.code))

  const thresholds = {
    totalListVotes:
      toNullableNumber(resultsData?.thresholds?.ossz_listas_szavazat)
      ?? toNullableNumber(resultsData?.nationalListResult?.partlistara_szl_ervenyes),
    threshold5: toNullableNumber(resultsData?.thresholds?.hatar_5),
    threshold10: toNullableNumber(resultsData?.thresholds?.hatar_10),
    threshold15: toNullableNumber(resultsData?.thresholds?.hatar_15),
    minorityPreference: toNullableNumber(resultsData?.thresholds?.nemz_kedv_hatar),
  }

  const liveListResultsById = new Map(
    (resultsData?.nationalListResult?.tetelek ?? []).map((entry) => [toNumber(entry.tl_id), entry]),
  )

  const lists: HungaryListSnapshot[] = Array.from(staticData.listsById.values())
    .map((listBase) => {
      const liveResult = liveListResultsById.get(listBase.listId)
      const validVotesBase =
        listBase.kind === 'minority'
          ? thresholds.minorityPreference
          : listBase.thresholdPct === 15
            ? thresholds.threshold15
            : listBase.thresholdPct === 10
              ? thresholds.threshold10
              : thresholds.threshold5
      const voteCount = toNullableNumber(liveResult?.osszes_szavazat)

      return {
        ...listBase,
        voteCount,
        votePct:
          toNullableNumber(liveResult?.osszes_szavazat_partlistas_szaz)
          ?? toNullableNumber(liveResult?.osszes_szavazat_szaz),
        seatCount: toNullableNumber(liveResult?.mandatum),
        thresholdMet:
          voteCount === null || validVotesBase === null ? null : voteCount >= validVotesBase,
        validVotesBase,
      }
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        const order = { national: 0, joint: 1, minority: 2 }
        return order[left.kind] - order[right.kind]
      }

      return (left.ballotOrder ?? left.drawOrder) - (right.ballotOrder ?? right.drawOrder)
    })

  const reportingConstituencies =
    mode === 'results'
      ? constituencies.filter((constituency) => (constituency.processedPct ?? 0) > 0).length
      : constituencies.filter((constituency) => constituency.turnoutCount !== null).length

  const snapshot: HungaryElectionSnapshot = {
    mode,
    sourceMode,
    generatedAt: pickLatestTimestamp([
      turnoutData.generatedAt,
      resultsData?.generatedAt,
      staticData.generatedAt,
    ]),
    configVersion: config.ver,
    turnoutVersion: config.napkozi,
    resultVersion: config.szavossz,
    checkpoint:
      (turnoutData.latestCheckpointCode
        ? staticData.checkpointByCode.get(turnoutData.latestCheckpointCode)
        : null) ?? null,
    checkpoints: staticData.checkpoints,
    national: {
      electorate:
        toNullableNumber(resultsData?.nationalListResult?.vp_osszes)
        ?? toNullableNumber(latestNationalTurnout?.valp)
        ?? constituencies.reduce((sum, constituency) => sum + constituency.electorate, 0),
      turnoutCount:
        toNullableNumber(resultsData?.nationalListResult?.szavazott_osszesen)
        ?? toNullableNumber(latestNationalTurnout?.megj)
        ?? constituencies.reduce((sum, constituency) => sum + (constituency.turnoutCount ?? 0), 0),
      turnoutPct:
        toNullableNumber(resultsData?.nationalListResult?.szavazott_osszesen_szaz)
        ?? percent(
          toNullableNumber(latestNationalTurnout?.megj),
          toNullableNumber(latestNationalTurnout?.valp),
        ),
      checkpointCode: turnoutData.latestCheckpointCode,
      reportingConstituencies,
      totalConstituencies: constituencies.length,
      listValidVotes: toNullableNumber(resultsData?.nationalListResult?.partlistara_szl_ervenyes),
      listValidVotesPct: toNullableNumber(
        resultsData?.nationalListResult?.partlistara_szl_ervenyes_szaz,
      ),
    },
    turnoutTimeline,
    counties,
    constituencies,
    lists,
    closeContests:
      mode === 'results' && resultsData ? buildLiveCloseContests(staticData, resultsData) : [],
    thresholds,
  }

  if (snapshot.closeContests.length === 0) {
    snapshot.closeContests = buildBattlegrounds(snapshot.constituencies)
  }

  return snapshot
}

export async function getHungaryElectionSnapshot(
  options: { signal?: AbortSignal } = {},
): Promise<HungarySnapshotBundle> {
  const { config, sourceMode: configSourceMode } = await getConfig(options.signal)
  const { data: staticData, sourceMode: staticSourceMode } = await getStaticBundle(
    config.ver,
    configSourceMode,
    options.signal,
  )
  const mode: HungaryDataMode = config.szavossz ? 'results' : 'turnout'
  const { data: turnoutData, sourceMode: turnoutSourceMode } = await getTurnoutBundle(
    config.napkozi,
    staticSourceMode,
    mode,
    options.signal,
  )

  let resultsData: ResultsBundle | null = null
  let finalSourceMode: HungarySourceMode =
    configSourceMode === 'proxy' || staticSourceMode === 'proxy' || turnoutSourceMode === 'proxy'
      ? 'proxy'
      : 'direct'

  if (config.szavossz) {
    const resultsResponse = await getResultsBundle(config.szavossz, turnoutSourceMode, options.signal)
    resultsData = resultsResponse.data
    finalSourceMode = resultsResponse.sourceMode
  }

  return {
    snapshot: buildSnapshot({
      config,
      sourceMode: finalSourceMode,
      staticData,
      turnoutData,
      resultsData,
    }),
    geometryVersion: config.ver,
    geometryRecords: staticData.geometryRecords,
    pollIntervalMs: mode === 'results' ? HUNGARY_RESULTS_POLL_MS : HUNGARY_TURNOUT_POLL_MS,
  }
}
