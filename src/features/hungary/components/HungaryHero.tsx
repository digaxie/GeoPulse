import { memo } from 'react'
import { Link } from 'react-router-dom'

import {
  HUNGARY_LIST_SEATS,
  HUNGARY_TOTAL_CONSTITUENCIES,
  HUNGARY_TOTAL_PARLIAMENT_SEATS,
  formatHungaryCompact,
  formatHungaryInteger,
  formatHungaryPercent,
  formatHungarySourceMode,
  formatHungaryTimestamp,
} from '../constants'
import type { HungaryElectionSnapshot } from '../types'

type HungaryHeroProps = {
  snapshot: HungaryElectionSnapshot | null
  isRefreshing: boolean
  isStale: boolean
}

export const HungaryHero = memo(function HungaryHero({ snapshot, isRefreshing, isStale }: HungaryHeroProps) {
  const modeLabel = snapshot?.mode === 'results' ? 'Sonuc Modu' : 'Katilim Modu'
  const tickerItems = [
    'Resmi NVI / VTR veri akisi',
    `${HUNGARY_TOTAL_CONSTITUENCIES} cevre`,
    `${HUNGARY_TOTAL_PARLIAMENT_SEATS} sandalye`,
    `${HUNGARY_LIST_SEATS} ulusal liste sandalyeleri`,
    snapshot?.checkpoint
      ? `Son checkpoint ${snapshot.checkpoint.budapestTime} / TR ${snapshot.checkpoint.istanbulTime}`
      : 'Sandik gunu izleme ekrani',
  ]

  return (
    <header className="hungary-hero">
      <div className="hungary-hero-topline">
        <Link className="hungary-back-link" to="/app">
          Huba don
        </Link>
        <div className="hungary-status-row">
          <span className="hungary-badge hungary-badge--mode">{modeLabel}</span>
          <span className="hungary-badge">{snapshot ? formatHungarySourceMode(snapshot.sourceMode) : 'Baglanti hazirlaniyor'}</span>
          {isRefreshing ? <span className="hungary-badge hungary-badge--live">Yenileniyor</span> : null}
          {isStale ? <span className="hungary-badge hungary-badge--warn">Son veri korunuyor</span> : null}
        </div>
      </div>

      <div className="hungary-hero-grid">
        <div className="hungary-hero-copy">
          <p className="hungary-kicker">GeoPulse / Election Night / Hungary</p>
          <h1>GeoPulse - Hungary</h1>
          <p className="hungary-subtitle">
            12 Nisan 2026 Macaristan parlamento secimi icin resmi veri akisi, 106 cevre haritasi,
            yakin yarislar ve ulusal liste takibi tek sayfada.
          </p>

          <div className="hungary-copy-meta">
            <span>106 tek cevre + 93 liste sandalyesi</span>
            <span>Budapest merkezli resmi checkpoint akisi</span>
            <span>NVI config ile otomatik mod degisimi</span>
          </div>
        </div>

        <aside className="hungary-hero-brief">
          <div className="hungary-brief-row">
            <span className="hungary-brief-label">Resmi veri zamani</span>
            <strong>{snapshot ? formatHungaryTimestamp(snapshot.generatedAt) : '--'}</strong>
          </div>
          <div className="hungary-brief-row">
            <span className="hungary-brief-label">Katilim</span>
            <strong>
              {snapshot ? formatHungaryInteger(snapshot.national.turnoutCount) : '--'}
              <span>{snapshot ? formatHungaryPercent(snapshot.national.turnoutPct) : ''}</span>
            </strong>
          </div>
          <div className="hungary-brief-row">
            <span className="hungary-brief-label">Kayitli secmen</span>
            <strong>{snapshot ? formatHungaryCompact(snapshot.national.electorate) : '--'}</strong>
          </div>
          <div className="hungary-brief-row">
            <span className="hungary-brief-label">Takip edilen cevre</span>
            <strong>
              {snapshot ? `${snapshot.national.reportingConstituencies}/${snapshot.national.totalConstituencies}` : '--'}
            </strong>
          </div>
        </aside>
      </div>

      <div className="hungary-ticker" aria-label="Hungary election ticker">
        <div className="hungary-ticker-track">
          {[...tickerItems, ...tickerItems].map((item, index) => (
            <span className="hungary-ticker-item" key={`${item}-${index}`}>
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="hungary-stat-grid">
        <div className="hungary-stat-card">
          <span className="hungary-stat-label">Ulusal secmen havuzu</span>
          <strong className="hungary-stat-value">
            {snapshot ? formatHungaryInteger(snapshot.national.electorate) : '--'}
          </strong>
        </div>
        <div className="hungary-stat-card">
          <span className="hungary-stat-label">Oy kullanan secmen</span>
          <strong className="hungary-stat-value">
            {snapshot ? formatHungaryInteger(snapshot.national.turnoutCount) : '--'}
          </strong>
          <span className="hungary-stat-hint">
            {snapshot ? formatHungaryPercent(snapshot.national.turnoutPct) : '--'}
          </span>
        </div>
        <div className="hungary-stat-card">
          <span className="hungary-stat-label">Aktif checkpoint</span>
          <strong className="hungary-stat-value">
            {snapshot?.checkpoint ? snapshot.checkpoint.budapestTime : '--'}
          </strong>
          <span className="hungary-stat-hint">
            {snapshot?.checkpoint ? `TR ${snapshot.checkpoint.istanbulTime}` : 'Resmi bildirim bekleniyor'}
          </span>
        </div>
        <div className="hungary-stat-card">
          <span className="hungary-stat-label">Liste gecerli oy</span>
          <strong className="hungary-stat-value">
            {snapshot && snapshot.national.listValidVotes !== null
              ? formatHungaryInteger(snapshot.national.listValidVotes)
              : '--'}
          </strong>
          <span className="hungary-stat-hint">
            {snapshot && snapshot.national.listValidVotesPct !== null
              ? formatHungaryPercent(snapshot.national.listValidVotesPct, 2)
              : 'Sonuc modu acildiginda dolacak'}
          </span>
        </div>
      </div>
    </header>
  )
})
