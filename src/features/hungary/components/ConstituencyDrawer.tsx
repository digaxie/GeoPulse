import { useMemo } from 'react'

import { formatHungaryInteger, formatHungaryPercent } from '../constants'
import type { HungaryElectionSnapshot } from '../types'
import { useHungaryStore } from '../useHungaryStore'

type ConstituencyDrawerProps = {
  snapshot: HungaryElectionSnapshot
}

export function ConstituencyDrawer({
  snapshot,
}: ConstituencyDrawerProps) {
  const selectedConstituencyId = useHungaryStore((state) => state.selectedConstituencyId)
  const hoveredConstituencyId = useHungaryStore((state) => state.hoveredConstituencyId)

  const constituencyById = useMemo(() => {
    const map = new Map<string, HungaryElectionSnapshot['constituencies'][number]>()
    for (const c of snapshot.constituencies) {
      map.set(c.id, c)
    }
    return map
  }, [snapshot.constituencies])

  const activeConstituency = useMemo(() => {
    const preferredId =
      selectedConstituencyId
      ?? hoveredConstituencyId
      ?? snapshot.closeContests[0]?.constituencyId
      ?? snapshot.constituencies[0]?.id

    return (preferredId ? constituencyById.get(preferredId) : null) ?? null
  }, [hoveredConstituencyId, selectedConstituencyId, snapshot.closeContests, snapshot.constituencies, constituencyById])

  if (!activeConstituency) {
    return null
  }

  const visibleCandidates =
    snapshot.mode === 'results'
      ? activeConstituency.candidates.slice(0, 8)
      : activeConstituency.candidates.slice(0, 6)

  return (
    <section className="hungary-panel">
      <div className="hungary-panel-header">
        <div>
          <p className="hungary-panel-kicker">
            {selectedConstituencyId ? 'Secili cevre' : hoveredConstituencyId ? 'Imlec alti cevre' : 'Odaktaki cevre'}
          </p>
          <h2>{activeConstituency.name}</h2>
        </div>
        <div className="hungary-drawer-tags">
          <span className="hungary-badge">{activeConstituency.countyName}</span>
          <span className="hungary-badge">{activeConstituency.seat}</span>
          {activeConstituency.resultStatus ? <span className="hungary-badge">{activeConstituency.resultStatus}</span> : null}
        </div>
      </div>

      <div className="hungary-drawer-stats">
        <div>
          <span>Secmen</span>
          <strong>{formatHungaryInteger(activeConstituency.electorate)}</strong>
        </div>
        <div>
          <span>Katilim</span>
          <strong>{formatHungaryPercent(activeConstituency.turnoutPct)}</strong>
        </div>
        <div>
          <span>Gelen oy</span>
          <strong>{formatHungaryInteger(activeConstituency.turnoutCount)}</strong>
        </div>
        <div>
          <span>Sayim</span>
          <strong>
            {activeConstituency.processedPct !== null
              ? formatHungaryPercent(activeConstituency.processedPct)
              : 'Yok'}
          </strong>
        </div>
      </div>

      {activeConstituency.previousResult ? (
        <div className="hungary-drawer-previous">
          <h3>2022 referansi</h3>
          <p>
            {activeConstituency.previousResult.winnerName} / {activeConstituency.previousResult.winnerAlliance}
          </p>
          <div className="hungary-drawer-previous-meta">
            <span>{formatHungaryPercent(activeConstituency.previousResult.winnerVotePct, 2)}</span>
            <span>Fark {formatHungaryInteger(activeConstituency.previousResult.marginVotes)}</span>
            <span>{formatHungaryPercent(activeConstituency.previousResult.marginPct, 2)}</span>
          </div>
        </div>
      ) : null}

      <div className="hungary-candidate-table">
        <div className="hungary-candidate-table-head">
          <span>{snapshot.mode === 'results' ? 'Aday / oy' : 'Aday lineup'}</span>
          <span>{snapshot.mode === 'results' ? 'Yuzde' : 'Durum'}</span>
        </div>
        {visibleCandidates.map((candidate) => (
          <div className="hungary-candidate-row" key={candidate.ejId}>
            <div>
              <strong>{candidate.name}</strong>
              <span>{candidate.alliance}</span>
            </div>
            <div className="hungary-candidate-metrics">
              {snapshot.mode === 'results' ? (
                <>
                  <strong>{candidate.votePct !== null ? formatHungaryPercent(candidate.votePct, 2) : '--'}</strong>
                  <span>{candidate.votes !== null ? formatHungaryInteger(candidate.votes) : '--'}</span>
                </>
              ) : (
                <>
                  <strong>#{candidate.ballotOrder ?? '--'}</strong>
                  <span>{candidate.statusLabel || 'Kayitli'}</span>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
