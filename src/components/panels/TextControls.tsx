import { cn } from '@/lib/utils'

type TextControlsProps = {
  fontSize: number
  fontWeight: number
  align: 'left' | 'center' | 'right'
  textColor: string
  disabled: boolean
  onChangeFontSize: (value: number) => void
  onChangeFontWeight: (value: number) => void
  onChangeAlign: (value: 'left' | 'center' | 'right') => void
  onChangeTextColor: (value: string) => void
}

const fontWeights: Array<{ value: number; label: string }> = [
  { value: 300, label: 'İnce' },
  { value: 400, label: 'Normal' },
  { value: 700, label: 'Kalın' },
  { value: 900, label: 'Çok Kalın' },
]

const alignments: Array<{ value: 'left' | 'center' | 'right'; label: string }> = [
  { value: 'left', label: 'Sol' },
  { value: 'center', label: 'Orta' },
  { value: 'right', label: 'Sağ' },
]

export function TextControls({
  fontSize,
  fontWeight,
  align,
  textColor,
  disabled,
  onChangeFontSize,
  onChangeFontWeight,
  onChangeAlign,
  onChangeTextColor,
}: TextControlsProps) {
  return (
    <div className="text-controls">
      <label className="text-controls-field">
        <span>Yazı boyutu</span>
        <div className="text-controls-range-row">
          <input
            disabled={disabled}
            max={72}
            min={12}
            onChange={(e) => onChangeFontSize(Number(e.target.value))}
            step={2}
            type="range"
            value={fontSize}
          />
          <span className="text-controls-value">{fontSize}px</span>
        </div>
      </label>

      <div className="text-controls-field">
        <span>Kalınlık</span>
        <div className="text-controls-group">
          {fontWeights.map((fw) => (
            <button
              key={fw.value}
              type="button"
              className={cn('filter-pill', fontWeight === fw.value && 'active')}
              disabled={disabled}
              onClick={() => onChangeFontWeight(fw.value)}
            >
              {fw.label}
            </button>
          ))}
        </div>
      </div>

      <div className="text-controls-field">
        <span>Hizalama</span>
        <div className="text-controls-group">
          {alignments.map((a) => (
            <button
              key={a.value}
              type="button"
              className={cn('filter-pill', align === a.value && 'active')}
              disabled={disabled}
              onClick={() => onChangeAlign(a.value)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <label className="text-controls-field">
        <span>Yazı rengi</span>
        <input
          className="panel-color"
          disabled={disabled}
          onChange={(e) => onChangeTextColor(e.target.value)}
          type="color"
          value={textColor}
        />
      </label>
    </div>
  )
}
