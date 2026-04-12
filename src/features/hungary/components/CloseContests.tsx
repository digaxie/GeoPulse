import { memo } from 'react'

import { formatHungaryInteger, formatHungaryPercent } from '../constants'
import type { HungaryElectionSnapshot } from '../types'

type CloseContestsProps = {
  snapshot: HungaryElectionSnapshot
}

export const CloseContests = memo(function CloseContests({ snapshot }: CloseContestsProps) {
  const isLive = snapshot.closeContests[0]?.kind === 'live-close'

  return (
    <section className="hungary-panel">
      <div className="hungary-panel-header">
        <div>
          <p className="hungary-panel-kicker">{isLive ? 'Close races' : 'Battlegrounds'}</p>
          <h2>{isLive ? 'Canli yakin yarislar' : '2022 en dar marjlar'}</h2>
        </div>
        <p className="hungary-panel-text">
          {isLive
            ? 'Resmi SzorosVerseny akisi geldiginde lider farklari buradan izlenir.'
            : 'Sonuc acilmadan once bir onceki secimin en dar cevreleri battleground olarak kullanilir.'}
        </p>
      </div>

      <div className="hungary-contest-list">
        {snapshot.closeContests.map((contest) => (
          <article className="hungary-contest-card" key={`${contest.kind}-${contest.constituencyId}`}>
            <div className="hungary-contest-head">
              <div>
                <h3>{contest.constituencyName}</h3>
                <p>{contest.countyName}</p>
              </div>
              <span className="hungary-badge">
                {contest.processedPct !== null
                  ? `Sayim ${formatHungaryPercent(contest.processedPct)}`
                  : 'Gecmis marj'}
              </span>
            </div>
            <div className="hungary-contest-row">
              <span>{contest.leaderName}</span>
              <strong>{contest.leaderAlliance}</strong>
            </div>
            <div className="hungary-contest-row">
              <span>{contest.runnerUpName}</span>
              <strong>{contest.runnerUpAlliance}</strong>
            </div>
            <div className="hungary-contest-metrics">
              <span>Fark {formatHungaryInteger(contest.marginVotes)}</span>
              <span>{formatHungaryPercent(contest.marginPct, 2)}</span>
              {contest.remainingSwingVotes !== null ? (
                <span>Kalan alan {formatHungaryInteger(contest.remainingSwingVotes)}</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
})
