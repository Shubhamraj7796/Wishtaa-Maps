import { useEffect, useRef, useState } from 'react'
import * as A from '../actions'
import { MAX_ZOOM, MIN_ZOOM } from '../navigation'
import { useEditor } from '../store'

/** The zoom percentage in the footer. Click it to type a value (2 to 400); Enter applies, Esc cancels. */
export function ZoomBox() {
  const zoom = useEditor((s) => s.viewport.k)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const percent = Math.round(zoom * 100)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  const apply = () => {
    setEditing(false)
    const v = Number(text.replace('%', '').trim())
    if (text.trim() !== '' && Number.isFinite(v)) A.setZoomPercent(v)
  }

  if (editing) {
    return (
      <input
        ref={input}
        aria-label="Zoom percentage"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply()
          else if (e.key === 'Escape') {
            e.stopPropagation()
            setEditing(false)
          }
        }}
        className="w-14 rounded border border-brand bg-surface px-1 py-0.5 text-center text-xs text-ink"
        title={`Type a zoom from ${Math.round(MIN_ZOOM * 100)} to ${Math.round(MAX_ZOOM * 100)}`}
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(String(percent))
        setEditing(true)
      }}
      title="Click to type a zoom value. Alt+Z resets to 100%."
      aria-label={`Zoom ${percent} percent. Click to type a value`}
      className="w-11 text-center hover:text-ink"
    >
      {percent}%
    </button>
  )
}
