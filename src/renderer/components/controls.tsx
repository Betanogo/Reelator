import { useEditor } from '../model/store'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  onChange(v: number): void
  defaultValue?: number
}

/** Range slider that records a single undo step per drag. Double-click resets. */
export function Slider({ label, value, min, max, step = 0.01, format, onChange, defaultValue }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  const begin = () => useEditor.getState().beginGesture()
  const end = () => useEditor.getState().endGesture()
  return (
    <div className="row">
      <label onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)} title="더블클릭하면 초기화">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${pct}%` }}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="val">{format ? format(value) : value.toFixed(2)}</span>
    </div>
  )
}

export const pct100 = (v: number) => `${Math.round(v * 100)}`
export const signed100 = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}`
export const secs = (v: number) => `${v.toFixed(1)}s`

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange(v: T): void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}
