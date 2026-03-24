import { useEffect, useRef, useState } from 'react'

import type { ScenarioDocument, ScenarioElement } from '@/features/scenario/model'
import { TextControls } from '@/components/panels/TextControls'
import { backendClient } from '@/lib/backend'
import { withBasePath } from '@/lib/paths'
import { copyText } from '@/lib/utils'

type InspectorPanelProps = {
  scenarioId: string | null
  viewerSlug: string | null
  selectedElement: ScenarioElement | null
  activeSlideTitle?: string | null
  selectedElementVisibleOnActiveSlide?: boolean | null
  canEdit: boolean
  hasHgmAtlas: boolean
  basemap: ScenarioDocument['basemap']
  labelOptions: ScenarioDocument['labelOptions']
  stylePrefs: ScenarioDocument['stylePrefs']
  shareSectionRef?: React.RefObject<HTMLDivElement | null>
  onSetBasemapPreset: (preset: ScenarioDocument['basemap']['preset']) => void
  onToggleLabelOption: <K extends keyof ScenarioDocument['labelOptions']>(
    key: K,
    value: ScenarioDocument['labelOptions'][K],
  ) => void
  onSetStylePref: <K extends keyof ScenarioDocument['stylePrefs']>(
    key: K,
    value: ScenarioDocument['stylePrefs'][K],
  ) => void
  onUpdateNumeric: (field: 'rotation' | 'scale' | 'zIndex', value: number) => void
  onUpdateStyle: (
    field: keyof ScenarioElement['style'],
    value: string | number | boolean | number[],
  ) => void
  onToggleLock: () => void
  onBringForward: () => void
  onSendBackward: () => void
  onRotateViewerSlug: () => Promise<void>
  onUpdateText: (value: string) => void
  onUpdateTextProperty: (field: 'fontSize' | 'fontWeight' | 'align', value: number | string) => void
  onSetSelectedElementVisibleOnActiveSlide?: (visible: boolean) => void
}

export function InspectorPanel({
  scenarioId,
  viewerSlug,
  selectedElement,
  activeSlideTitle = null,
  selectedElementVisibleOnActiveSlide = null,
  canEdit,
  hasHgmAtlas,
  basemap,
  labelOptions,
  stylePrefs,
  shareSectionRef,
  onSetBasemapPreset,
  onToggleLabelOption,
  onSetStylePref,
  onUpdateNumeric,
  onUpdateStyle,
  onToggleLock,
  onBringForward,
  onSendBackward,
  onRotateViewerSlug,
  onUpdateText,
  onUpdateTextProperty,
  onSetSelectedElementVisibleOnActiveSlide,
}: InspectorPanelProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const isDeFactoBasemap = basemap.preset === 'de_facto_world'
  const isOpenFreeMapBasemap =
    basemap.preset === 'openfreemap_liberty' ||
    basemap.preset === 'openfreemap_bright' ||
    basemap.preset === 'openfreemap_positron'
  const viewerPath = viewerSlug ? withBasePath(`/view/${viewerSlug}`) : null
  const viewerUrl =
    viewerPath && typeof window !== 'undefined'
      ? new URL(viewerPath, window.location.origin).toString()
      : viewerPath

  async function handleCopyViewerLink() {
    if (!viewerUrl) {
      return
    }

    try {
      await copyText(viewerUrl)
      setCopyState('copied')
    } catch {
      setCopyState('error')
    } finally {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
      copyTimeoutRef.current = setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h3>{selectedElement ? `Seçili: ${selectedElement.kind}` : 'Seçim yok'}</h3>
        </div>
      </div>

      <div className="toggle-stack">
        <label className="stack-field">
          <span>Harita kaynağı</span>
          <select
            className="panel-input panel-select"
            disabled={!canEdit}
            onChange={(event) =>
              onSetBasemapPreset(
                event.target.value as ScenarioDocument['basemap']['preset'],
              )
            }
            value={basemap.preset}
          >
            <option value="de_facto_world">OpenLayers De-facto Dünya</option>
            <option value="openfreemap_liberty">OpenFreeMap Liberty</option>
            <option value="openfreemap_bright">OpenFreeMap Bright</option>
            <option value="openfreemap_positron">OpenFreeMap Positron</option>

            <option value="osm_standard">OpenStreetMap Standard</option>
            <option value="osm_humanitarian">OpenStreetMap Humanitarian</option>
            <option value="open_topo">OpenTopoMap</option>
            {hasHgmAtlas ? <option value="hgm_temel">HGM ATLAS Temel</option> : null}
            {hasHgmAtlas ? <option value="hgm_gece">HGM ATLAS Gece</option> : null}
            {hasHgmAtlas ? <option value="hgm_siyasi">HGM ATLAS Siyasi</option> : null}
            {hasHgmAtlas ? <option value="hgm_yukseklik">HGM ATLAS Yükseklik</option> : null}
            {hasHgmAtlas ? <option value="hgm_uydu">HGM ATLAS Uydu</option> : null}
          </select>
        </label>

        {isOpenFreeMapBasemap ? (
          <label className="switch-row">
            <span>Performans modu</span>
            <input
              checked={stylePrefs.performanceMode}
              onChange={(event) => onSetStylePref('performanceMode', event.target.checked)}
              type="checkbox"
            />
          </label>
        ) : null}

        {isDeFactoBasemap ? (
          <>
            <label className="stack-field">
              <span>De-facto tema</span>
              <select
                className="panel-input panel-select"
                disabled={!canEdit}
                onChange={(event) =>
                  onSetStylePref(
                    'backgroundPreset',
                    event.target.value as ScenarioDocument['stylePrefs']['backgroundPreset'],
                  )
                }
                value={stylePrefs.backgroundPreset}
              >
                <option value="broadcast_blue">Yayın mavisi</option>
                <option value="paper_light">Açık atlas</option>
                <option value="midnight">Gece masası</option>
              </select>
            </label>

            <label className="switch-row">
              <span>Tartışmalı bölgeler</span>
              <input
                checked={labelOptions.showDisputedOverlay}
                onChange={(event) =>
                  onToggleLabelOption('showDisputedOverlay', event.target.checked)
                }
                type="checkbox"
              />
            </label>

            <label className="switch-row">
              <span>İl ve eyalet sınırları</span>
              <input
                checked={labelOptions.showAdmin1}
                onChange={(event) => onToggleLabelOption('showAdmin1', event.target.checked)}
                type="checkbox"
              />
            </label>

            <label className="switch-row">
              <span>Şehir adları</span>
              <input
                checked={labelOptions.showCities}
                onChange={(event) => onToggleLabelOption('showCities', event.target.checked)}
                type="checkbox"
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="share-box jump-target" ref={shareSectionRef}>
        <p className="share-box-label">Sunum bağlantısı</p>
        <a
          className="inline-link"
          href={viewerUrl ?? '#'}
          rel="noreferrer"
          target="_blank"
        >
          {viewerUrl ?? 'Bağlantı hazır değil'}
        </a>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={!viewerUrl}
            onClick={() => void handleCopyViewerLink()}
            type="button"
          >
            Bağlantıyı kopyala
          </button>
          <button
            className="secondary-button"
            disabled={!canEdit || !scenarioId}
            onClick={() => void onRotateViewerSlug()}
            type="button"
          >
            Sunum bağlantısını yenile
          </button>
        </div>
        {copyState === 'copied' ? (
          <p className="share-box-note">Sunum bağlantısı panoya kopyalandı.</p>
        ) : null}
        {copyState === 'error' ? (
          <p className="share-box-note">Bağlantı kopyalanamadı.</p>
        ) : null}
        {backendClient.mode === 'mock' ? (
          <p className="share-box-note">
            Mock modda aynı cihazdaki sekmeler arası canlı güncelleme açıktır.
          </p>
        ) : null}
      </div>

      {!selectedElement ? <p className="panel-empty">Harita üzerinden bir öğe seçin.</p> : null}

      {selectedElement ? (
        <div className="inspector-fields">
          {activeSlideTitle && selectedElementVisibleOnActiveSlide !== null ? (
            <div className="briefing-visibility-box">
              <p className="eyebrow">Slayt gorunurlugu</p>
              <p className="panel-empty">{activeSlideTitle}</p>
              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={!canEdit || selectedElementVisibleOnActiveSlide}
                  onClick={() => onSetSelectedElementVisibleOnActiveSlide?.(true)}
                  type="button"
                >
                  Bu slaytta goster
                </button>
                <button
                  className="secondary-button"
                  disabled={!canEdit || !selectedElementVisibleOnActiveSlide}
                  onClick={() => onSetSelectedElementVisibleOnActiveSlide?.(false)}
                  type="button"
                >
                  Bu slaytta gizle
                </button>
              </div>
            </div>
          ) : null}

          {selectedElement.kind === 'text' ? (
            <>
              <textarea
                className="panel-input panel-textarea"
                disabled={!canEdit}
                onChange={(event) => onUpdateText(event.target.value)}
                value={selectedElement.text}
              />
              <TextControls
                fontSize={selectedElement.fontSize}
                fontWeight={selectedElement.fontWeight}
                align={selectedElement.align}
                textColor={selectedElement.style.textColor}
                disabled={!canEdit}
                onChangeFontSize={(v) => onUpdateTextProperty('fontSize', v)}
                onChangeFontWeight={(v) => onUpdateTextProperty('fontWeight', v)}
                onChangeAlign={(v) => onUpdateTextProperty('align', v)}
                onChangeTextColor={(v) => onUpdateStyle('textColor', v)}
              />
            </>
          ) : null}

          <label>
            <span>Dönüş</span>
            <input
              max={6.3}
              min={-6.3}
              onChange={(event) => onUpdateNumeric('rotation', Number(event.target.value))}
              step={0.05}
              type="range"
              value={selectedElement.rotation}
            />
          </label>

          <label>
            <span>Ölçek</span>
            <input
              max={3}
              min={0.4}
              onChange={(event) => onUpdateNumeric('scale', Number(event.target.value))}
              step={0.05}
              type="range"
              value={selectedElement.scale}
            />
          </label>

          <label>
            <span>Çizgi kalınlığı</span>
            <input
              max={10}
              min={1}
              onChange={(event) => onUpdateStyle('lineWidth', Number(event.target.value))}
              step={1}
              type="range"
              value={selectedElement.style.lineWidth}
            />
          </label>

          <label>
            <span>Katman sırası</span>
            <input
              max={40}
              min={1}
              onChange={(event) => onUpdateNumeric('zIndex', Number(event.target.value))}
              step={1}
              type="range"
              value={selectedElement.zIndex}
            />
          </label>

          <label>
            <span>Vurgu rengi</span>
            <input
              className="panel-color"
              onChange={(event) => onUpdateStyle('strokeColor', event.target.value)}
              type="color"
              value={selectedElement.style.strokeColor}
            />
          </label>

          <div className="inspector-actions">
            <button className="secondary-button" onClick={onBringForward} type="button">
              Üste al
            </button>
            <button className="secondary-button" onClick={onSendBackward} type="button">
              Alta al
            </button>
            <button className="ghost-button" onClick={onToggleLock} type="button">
              {selectedElement.locked ? 'Kilitli · Kilidi aç' : 'Açık · Kilitle'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
