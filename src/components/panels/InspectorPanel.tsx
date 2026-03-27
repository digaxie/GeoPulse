import type { ScenarioDocument, ScenarioElement } from '@/features/scenario/model'
import { TextControls } from '@/components/panels/TextControls'

type InspectorPanelProps = {
  selectedElement: ScenarioElement | null
  activeSlideTitle?: string | null
  selectedElementVisibleOnActiveSlide?: boolean | null
  canEdit: boolean
  hasHgmAtlas: boolean
  basemap: ScenarioDocument['basemap']
  labelOptions: ScenarioDocument['labelOptions']
  stylePrefs: ScenarioDocument['stylePrefs']
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
  onUpdateText: (value: string) => void
  onUpdateTextProperty: (
    field: 'fontSize' | 'fontWeight' | 'align',
    value: number | string,
  ) => void
  onSetSelectedElementVisibleOnActiveSlide?: (visible: boolean) => void
}

export function InspectorPanel({
  selectedElement,
  activeSlideTitle = null,
  selectedElementVisibleOnActiveSlide = null,
  canEdit,
  hasHgmAtlas,
  basemap,
  labelOptions,
  stylePrefs,
  onSetBasemapPreset,
  onToggleLabelOption,
  onSetStylePref,
  onUpdateNumeric,
  onUpdateStyle,
  onToggleLock,
  onBringForward,
  onSendBackward,
  onUpdateText,
  onUpdateTextProperty,
  onSetSelectedElementVisibleOnActiveSlide,
}: InspectorPanelProps) {
  const isDeFactoBasemap = basemap.preset === 'de_facto_world'
  const isOpenFreeMapBasemap =
    basemap.preset === 'openfreemap_liberty' ||
    basemap.preset === 'openfreemap_bright' ||
    basemap.preset === 'openfreemap_positron'

  return (
    <section className="panel-card">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Ayarlar</p>
          <h3>{selectedElement ? `Secili: ${selectedElement.kind}` : 'Secim yok'}</h3>
        </div>
      </div>

      <div className="toggle-stack">
        <label className="stack-field">
          <span>Harita kaynagi</span>
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
            <option value="de_facto_world">OpenLayers De-facto Dunya</option>
            <option value="openfreemap_liberty">OpenFreeMap Liberty</option>
            <option value="openfreemap_bright">OpenFreeMap Bright</option>
            <option value="openfreemap_positron">OpenFreeMap Positron</option>
            <option value="osm_standard">OpenStreetMap Standard</option>
            <option value="osm_humanitarian">OpenStreetMap Humanitarian</option>
            <option value="open_topo">OpenTopoMap</option>
            {hasHgmAtlas ? <option value="hgm_temel">HGM ATLAS Temel</option> : null}
            {hasHgmAtlas ? <option value="hgm_gece">HGM ATLAS Gece</option> : null}
            {hasHgmAtlas ? <option value="hgm_siyasi">HGM ATLAS Siyasi</option> : null}
            {hasHgmAtlas ? <option value="hgm_yukseklik">HGM ATLAS Yukseklik</option> : null}
            {hasHgmAtlas ? <option value="hgm_uydu">HGM ATLAS Uydu</option> : null}
          </select>
        </label>

        <label className="switch-row">
          <span>Haritayi dark goster</span>
          <input
            checked={stylePrefs.backgroundPreset === 'midnight'}
            onChange={(event) =>
              onSetStylePref(
                'backgroundPreset',
                event.target.checked ? 'midnight' : 'broadcast_blue',
              )
            }
            type="checkbox"
          />
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
                <option value="broadcast_blue">Yayin mavisi</option>
                <option value="paper_light">Acik atlas</option>
                <option value="midnight">Gece masasi</option>
              </select>
            </label>

            <label className="switch-row">
              <span>Tartismali bolgeler</span>
              <input
                checked={labelOptions.showDisputedOverlay}
                onChange={(event) =>
                  onToggleLabelOption('showDisputedOverlay', event.target.checked)
                }
                type="checkbox"
              />
            </label>

            <label className="switch-row">
              <span>Il ve eyalet sinirlari</span>
              <input
                checked={labelOptions.showAdmin1}
                onChange={(event) => onToggleLabelOption('showAdmin1', event.target.checked)}
                type="checkbox"
              />
            </label>

            <label className="switch-row">
              <span>Sehir adlari</span>
              <input
                checked={labelOptions.showCities}
                onChange={(event) => onToggleLabelOption('showCities', event.target.checked)}
                type="checkbox"
              />
            </label>
          </>
        ) : null}
      </div>

      {!selectedElement ? <p className="panel-empty">Harita uzerinden bir oge secin.</p> : null}

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
                onChangeFontSize={(value) => onUpdateTextProperty('fontSize', value)}
                onChangeFontWeight={(value) => onUpdateTextProperty('fontWeight', value)}
                onChangeAlign={(value) => onUpdateTextProperty('align', value)}
                onChangeTextColor={(value) => onUpdateStyle('textColor', value)}
              />
            </>
          ) : null}

          <label>
            <span>Donus</span>
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
            <span>Olcek</span>
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
            <span>Cizgi kalinligi</span>
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
            <span>Katman sirasi</span>
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
              Uste al
            </button>
            <button className="secondary-button" onClick={onSendBackward} type="button">
              Alta al
            </button>
            <button className="ghost-button" onClick={onToggleLock} type="button">
              {selectedElement.locked ? 'Kilitli · Kilidi ac' : 'Acik · Kilitle'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
