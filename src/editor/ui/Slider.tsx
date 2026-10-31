import { useEffect, useRef, useState } from 'react'

/**
 * A slider that shows its value live while it is dragged and saves ONCE when it is let go (pointer up, a key press, or leaving
 * the field), so a whole drag is one undo step.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  onPreview,
  onCommit,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  format?: (v: number) => string
  /** Called on every move of the thumb (show the change, don't save it). */
  onPreview?: (v: number) => void
  /** Called once when the drag ends. */
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState<number | null>(null)
  const latest = useRef<number | null>(null)
  useEffect(() => {
    if (draft === null) latest.current = null
  }, [draft])

  const shown = draft ?? value
  const finish = () => {
    const v = latest.current
    if (v === null) return
    latest.current = null
    setDraft(null)
    onCommit(v)
  }

  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="shrink-0">{label}</span>
      <span className="flex min-w-0 items-center gap-2">
        <input
          type="range"
          aria-label={label}
          aria-valuetext={format(shown)}
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => {
            const v = Number(e.target.value)
            latest.current = v
            setDraft(v)
            onPreview?.(v)
          }}
          onPointerUp={finish}
          onKeyUp={finish}
          onBlur={finish}
          className="h-6 w-28 min-w-0 accent-[rgb(var(--c-brand))]"
        />
        <output className="w-10 text-right text-xs tabular-nums text-muted">{format(shown)}</output>
      </span>
    </label>
  )
}
