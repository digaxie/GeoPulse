import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import type { BriefingSlide } from '@/features/scenario/model'

type BriefingPanelProps = {
  slides: BriefingSlide[]
  activeSlideId: string | null
  canEdit: boolean
  presenterPath?: string | null
  onCreateSlide: () => void
  onSetActiveSlide: (slideId: string | null) => void
  onDuplicateSlide: (slideId: string) => void
  onDeleteSlide: (slideId: string) => void
  onMoveSlideUp: (slideId: string) => void
  onMoveSlideDown: (slideId: string) => void
  onRenameSlide: (slideId: string, title: string) => void
  onUpdateSlideNotes: (slideId: string, notes: string) => void
}

export function BriefingPanel({
  slides,
  activeSlideId,
  canEdit,
  presenterPath = null,
  onCreateSlide,
  onSetActiveSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlideUp,
  onMoveSlideDown,
  onRenameSlide,
  onUpdateSlideNotes,
}: BriefingPanelProps) {
  const activeSlide = useMemo(
    () => slides.find((slide) => slide.id === activeSlideId) ?? null,
    [activeSlideId, slides],
  )
  const [titleDraft, setTitleDraft] = useState<{ slideId: string | null; value: string }>({
    slideId: null,
    value: '',
  })
  const [notesDraft, setNotesDraft] = useState<{ slideId: string | null; value: string }>({
    slideId: null,
    value: '',
  })
  const localTitle = titleDraft.slideId === activeSlide?.id ? titleDraft.value : activeSlide?.title ?? ''
  const localNotes = notesDraft.slideId === activeSlide?.id ? notesDraft.value : activeSlide?.notes ?? ''

  function commitTitle(value: string) {
    if (!activeSlide) {
      setTitleDraft({ slideId: null, value: '' })
      return
    }

    const nextTitle = value.trim() || activeSlide.title
    setTitleDraft({ slideId: null, value: '' })
    if (nextTitle !== activeSlide.title) {
      onRenameSlide(activeSlide.id, nextTitle)
    }
  }

  function commitNotes(value: string) {
    if (!activeSlide) {
      setNotesDraft({ slideId: null, value: '' })
      return
    }

    setNotesDraft({ slideId: null, value: '' })
    if (value === activeSlide.notes) {
      return
    }

    onUpdateSlideNotes(activeSlide.id, value)
  }

  return (
    <div className="briefing-panel">
      <div className="version-panel-header">
        <div>
          <p className="eyebrow">Briefing</p>
          <h3>Slayt Akisi</h3>
        </div>
        <div className="briefing-panel-actions">
          {presenterPath ? (
            <Link className="secondary-button" to={presenterPath}>
              Sunumu baslat
            </Link>
          ) : null}
          <button
            className="primary-button"
            disabled={!canEdit}
            onClick={onCreateSlide}
            type="button"
          >
            Slayt olustur
          </button>
        </div>
      </div>

      <div className="button-row briefing-panel-mode-row">
        <button
          className={`secondary-button${activeSlideId === null ? ' secondary-button-active' : ''}`}
          onClick={() => onSetActiveSlide(null)}
          type="button"
        >
          Tum gorunum
        </button>
        <span className="panel-empty">
          {activeSlideId ? 'Aktif slayt secili.' : 'Sunum henuz baslatilmadi.'}
        </span>
      </div>

      {slides.length === 0 ? (
        <p className="panel-empty">Henuz briefing slaydi yok.</p>
      ) : (
        <div className="briefing-slide-list">
          {slides.map((slide, index) => {
            const isActive = slide.id === activeSlideId
            return (
              <article
                className={`version-item briefing-slide-card${isActive ? ' briefing-slide-card-active' : ''}`}
                key={slide.id}
              >
                <button
                  className="briefing-slide-select"
                  onClick={() => onSetActiveSlide(slide.id)}
                  type="button"
                >
                  <div>
                    <p className="version-item-title">{slide.title}</p>
                    <p className="panel-empty">
                      {slide.visibleElementIds.length} oge • {index + 1}. slayt
                    </p>
                  </div>
                  {isActive ? <span className="briefing-slide-badge">Aktif</span> : null}
                </button>
                <div className="briefing-slide-actions">
                  <button
                    className="secondary-button"
                    disabled={!canEdit || index === 0}
                    onClick={() => onMoveSlideUp(slide.id)}
                    type="button"
                  >
                    Yukari
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!canEdit || index === slides.length - 1}
                    onClick={() => onMoveSlideDown(slide.id)}
                    type="button"
                  >
                    Asagi
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!canEdit}
                    onClick={() => onDuplicateSlide(slide.id)}
                    type="button"
                  >
                    Kopyala
                  </button>
                  <button
                    className="secondary-button danger-button"
                    disabled={!canEdit}
                    onClick={() => onDeleteSlide(slide.id)}
                    type="button"
                  >
                    Sil
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {activeSlide ? (
        <div className="briefing-slide-editor">
          <label className="stack-field">
            <span>Slayt basligi</span>
            <input
              className="panel-input"
              disabled={!canEdit}
              onChange={(event) =>
                setTitleDraft({
                  slideId: activeSlide?.id ?? null,
                  value: event.target.value,
                })
              }
              onBlur={(event) => commitTitle(event.target.value)}
              onFocus={() =>
                setTitleDraft({
                  slideId: activeSlide?.id ?? null,
                  value: activeSlide?.title ?? '',
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitTitle(event.currentTarget.value)
                }
              }}
              type="text"
              value={localTitle}
            />
          </label>

          <label className="stack-field">
            <span>Sunum notlari</span>
            <textarea
              className="panel-input panel-textarea"
              disabled={!canEdit}
              onChange={(event) =>
                setNotesDraft({
                  slideId: activeSlide?.id ?? null,
                  value: event.target.value,
                })
              }
              onBlur={(event) => commitNotes(event.target.value)}
              onFocus={() =>
                setNotesDraft({
                  slideId: activeSlide?.id ?? null,
                  value: activeSlide?.notes ?? '',
                })
              }
              placeholder="Bu slayt icin kisa briefing notlari..."
              value={localNotes}
            />
          </label>
        </div>
      ) : null}
    </div>
  )
}
