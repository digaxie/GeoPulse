import { cn } from '@/lib/utils'
import type { ScenarioTool } from '@/features/scenario/model'

const PEN_COLORS = [
  { value: '#f9427c', label: 'Kırmızı' },
  { value: '#1a6ef5', label: 'Mavi' },
  { value: '#0d9e7a', label: 'Yeşil' },
  { value: '#e89200', label: 'Turuncu' },
  { value: '#12213f', label: 'Siyah' },
  { value: '#ffffff', label: 'Beyaz' },
]

const DRAWING_TOOLS: ScenarioTool[] = ['freehand', 'arrow', 'polyline', 'area', 'rectangle', 'circle', 'triangle']

type ToolDockProps = {
  activeTool: ScenarioTool
  canEdit: boolean
  undoCount: number
  redoCount: number
  penColor: string
  eraserSize: number
  onSelectTool: (tool: ScenarioTool) => void
  onPenColorChange: (color: string) => void
  onEraserSizeChange: (size: number) => void
  onUndo: () => void
  onRedo: () => void
  onDelete: () => void
  onClearAll: () => void
}

const tools: Array<{ id: ScenarioTool; label: string; hint: string }> = [
  { id: 'select', label: 'Seç', hint: 'Seç ve taşı' },
  { id: 'text', label: 'Metin', hint: 'Başlık ve not' },
  { id: 'arrow', label: 'Ok', hint: 'Yön oku' },
  { id: 'polyline', label: 'Çizgi', hint: 'Hat çiz' },
  { id: 'freehand', label: 'Kalem', hint: 'Serbest çizim' },
  { id: 'area', label: 'Alan', hint: 'Bölge boya' },
  { id: 'rectangle', label: 'Kare', hint: 'Dikdörtgen çiz' },
  { id: 'circle', label: 'Daire', hint: 'Daire çiz' },
  { id: 'triangle', label: 'Üçgen', hint: 'Üçgen çiz' },
  { id: 'eraser', label: 'Silgi', hint: 'Sürükleyerek sil' },
]

const actionButtons = [
  { id: 'undo', label: 'Geri', onClickKey: 'undo' },
  { id: 'redo', label: 'İleri', onClickKey: 'redo' },
  { id: 'delete', label: 'Sil', onClickKey: 'delete' },
  { id: 'clear', label: 'Temizle', onClickKey: 'clear' },
] as const

export function ToolDock({
  activeTool,
  canEdit,
  undoCount,
  redoCount,
  penColor,
  eraserSize,
  onSelectTool,
  onPenColorChange,
  onEraserSizeChange,
  onUndo,
  onRedo,
  onDelete,
  onClearAll,
}: ToolDockProps) {
  const showPenColors = DRAWING_TOOLS.includes(activeTool)
  const showEraserSize = activeTool === 'eraser'

  return (
    <div className="tool-dock">
      <div className="tool-dock-group tool-dock-grid">
        {tools.map((tool) => (
          <button
            className={cn('tool-button', activeTool === tool.id && 'tool-button-active')}
            disabled={!canEdit}
            key={tool.id}
            onClick={() => onSelectTool(tool.id)}
            title={tool.hint}
            type="button"
          >
            <span className="tool-button-label">{tool.label}</span>
            <span className="tool-button-hint">{tool.hint}</span>
          </button>
        ))}
      </div>

      {showPenColors && (
        <div className="tool-dock-group pen-color-row">
          <span className="pen-color-label">Renk</span>
          <div className="pen-color-swatches">
            {PEN_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                className={cn('pen-color-swatch', penColor === c.value && 'pen-color-swatch--active')}
                style={{ backgroundColor: c.value }}
                title={c.label}
                onClick={() => onPenColorChange(c.value)}
              />
            ))}
          </div>
        </div>
      )}

      {showEraserSize && (
        <div className="tool-dock-group eraser-size-row">
          <span className="eraser-size-label">Silgi Boyutu</span>
          <div className="eraser-size-controls">
            <input
              type="range"
              className="eraser-size-slider"
              min={10}
              max={60}
              step={2}
              value={eraserSize}
              onChange={(e) => onEraserSizeChange(Number(e.target.value))}
            />
            <span className="eraser-size-value">{eraserSize}px</span>
          </div>
          <div className="eraser-size-preview">
            <span
              className="eraser-preview-circle"
              style={{ width: eraserSize, height: eraserSize }}
            />
          </div>
        </div>
      )}

      <div className="tool-dock-group tool-dock-actions">
        {actionButtons.map((button) => {
          const action =
            button.onClickKey === 'undo'
              ? onUndo
              : button.onClickKey === 'redo'
                ? onRedo
                : button.onClickKey === 'delete'
                  ? onDelete
                  : onClearAll

          const isDisabled =
            (button.id === 'undo' && undoCount === 0) ||
            (button.id === 'redo' && redoCount === 0)
          const badge =
            button.id === 'undo' && undoCount > 0
              ? undoCount
              : button.id === 'redo' && redoCount > 0
                ? redoCount
                : null

          return (
            <button
              className={cn(
                'tool-button tool-button-small',
                (button.id === 'delete' || button.id === 'clear') && 'danger',
              )}
              disabled={isDisabled}
              key={button.id}
              onClick={action}
              type="button"
            >
              {button.label}
              {badge !== null && <span className="tool-badge">{badge}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
