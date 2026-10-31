import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BranchCurve, TextAlign } from '@/core/model/types'
import { isLargeText } from '@/core/theme/color'
import { resolveLine, resolveLook } from '@/core/theme/resolve'
import { FONT_OPTIONS } from '@/core/theme/themes'
import { Icon } from '@/ui/icons'
import { cmdAddImage } from '../images'
import * as A from '../actions'
import { placeToolbar, unionRect, type Placement } from '../quickToolbarPlace'
import { useScene, useTheme } from '../scene'
import { useEditor } from '../store'
import { BranchControls, CURVE_CHOICES, curvePatch } from './BranchControls'
import { ColorPicker } from './ColorPicker'
import { ShapePicker } from './TopicStylePanel'

const tap = 'grid h-9 min-w-9 shrink-0 place-items-center rounded-ui border px-1.5 text-sm transition-colors [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'
const on = 'border-brand bg-brand/15'
const off = 'border-transparent hover:bg-bg'

function Sep() {
  return <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" aria-hidden="true" />
}

const NEXT_ALIGN: Record<TextAlign, TextAlign> = { left: 'center', center: 'right', right: 'left' }
const ALIGN_GLYPH: Record<TextAlign, string> = { left: '⇤', center: '↔', right: '⇥' }

/** A toolbar button that opens a small panel (branch controls, connector styles, the "More" menu). Esc closes it. */
function PopButton({ label, icon, text, children, wide }: { label: string; icon?: Parameters<typeof Icon>[0]['name']; text?: string; children: (close: () => void) => React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const w = box.current?.offsetWidth ?? (wide ? 300 : 220)
    const h = box.current?.offsetHeight ?? 260
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))
    setPos({ left, top: r.bottom + 6 + h <= window.innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6) })
  }, [open, wide])

  useEffect(() => {
    if (open) box.current?.querySelector<HTMLElement>('button,select,input')?.focus()
  }, [open])

  const close = (restore = true) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }

  return (
    <>
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((o) => !o)} className={`${tap} ${open ? on : off} !inline-flex items-center gap-1`}>
        {icon && <Icon name={icon} size={17} />}
        {text && <span>{text}</span>}
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onPointerDown={() => close(false)} />
            <div
              ref={box}
              role="dialog"
              aria-label={label}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  close()
                }
              }}
              className={`fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto rounded-t-ui border border-line bg-surface p-3 text-sm shadow-2xl sm:inset-x-auto sm:bottom-auto sm:rounded-ui ${wide ? 'sm:w-[19rem]' : 'sm:w-56'}`}
              style={pos && window.innerWidth >= 640 ? { left: pos.left, top: pos.top } : undefined}
            >
              {children(() => close())}
            </div>
          </>,
          document.body
        )}
    </>
  )
}

/**
 * Tools floating next to the selected topic(s): text, colours, shape, branch, connector style and more. Sits above the
 * selection (below it when there is no room), stays inside the canvas, and every tool is a real button reachable with Tab and
 * the arrow keys.
 */
export function QuickToolbar() {
  const selected = useEditor((s) => s.selected)
  const topics = useEditor((s) => s.topics)
  const editing = useEditor((s) => s.editingId)
  const view = useEditor((s) => s.view)
  const viewport = useEditor((s) => s.viewport)
  const area = useEditor((s) => s.canvasSize)
  const objectSelected = useEditor((s) => s.selectedObject)
  const painter = useEditor((s) => s.painter)
  const copied = useEditor((s) => s.copiedFormat)
  const scene = useScene()
  const theme = useTheme()
  const bar = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const ids = selected.filter((id) => scene.boxes.has(id))
  const primary = ids[ids.length - 1]
  const topic = primary ? topics[primary] : undefined
  const box = primary ? scene.boxes.get(primary) : undefined

  // Measures the bar after every render; it only sets state when the size really changed, so it settles at once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = bar.current
    if (el) setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }))
  })

  if (view !== 'map' || editing || objectSelected || !topic || !box) return null

  const isRoot = primary === scene.rootId
  const look = resolveLook(theme, { depth: box.depth, branch: box.branch, isRoot, style: topic.style, layoutShape: scene.layoutShape })
  const line = resolveLine(theme, { depth: box.depth, branch: box.branch, style: topic.style })
  const st = topic.style
  const fillShown = look.fill === 'transparent' ? theme.bg : look.fill

  const target = unionRect(ids.map((id) => scene.boxes.get(id)).filter((b): b is NonNullable<typeof b> => !!b).map((b) => ({ x: b.x * viewport.k + viewport.x, y: b.y * viewport.k + viewport.y, w: b.w * viewport.k, h: b.h * viewport.k })))
  if (!target) return null
  const place: Placement = placeToolbar(target, size, { w: area.w || 1000, h: area.h || 700 })

  const curveValue = line.taper ? 'tapered' : (st.branchCurve ?? 'auto')
  const onKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const items = [...(bar.current?.querySelectorAll<HTMLElement>('button:not([disabled]),select') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    if ((document.activeElement as HTMLElement).tagName === 'SELECT') return // arrows belong to the list
    e.preventDefault()
    items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.focus()
  }
  const toggle = (on: boolean, patch: Parameters<typeof A.styleSelected>[0]) => A.styleSelected(on ? Object.fromEntries(Object.keys(patch).map((k) => [k, undefined])) : patch)

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Quick format"
      data-placement={place.below ? 'below' : 'above'}
      onKeyDown={onKeys}
      className="absolute z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-0.5 rounded-ui border border-line bg-surface px-1 py-1 shadow-lg"
      style={{ left: place.left, top: place.top }}
    >
      <select aria-label="Font family" title="Font family" value={st.fontFamily ?? ''} onChange={(e) => A.styleSelected({ fontFamily: e.target.value || undefined })} className="h-9 w-28 rounded-ui border border-transparent bg-surface px-1 text-sm hover:bg-bg [@media(pointer:coarse)]:h-11">
        <option value="">Theme font</option>
        {FONT_OPTIONS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
      <button type="button" aria-label="Smaller text" title="Smaller text" onClick={() => A.nudgeFontSize(-2)} className={`${tap} ${off}`}>
        A−
      </button>
      <span className="w-7 text-center text-xs tabular-nums text-muted" aria-label={`Font size ${look.fontSize}`}>
        {look.fontSize}
      </span>
      <button type="button" aria-label="Bigger text" title="Bigger text" onClick={() => A.nudgeFontSize(2)} className={`${tap} ${off}`}>
        A+
      </button>
      <Sep />
      <button type="button" aria-pressed={look.fontWeight >= 700} aria-label="Bold" title="Bold" onClick={() => toggle(look.fontWeight >= 700, { fontWeight: 700 })} className={`${tap} font-bold ${look.fontWeight >= 700 ? on : off}`}>
        B
      </button>
      <button type="button" aria-pressed={look.italic} aria-label="Italic" title="Italic" onClick={() => toggle(look.italic, { italic: true })} className={`${tap} italic ${look.italic ? on : off}`}>
        I
      </button>
      <button type="button" aria-pressed={look.underline} aria-label="Underline" title="Underline" onClick={() => toggle(look.underline, { underline: true })} className={`${tap} underline ${look.underline ? on : off}`}>
        U
      </button>
      <button type="button" aria-pressed={look.strike} aria-label="Strikethrough" title="Strikethrough" onClick={() => toggle(look.strike, { strike: true })} className={`${tap} line-through ${look.strike ? on : off}`}>
        S
      </button>
      <ColorPicker
        variant="swatch"
        label="Text colour"
        glyph="A"
        value={look.text}
        onChange={(v) => A.styleSelected({ textColor: v })}
        onClear={st.textColor ? () => A.styleSelected({ textColor: undefined }) : undefined}
        contrastAgainst={{ color: fillShown, large: isLargeText(look.fontSize, look.fontWeight), what: 'on this topic’s fill' }}
      />
      <ColorPicker variant="swatch" label="Highlight" glyph="H" value={look.highlight ?? 'transparent'} onChange={(v) => A.styleSelected({ highlight: v })} onNone={st.highlight ? () => A.styleSelected({ highlight: undefined }) : undefined} />
      <button type="button" aria-label={`Text alignment: ${look.align}. Change`} title={`Align ${look.align}. Click to change`} onClick={() => A.styleSelected({ align: NEXT_ALIGN[look.align] === 'center' ? undefined : NEXT_ALIGN[look.align] })} className={`${tap} ${off}`}>
        {ALIGN_GLYPH[look.align]}
      </button>
      <Sep />
      <ColorPicker
        variant="swatch"
        label="Fill colour"
        value={look.fill === 'transparent' ? 'transparent' : look.fill}
        onChange={(v) => A.styleSelected({ fill: v, fillKind: look.fillKind === 'none' ? 'solid' : undefined })}
        onNone={() => A.styleSelected({ fillKind: 'none' })}
        onClear={st.fill || st.fillKind ? () => A.styleSelected({ fill: undefined, fillKind: undefined }) : undefined}
        opacity={look.fillOpacity}
        onOpacityPreview={(v) => A.previewStyle({ fillOpacity: v })}
        onOpacityCommit={(v) => A.commitStyle({ fillOpacity: v >= 1 ? undefined : v })}
      />
      <ColorPicker variant="swatch" label="Line colour" value={look.border} onChange={(v) => A.styleSelected({ border: v })} onClear={st.border ? () => A.styleSelected({ border: undefined }) : undefined} />
      <div className="relative shrink-0">
        <ShapePicker value={st.shape} onPick={(s) => A.styleSelected({ shape: s })} />
      </div>
      <Sep />
      {!isRoot && (
        <>
          <PopButton label="Branch" icon="subTopic" text="Branch" wide>
            {() => <BranchControls />}
          </PopButton>
          <PopButton label="Connector style" icon="relationship">
            {(close) => (
              <div role="menu" aria-label="Connector style" className="space-y-0.5">
                {CURVE_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={curveValue === c.id}
                    onClick={() => {
                      A.commitStyle(curvePatch(c.id as BranchCurve | 'tapered'), A.branchMode())
                      close()
                    }}
                    className={`block w-full rounded-ui border px-2 py-1.5 text-left ${curveValue === c.id ? on : 'border-transparent hover:bg-bg'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </PopButton>
        </>
      )}
      <button type="button" aria-pressed={!!painter} aria-label="Format painter" title="Format painter: copy this look, then click topics" onClick={A.togglePainter} className={`${tap} ${painter ? on : off}`}>
        <Icon name="painter" size={17} />
      </button>
      <PopButton label="More" text="⋯">
        {(close) => (
          <div role="menu" aria-label="More format tools" className="space-y-0.5">
            {(
              [
                ['Copy format', () => A.copyFormat(), false],
                ['Paste format', () => A.pasteFormat(), !copied],
                ['Reset style', () => A.resetStyleSelected(), false],
                ['Add picture…', () => void cmdAddImage(primary), false],
                ['Open the Style panel', () => A.togglePanel('style'), false],
              ] as [string, () => void, boolean][]
            ).map(([label, run, disabled]) => (
              <button
                key={label}
                type="button"
                role="menuitem"
                disabled={disabled}
                onClick={() => {
                  run()
                  close()
                }}
                className="block w-full rounded-ui border border-transparent px-2 py-1.5 text-left hover:bg-bg disabled:opacity-40"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </PopButton>
    </div>
  )
}
