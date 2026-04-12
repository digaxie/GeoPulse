import { memo } from 'react'

import type { HungaryElectionSnapshot } from '../types'

type CheckpointTimelineProps = {
  snapshot: HungaryElectionSnapshot
}

export const CheckpointTimeline = memo(function CheckpointTimeline({ snapshot }: CheckpointTimelineProps) {
  const activeCode = Number(snapshot.checkpoint?.code ?? 0)

  return (
    <section className="hungary-panel">
      <div className="hungary-panel-header">
        <div>
          <p className="hungary-panel-kicker">Timeline</p>
          <h2>Resmi checkpoint akisi</h2>
        </div>
        <p className="hungary-panel-text">JELIDO kodlari burada saat karsiliklariyla gosterilir.</p>
      </div>

      <div className="hungary-timeline">
        {snapshot.checkpoints.map((checkpoint) => {
          const numericCode = Number(checkpoint.code)
          const state =
            numericCode === activeCode ? 'active' : numericCode < activeCode ? 'complete' : 'pending'

          return (
            <div
              className={`hungary-timeline-item hungary-timeline-item--${state}`}
              key={checkpoint.code}
              title={checkpoint.tooltip}
            >
              <span className="hungary-timeline-dot" aria-hidden="true" />
              <div>
                <strong>{checkpoint.budapestTime}</strong>
                <span>Budapest / TR {checkpoint.istanbulTime}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
})
