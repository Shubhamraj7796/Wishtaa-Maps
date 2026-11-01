import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PdfSource } from '@/core/pdf/types'
import { Icon, type IconName } from '@/ui/icons'
import { cmdRedo, cmdUndo } from '../actions'
import { useEditor, type PdfTool } from '../store'
import { useTouchFriendly } from '../pictures/touch'
import { setPageEdit, setPdfToolSide, setPdfTool, setToolStyle, turnPage } from './actions'
import { defaultPlace, hasStyle, isShape, loadPrefs, PALETTE, savePrefs, SHAPES, sizeRange, snapToolbar, type Shape, type StyleKey, type ToolbarPlace } from './toolPrefs'

/** The keys that choose a tool while the PDF has the focus. */
export const TOOL_KEYS: Record<string, PdfTool> = { v: 'select', h: 'highlight', u: 'underline', s: 'strike', p: 'pen', t: 'text', r: 'rect', w: 'whiteout', e: 'eraser', l: 'link' }
const keyOf = (tool: PdfTool) => Object.entries(TOOL_KEYS).find(([, t]) => t === tool)?.[0]?.toUpperCase()

const SHAPE_ICON: Record<Shape, IconName> = { rect: 'square', ellipse: 'circle', line: 'minus', arrow: 'arrowUpRight' }
const SHAPE_NAME: Record<Shape, string> = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow' }
const NAME: Partial<Record<PdfTool, string>> = { select: 'Select text or markup', highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough', pen: 'Pen', text: 'Text box', whiteout: 'Whiteout (covers part of the page; the PDF underneath is not changed)', eraser: 'Eraser', link: 'Link to a page or a web address' }

const FADE_AFTER = 2500

/**
 * The markup tools, as a narrow vertical bar floating over the PDF. Drag its handle anywhere: it lands on the nearer side edge. Collapse
 * it to one small handle. Each marking tool shows its own colour on its icon; tapping the active tool (or the corner chevron) opens a
 * flyout with that tool's colours, thickness and strength, which are remembered per tool on this device.
 */
export function FloatingTools({ source }: { source: PdfSource }) {
  const touch = useTouchFriendly()
  const tool = useEditor((s) => s.pdfPanel.tool)
  const styles = useEditor((s) => s.pdfPanel.styles)
  const shape = useEditor((s) => s.pdfPanel.shape)
  const page = useEditor((s) => s.pdfPanel.page)
  const canUndo = useEditor((s) => s.canUndo)
  const canRedo = useEditor((s) => s.canRedo)
  const readOnly = useEditor((s) => s.readOnly)
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [place, setPlaceState] = useState<ToolbarPlace>(() => loadPrefs().bar ?? defaultPlace(touch))
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [barH, setBarH] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [flyout, setFlyout] = useState<{ key: StyleKey | 'shapes'; top: number } | null>(null)
  const [awake, setAwake] = useState(true)
  const timer = useRef(0)

  useEffect(() => setPdfToolSide(place.side), [place.side])
  const setPlace = useCallback((p: ToolbarPlace) => {
    setPlaceState(p)
    savePrefs({ ...loadPrefs(), bar: p })
  }, [])

  // The size of the PDF area it floats over, and of the bar itself.
  useLayoutEffect(() => {
    const el = root.current?.parentElement
    if (!el) return
    const measure = () => {
      setArea({ width: el.clientWidth, height: el.clientHeight })
      setBarH(bar.current?.offsetHeight ?? 0)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [place.collapsed])

  // Fading: with auto-fade on, the bar dims a moment after the last touch.
  const wake = useCallback(() => {
    setAwake(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setAwake(false), FADE_AFTER)
  }, [])
  useEffect(() => {
    wake()
    return () => window.clearTimeout(timer.current)
  }, [wake, tool])

  const dragged = useRef(false)
  const startDrag = (e: React.PointerEvent) => {
    dragged.current = false
    const box = root.current?.getBoundingClientRect()
    const parent = root.current?.parentElement?.getBoundingClientRect()
    if (!box || !parent) return
    e.preventDefault()
    const dx = e.clientX - box.left
    const dy = e.clientY - box.top
    const from = { x: e.clientX, y: e.clientY }
    let moved = false
    const at = (ev: PointerEvent) => ({ x: ev.clientX - parent.left - dx, y: ev.clientY - parent.top - dy })
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 4) moved = true
      if (moved) setDrag(at(ev))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      setDrag(null)
      dragged.current = moved
      if (!moved) return
      const p = at(ev)
      const snap = snapToolbar(p.x + box.width / 2, p.y, area, { height: box.height })
      setPlace({ ...place, ...snap })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const size = touch ? 44 : 32
  const toward: IconName = place.side === 'left' ? 'chevronLeft' : 'chevronRight'
  const maxH = Math.max(120, area.height - 16)
  const h = Math.min(barH || maxH, maxH)
  const top = drag ? Math.max(0, Math.min(drag.y, area.height - h)) : Math.round(place.y * Math.max(0, area.height - h))
  const style: React.CSSProperties = drag
    ? { left: Math.max(0, Math.min(drag.x, area.width - size - 8)), top }
    : place.side === 'left'
      ? { left: 'max(6px, env(safe-area-inset-left))', top }
      : { right: 'max(6px, env(safe-area-inset-right))', top }
  const faded = place.fade && !awake && !drag && !flyout

  const choose = (t: PdfTool, key?: StyleKey | 'shapes', e?: React.MouseEvent) => {
    if (key && tool === t) {
      const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect()
      const base = root.current?.getBoundingClientRect()
      setFlyout(flyout?.key === key ? null : { key, top: rect && base ? rect.top - base.top : 0 })
      return
    }
    setFlyout(null)
    setPdfTool(t)
  }
  const openFlyout = (key: StyleKey | 'shapes', t: PdfTool, e: React.MouseEvent) => {
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect()
    const base = root.current?.getBoundingClientRect()
    if (tool !== t) setPdfTool(t)
    setFlyout(flyout?.key === key ? null : { key, top: rect && base ? rect.top - base.top : 0 })
  }

  const btn = 'relative grid shrink-0 place-items-center rounded-ui hover:bg-bg disabled:opacity-40'
  const on = 'bg-brand/20 text-ink ring-1 ring-brand/60'
  const dot = (c: string) => <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full border border-black/20" style={{ background: c }} />

  const ToolButton = ({ t, icon, key2, label }: { t: PdfTool; icon: IconName; key2?: StyleKey | 'shapes'; label: string }) => {
    const styleKey = hasStyle(t) ? t : undefined
    const active = key2 === 'shapes' ? isShape(tool) : tool === t
    const colorKey = key2 === 'shapes' ? shape : styleKey
    const k = keyOf(t)
    return (
      <div className="relative">
        <button type="button" data-tool={t} aria-pressed={active} aria-label={label} title={`${label}${k ? ` (${k})` : ''}`} onClick={(e) => choose(key2 === 'shapes' ? shape : t, key2 ?? styleKey, e)} className={`${btn} ${active ? on : 'text-muted'}`} style={{ width: size, height: size }}>
          <Icon name={icon} size={touch ? 20 : 18} />
          {colorKey && dot(styles[colorKey].color)}
        </button>
        {(key2 || styleKey) && (
          <button type="button" aria-label={`Colour and size: ${label}`} title="Colour and size" onClick={(e) => openFlyout(key2 ?? (styleKey as StyleKey), key2 === 'shapes' ? shape : t, e)} className="absolute right-0 top-0 grid h-4 w-4 place-items-center rounded text-muted hover:bg-bg [@media(pointer:coarse)]:h-5 [@media(pointer:coarse)]:w-5">
            <Icon name="chevronDown" size={10} />
          </button>
        )}
      </div>
    )
  }
  const Plain = ({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) => (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`${btn} text-muted`} style={{ width: size, height: size }}>
      <Icon name={icon} size={touch ? 20 : 18} />
    </button>
  )

  if (readOnly) return null

  const activeStyleKey: StyleKey = isShape(tool) ? tool : hasStyle(tool) ? tool : 'pen'
  const ActiveIcon: IconName = isShape(tool) ? SHAPE_ICON[tool] : tool === 'highlight' ? 'highlighter' : tool === 'underline' ? 'underline' : tool === 'strike' ? 'strike' : tool === 'pen' ? 'edit' : tool === 'text' ? 'type' : tool === 'eraser' ? 'eraser' : tool === 'whiteout' ? 'eraser' : tool === 'link' ? 'link' : 'select'

  return (
    <div
      ref={root}
      data-floating-tools={place.collapsed ? 'collapsed' : place.side}
      className={`absolute z-20 transition-opacity ${faded ? 'opacity-30' : 'opacity-100'}`}
      style={style}
      onPointerEnter={wake}
      onPointerDown={wake}
      onFocus={wake}
    >
      {place.collapsed ? (
        <button type="button" aria-label="Show the markup tools" title="Show the markup tools (drag to move)" onPointerDown={startDrag} onClick={() => !dragged.current && setPlace({ ...place, collapsed: false })} className={`${btn} touch-none border border-line bg-surface shadow-lg ${on}`} style={{ width: size, height: size }}>
          <Icon name={ActiveIcon} size={touch ? 20 : 18} />
          {hasStyle(tool) || isShape(tool) ? dot(styles[activeStyleKey].color) : null}
        </button>
      ) : (
        <>
          <div ref={bar} role="toolbar" aria-orientation="vertical" aria-label="Markup tools" className="flex flex-col items-center gap-0.5 overflow-y-auto overscroll-contain rounded-ui border border-line bg-surface p-0.5 shadow-lg" style={{ maxHeight: maxH, width: size + 8 }}>
            <button type="button" aria-label="Move the markup tools" title="Drag to move the tools; they snap to the left or right edge" onPointerDown={startDrag} className={`${btn} cursor-grab touch-none text-muted`} style={{ width: size, height: size * 0.7 }}>
              ⠿
            </button>
            <button type="button" aria-label="Collapse the markup tools" title="Collapse the tools to one small button" onClick={() => (setFlyout(null), setPlace({ ...place, collapsed: true }))} className={`${btn} text-muted`} style={{ width: size, height: size * 0.7 }}>
              <Icon name={toward} size={14} />
            </button>
            {ToolButton({ t: 'select', icon: 'select', label: NAME.select as string })}
            {ToolButton({ t: 'highlight', icon: 'highlighter', label: 'Highlight' })}
            {ToolButton({ t: 'underline', icon: 'underline', label: 'Underline' })}
            {ToolButton({ t: 'strike', icon: 'strike', label: 'Strikethrough' })}
            {ToolButton({ t: 'pen', icon: 'edit', label: 'Pen' })}
            {ToolButton({ t: 'text', icon: 'type', label: 'Text box' })}
            {ToolButton({ t: shape, key2: 'shapes', icon: SHAPE_ICON[shape], label: `Shapes (${SHAPE_NAME[shape]})` })}
            {ToolButton({ t: 'whiteout', icon: 'eraser', label: NAME.whiteout as string })}
            {ToolButton({ t: 'eraser', icon: 'trash', label: 'Eraser: touch markup to delete it' })}
            {ToolButton({ t: 'link', icon: 'link', label: NAME.link as string })}
            <span className="my-0.5 h-px w-6 bg-line" />
            {Plain({ icon: 'undo', label: 'Undo', disabled: !canUndo, onClick: cmdUndo })}
            {Plain({ icon: 'redo', label: 'Redo', disabled: !canRedo, onClick: cmdRedo })}
            {Plain({ icon: 'reset', label: `Turn page ${page} left`, onClick: () => turnPage(source.id, page, -90) })}
            {Plain({ icon: 'rotateCw', label: `Turn page ${page} right`, onClick: () => turnPage(source.id, page, 90) })}
            {Plain({ icon: 'eyeOff', label: `Hide page ${page} (the PDF file is not changed; it is left out when you download)`, onClick: () => setPageEdit(source.id, page, { hidden: true }) })}
            <span className="my-0.5 h-px w-6 bg-line" />
            <button type="button" aria-pressed={place.fade} aria-label="Fade the tools when not in use" title="Fade the tools when not in use" onClick={() => setPlace({ ...place, fade: !place.fade })} className={`${btn} ${place.fade ? on : 'text-muted'}`} style={{ width: size, height: size * 0.8 }}>
              <Icon name="preview" size={16} />
            </button>
          </div>
          {flyout && <Flyout kind={flyout.key} top={flyout.top} side={place.side} onClose={() => setFlyout(null)} />}
        </>
      )}
    </div>
  )
}

/** One tool's colours, thickness and strength, beside the bar, with a live preview. */
function Flyout({ kind, top, side, onClose }: { kind: StyleKey | 'shapes'; top: number; side: 'left' | 'right'; onClose: () => void }) {
  const shape = useEditor((s) => s.pdfPanel.shape)
  const tool = useEditor((s) => s.pdfPanel.tool)
  const styles = useEditor((s) => s.pdfPanel.styles)
  const key: StyleKey = kind === 'shapes' ? shape : kind
  const st = styles[key]
  const range = sizeRange(key)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = ref.current
      if (el && !el.contains(e.target as Node) && !(e.target as HTMLElement).closest('[data-floating-tools]')) onClose()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', down)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('keydown', esc)
    }
  }, [onClose])

  const name = kind === 'shapes' ? 'Shapes' : (NAME[key] ?? key)
  return (
    <div ref={ref} role="dialog" aria-label={`${name}: colour and size`} data-flyout={key} className={`absolute z-30 w-60 rounded-ui border border-line bg-surface p-3 text-sm shadow-xl ${side === 'left' ? 'left-full ml-2' : 'right-full mr-2'}`} style={{ top: Math.max(0, top - 8) }}>
      <div className="mb-2 font-medium">{name.split(' (')[0]}</div>
      {kind === 'shapes' && (
        <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Shape">
          {SHAPES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={shape === s} aria-label={SHAPE_NAME[s]} title={SHAPE_NAME[s]} onClick={() => setPdfTool(s)} className={`grid h-10 w-10 place-items-center rounded-ui border border-line hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 ${shape === s && isShape(tool) ? 'bg-brand/20 ring-1 ring-brand/60' : ''}`}>
              <Icon name={SHAPE_ICON[s]} size={18} />
            </button>
          ))}
        </div>
      )}
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={st.color.toLowerCase() === c} aria-label={`Colour ${c}`} title={c} onClick={() => setToolStyle(key, { color: c })} className="grid h-8 w-8 place-items-center rounded-full [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10">
            <span className={`h-6 w-6 rounded-full border ${st.color.toLowerCase() === c ? 'border-ink ring-2 ring-brand' : 'border-line'}`} style={{ background: c }} />
          </button>
        ))}
        <label className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-dashed border-line text-xs text-muted [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10" title="Custom colour">
          <span aria-hidden="true">+</span>
          <input type="color" aria-label="Custom colour" value={st.color} onChange={(e) => setToolStyle(key, { color: e.target.value })} className="sr-only" />
        </label>
      </div>
      {range && (
        <label className="mt-3 block">
          <span className="flex justify-between text-xs text-muted">
            <span>{range.label}</span>
            <span>{st.size}</span>
          </span>
          <input type="range" min={range.min} max={range.max} step={1} value={st.size} aria-label={range.label} onChange={(e) => setToolStyle(key, { size: Number(e.target.value) })} className="w-full accent-[rgb(var(--c-brand))] [@media(pointer:coarse)]:h-8" />
        </label>
      )}
      {key === 'highlight' && (
        <label className="mt-3 block">
          <span className="flex justify-between text-xs text-muted">
            <span>Strength</span>
            <span>{Math.round(st.opacity * 100)}%</span>
          </span>
          <input type="range" min={15} max={85} step={5} value={Math.round(st.opacity * 100)} aria-label="Highlighter strength" onChange={(e) => setToolStyle(key, { opacity: Number(e.target.value) / 100 })} className="w-full accent-[rgb(var(--c-brand))] [@media(pointer:coarse)]:h-8" />
        </label>
      )}
      <Preview kind={key} color={st.color} size={st.size} opacity={st.opacity} />
    </div>
  )
}

/** How a stroke will look. */
function Preview({ kind, color, size, opacity }: { kind: StyleKey; color: string; size: number; opacity: number }) {
  return (
    <svg role="img" aria-label="Preview" data-preview={kind} viewBox="0 0 200 40" className="mt-3 h-10 w-full rounded border border-line bg-white">
      {kind === 'highlight' && (
        <>
          <text x="12" y="26" fontSize="16" fill="#111827">Highlighted text</text>
          <rect x="10" y="10" width="140" height="22" fill={color} fillOpacity={opacity} style={{ mixBlendMode: 'multiply' }} />
        </>
      )}
      {(kind === 'underline' || kind === 'strike') && (
        <>
          <text x="12" y="26" fontSize="16" fill="#111827">Sample text</text>
          <line x1="10" x2="120" y1={kind === 'underline' ? 31 : 21} y2={kind === 'underline' ? 31 : 21} stroke={color} strokeWidth={size * 0.7} />
        </>
      )}
      {kind === 'text' && <text x="12" y="28" fontSize={Math.min(30, size * 0.6 + 6)} fill={color}>Aa text</text>}
      {(kind === 'pen' || kind === 'line') && <path d="M12 28 C 50 4, 90 36, 130 12 S 180 20 188 14" fill="none" stroke={color} strokeWidth={size * 0.7} strokeLinecap="round" />}
      {kind === 'rect' && <rect x="30" y="8" width="130" height="24" fill="none" stroke={color} strokeWidth={size * 0.7} />}
      {kind === 'ellipse' && <ellipse cx="100" cy="20" rx="65" ry="12" fill="none" stroke={color} strokeWidth={size * 0.7} />}
      {kind === 'arrow' && (
        <>
          <line x1="20" y1="20" x2="165" y2="20" stroke={color} strokeWidth={size * 0.7} strokeLinecap="round" />
          <polygon points="186,20 160,8 160,32" fill={color} />
        </>
      )}
    </svg>
  )
}
