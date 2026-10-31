import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { contrastReport, isHex, normalizeHex } from '@/core/theme/color'
import { recentColours, rememberColour } from '@/core/theme/recent'
import { useTheme } from '../scene'
import { Slider } from './Slider'

/** A small, familiar set to pick from besides the map's own colour scheme. */
export const STANDARD_COLORS = [
  '#000000', '#374151', '#6b7280', '#d1d5db', '#ffffff', '#7f1d1d',
  '#dc2626', '#ea580c', '#f59e0b', '#facc15', '#84cc16', '#16a34a',
  '#0d9488', '#06b6d4', '#2563eb', '#4f46e5', '#7c3aed', '#c026d3',
  '#e11d48', '#be185d', '#92400e', '#065f46', '#1e3a8a', '#4c1d95',
]

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> }
}
const eyeDropper = (): EyeDropperCtor | null => (typeof window !== 'undefined' ? ((window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper ?? null) : null)

export interface ColorPickerProps {
  /** Spoken and visible name, e.g. "Fill colour". */
  label: string
  /** The colour in use (`transparent` = none). */
  value: string
  /** Saves a colour. */
  onChange: (hex: string) => void
  /** Back to what the theme gives (shows an Auto button). */
  onClear?: () => void
  /** Offers "No fill": calls `onNone`. */
  onNone?: () => void
  /** Opacity 0 to 1, with a slider. */
  opacity?: number
  onOpacityPreview?: (v: number) => void
  onOpacityCommit?: (v: number) => void
  /** Check this colour as text on `against` and warn below WCAG AA, offering a readable colour. */
  contrastAgainst?: { color: string; large?: boolean; what?: string }
  /** A labelled row (panels) or just the swatch (toolbar). */
  variant?: 'row' | 'swatch'
  /** Shown on the swatch (toolbar: the A of text colour). */
  glyph?: React.ReactNode
}

/** A colour button that opens a picker: scheme colours, standard colours, recent, custom hex, eyedropper, opacity. */
export function ColorPicker(p: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  const none = p.value === 'transparent'

  const swatch = (
    <button
      ref={trigger}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`${p.label}: ${none ? 'none' : p.value}. Change`}
      title={p.label}
      onClick={() => setOpen((o) => !o)}
      className={p.variant === 'swatch' ? 'grid h-9 w-9 shrink-0 place-items-center rounded-ui border border-transparent hover:bg-bg' : 'flex h-7 w-9 items-center justify-center rounded border border-line p-0.5'}
    >
      <span
        className="grid h-5 w-6 place-items-center rounded-sm border border-black/20 text-[11px] font-bold leading-none"
        style={none ? { background: 'repeating-linear-gradient(45deg,#fff 0 3px,#e5e7eb 3px 6px)' } : { background: p.value, color: isHex(p.value) ? (contrastReport('#ffffff', p.value).ok ? '#fff' : '#111') : undefined }}
      >
        {p.glyph}
      </span>
    </button>
  )

  return (
    <>
      {p.variant === 'swatch' ? (
        swatch
      ) : (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span id={id}>{p.label}</span>
          <span className="flex items-center gap-1.5">
            {swatch}
            {p.onClear && (
              <button type="button" onClick={p.onClear} className="rounded px-1.5 text-xs text-muted hover:text-ink" title="Back to the theme's colour">
                Auto
              </button>
            )}
          </span>
        </div>
      )}
      {open && <Popover {...p} anchor={trigger} onClose={() => setOpen(false)} />}
    </>
  )
}

function Popover(p: ColorPickerProps & { anchor: React.RefObject<HTMLElement>; onClose: () => void }) {
  const theme = useTheme()
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [recent, setRecent] = useState(() => recentColours())
  const [hex, setHex] = useState(isHex(p.value) ? p.value : '')
  const Dropper = eyeDropper()

  // Beside the button, kept inside the screen. On a phone it is a sheet along the bottom (see the classes below).
  useLayoutEffect(() => {
    const r = p.anchor.current?.getBoundingClientRect()
    const w = box.current?.offsetWidth ?? 272
    const h = box.current?.offsetHeight ?? 320
    if (!r) return
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))
    const below = r.bottom + 6
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, r.top - h - 6)
    setPos({ left, top })
  }, [p.anchor])

  useEffect(() => {
    box.current?.querySelector<HTMLElement>('button')?.focus()
  }, [])

  const close = (restore = true) => {
    p.onClose()
    if (restore) p.anchor.current?.focus()
  }
  const pick = (c: string) => {
    const v = c.toLowerCase()
    setRecent(rememberColour(v))
    setHex(v)
    p.onChange(v)
  }

  const scheme = [...new Set([...theme.palette, theme.bg, theme.text].filter(isHex).map((c) => c.toLowerCase()))].slice(0, 12)
  const report = p.contrastAgainst && isHex(p.value) && isHex(p.contrastAgainst.color) ? contrastReport(p.value, p.contrastAgainst.color, p.contrastAgainst.large) : null

  const grid = (name: string, colors: string[]) => (
    <div role="group" aria-label={name} className="grid grid-cols-6 gap-1">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          title={c}
          aria-pressed={p.value.toLowerCase() === c}
          onClick={() => pick(c)}
          className={`h-8 rounded border ${p.value.toLowerCase() === c ? 'border-brand ring-2 ring-brand' : 'border-black/20'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  )

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60]" onPointerDown={() => close(false)} />
      <div
        ref={box}
        role="dialog"
        aria-label={`${p.label} picker`}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            close()
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] space-y-3 overflow-y-auto rounded-t-ui border border-line bg-surface p-3 text-sm shadow-2xl sm:inset-x-auto sm:bottom-auto sm:w-[17rem] sm:rounded-ui"
        style={pos && window.innerWidth >= 640 ? { left: pos.left, top: pos.top } : undefined}
      >
        <div className="flex flex-wrap gap-2">
          {p.onNone && (
            <button
              type="button"
              onClick={() => {
                p.onNone?.()
                close()
              }}
              aria-pressed={p.value === 'transparent'}
              className="rounded-ui border border-line px-2 py-1 text-xs hover:bg-bg"
            >
              No fill
            </button>
          )}
          {p.onClear && (
            <button
              type="button"
              onClick={() => {
                p.onClear?.()
                close()
              }}
              className="rounded-ui border border-line px-2 py-1 text-xs hover:bg-bg"
            >
              Auto (from the theme)
            </button>
          )}
        </div>
        {scheme.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted">This map&apos;s colours</p>
            {grid('Map colours', scheme)}
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">Standard colours</p>
          {grid('Standard colours', STANDARD_COLORS)}
        </div>
        {recent.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted">Recent</p>
            {grid('Recent colours', recent)}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick a custom colour"
            value={isHex(hex) ? hex : isHex(p.value) ? p.value : '#000000'}
            onChange={(e) => setHex(e.target.value)}
            onBlur={(e) => {
              if (isHex(e.target.value) && e.target.value.toLowerCase() !== p.value.toLowerCase()) pick(e.target.value)
            }}
            className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent p-0.5"
          />
          <input
            type="text"
            aria-label="Hex colour"
            value={hex}
            placeholder="#rrggbb"
            maxLength={7}
            spellCheck={false}
            onChange={(e) => setHex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = normalizeHex(hex)
                if (v) pick(v)
              }
            }}
            onBlur={() => {
              const v = normalizeHex(hex)
              if (v && v !== p.value.toLowerCase()) pick(v)
            }}
            className="min-w-0 flex-1 rounded-ui border border-line bg-surface px-2 py-1 font-mono text-sm"
          />
          {Dropper && (
            <button
              type="button"
              aria-label="Pick a colour from the screen"
              title="Pick a colour from the screen"
              onClick={() => void new Dropper().open().then((r) => pick(r.sRGBHex)).catch(() => undefined)}
              className="grid h-8 w-8 place-items-center rounded-ui border border-line hover:bg-bg"
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <path d="M12 4l4 4M3 17l1-4 8-8 3 3-8 8-4 1z" />
              </svg>
            </button>
          )}
        </div>
        {p.opacity !== undefined && p.onOpacityCommit && (
          <Slider label="Opacity" value={Math.round(p.opacity * 100)} min={0} max={100} step={5} format={(v) => `${v}%`} onPreview={(v) => p.onOpacityPreview?.(v / 100)} onCommit={(v) => p.onOpacityCommit?.(v / 100)} />
        )}
        {report && !report.ok && (
          <div role="alert" className="space-y-1.5 rounded-ui border border-warn/50 bg-warn/10 p-2 text-xs">
            <p>
              Low contrast: {report.ratio}:1 {p.contrastAgainst?.what ?? 'against the background'}. WCAG AA needs {p.contrastAgainst?.large ? '3' : '4.5'}:1, so this may be hard to read.
            </p>
            {report.suggestion && (
              <button type="button" onClick={() => pick(report.suggestion as string)} className="rounded-ui border border-line bg-surface px-2 py-1 font-medium hover:bg-bg">
                Use a readable colour ({report.suggestion})
              </button>
            )}
          </div>
        )}
        {report?.ok && <p className="text-xs text-muted">Contrast {report.ratio}:1, passes WCAG AA.</p>}
      </div>
    </>,
    document.body
  )
}
