import type { TvGridLayout } from '../types'
import { useTvStore } from '../useTvStore'

const LAYOUT_OPTIONS: TvGridLayout[] = [1, 4, 6, 9]

export function TvControls() {
  const { layout, setLayout, muteAll, unmuteAll, stopAll, resetLayout, globalMuted } =
    useTvStore()

  return (
    <div className="tv-controls">
      <div className="tv-controls-group">
        <span className="tv-controls-label">Grid</span>
        {LAYOUT_OPTIONS.map((opt) => (
          <button
            className={`tv-controls-btn${layout === opt ? ' tv-controls-btn--active' : ''}`}
            key={opt}
            onClick={() => setLayout(opt)}
            type="button"
          >
            {opt === 1 ? '1' : opt === 4 ? '2×2' : opt === 6 ? '2×3' : '3×3'}
          </button>
        ))}
      </div>

      <div className="tv-controls-group">
        <button
          className="tv-controls-btn"
          onClick={globalMuted ? unmuteAll : muteAll}
          type="button"
        >
          {globalMuted ? '🔊 Sesleri Aç' : '🔇 Tümünü Sustur'}
        </button>
        <button className="tv-controls-btn" onClick={stopAll} type="button">
          ⏹ Tümünü Durdur
        </button>
        <button className="tv-controls-btn" onClick={resetLayout} type="button">
          ↺ Sıfırla
        </button>
      </div>
    </div>
  )
}
