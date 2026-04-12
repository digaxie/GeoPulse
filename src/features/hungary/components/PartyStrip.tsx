import { getHungaryAllianceColor, formatHungaryInteger, formatHungaryPercent } from '../constants'
import type { HungaryElectionSnapshot, HungaryListKind } from '../types'

type PartyStripProps = {
  snapshot: HungaryElectionSnapshot
}

function getListKindLabel(kind: HungaryListKind) {
  if (kind === 'minority') {
    return 'Azinlik listesi'
  }

  if (kind === 'joint') {
    return 'Ortak liste'
  }

  return 'Ulusal liste'
}

export function PartyStrip({ snapshot }: PartyStripProps) {
  return (
    <section className="hungary-panel">
      <div className="hungary-panel-header">
        <div>
          <p className="hungary-panel-kicker">Party strip</p>
          <h2>Ulusal liste panosu</h2>
        </div>
        <p className="hungary-panel-text">
          {snapshot.mode === 'results'
            ? 'ListasJkv sonucu geldikce oy orani ve sandalye dagilimi burada akar.'
            : 'Sandik acik kalirken liste sirasi, baraj tipi ve aday kapasitesi burada gorunur.'}
        </p>
      </div>

      <div className="hungary-party-grid">
        {snapshot.lists.map((entry) => {
          const accentColor = getHungaryAllianceColor(entry.shortName)
          const fillWidth = Math.max(4, Math.min(100, entry.votePct ?? 6))

          return (
            <article className="hungary-party-card" key={entry.listId}>
              <div className="hungary-party-head">
                <div>
                  <h3>{entry.shortName}</h3>
                  <p>{getListKindLabel(entry.kind)}</p>
                </div>
                <span className="hungary-badge">{entry.thresholdLabel}</span>
              </div>

              <div className="hungary-party-bar">
                <span style={{ width: `${fillWidth}%`, backgroundColor: accentColor }} />
              </div>

              <div className="hungary-party-meta">
                <span>Aday {formatHungaryInteger(entry.candidateCount)}</span>
                <span>Durum {entry.statusLabel}</span>
                {entry.validVotesBase !== null ? (
                  <span>Esik {formatHungaryInteger(entry.validVotesBase)}</span>
                ) : null}
              </div>

              <div className="hungary-party-stats">
                <strong>
                  {entry.votePct !== null ? formatHungaryPercent(entry.votePct, 2) : '--'}
                </strong>
                <span>{entry.voteCount !== null ? formatHungaryInteger(entry.voteCount) : 'Canli oy yok'}</span>
                <span>
                  {entry.seatCount !== null
                    ? `${formatHungaryInteger(entry.seatCount)} sandalye`
                    : 'Sandalye akisi kapali'}
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
