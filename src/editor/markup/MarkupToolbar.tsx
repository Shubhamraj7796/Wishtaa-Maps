import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon, type IconName } from '@/ui/icons'
import { useTouchFriendly } from '../pictures/touch'
import type { PdfTool } from '../store'
import { ToolSettings } from './ToolSettings'
import { ALL_TOOLS, defaultPlace, hasStyle, isShape, loadBar, MAX_PRESETS, PALETTE, saveBar, SHAPES, sizeRange, snapToolbar, type Presets, type Shape, type StyleKey, type ToolId, type ToolbarPlace, type ToolStyle, type ToolStyles } from '../pdf/toolPrefs'

/** The keys that choose a tool while the page or picture has the focus. */
export const TOOL_KEYS: Record<string, PdfTool> = { v: 'select', h: 'highlight', u: 'underline', s: 'strike', p: 'pen', t: 'text', r: 'rect', w: 'whiteout', e: 'eraser', l: 'link', o: 'lasso' }
const keyOf = (tool: PdfTool) => Object.entries(TOOL_KEYS).find(([, t]) => t === tool)?.[0]?.toUpperCase()

const SHAPE_ICON: Record<Shape, IconName> = { rect: 'square', ellipse: 'circle', line: 'minus', arrow: 'arrowUpRight' }
const SHAPE_NAME: Record<Shape, string> = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow' }
const NAME: Partial<Record<PdfTool, string>> = { select: 'Select text or markup', highlight: 'Highlight', underline: 'Underline', strike: 'Strikethrough', pen: 'Pen', text: 'Text box', whiteout: 'Whiteout (covers part of the page; the original underneath is not changed)', eraser: 'Eraser', link: 'Link to a page or a web address', lasso: 'Lasso: draw a loop round markup to move, resize, recolour, copy or delete it' }

const FADE_AFTER = 2500

/** An action beside the tools: undo, redo, turn a page, and so on. */
export interface ToolbarExtra {
  key: string
  icon: IconName
  label: string
  onClick: () => void
  disabled?: boolean
}

export interface MarkupToolbarProps {
  tool: PdfTool
  onTool: (t: PdfTool) => void
  styles: ToolStyles
  onStyle: (key: StyleKey, change: Partial<ToolStyle>) => void
  /** The shape the Shapes button shows (the last one used). */
  shape: Shape
  extras: ToolbarExtra[]
  /** Where the toolbar's position is remembered ("pdf", "picture"): each surface keeps its own. */
  placeKey: string
  /** Which edge it is on, so other controls can keep to the other side. */
  onSide?: (side: 'left' | 'right') => void
  /** Read mode: no tools at all. */
  readOnly?: boolean
  /** Short note for screen readers about what the tools act on. */
  label?: string
  /** The tools to show, in order (default: every tool except the lasso, which only a PDF page has). */
  tools?: ToolId[]
  /** Saved colour-and-size choices for each tool, and how to save and remove one. Absent: no presets row. */
  presets?: Presets
  onSavePreset?: (key: StyleKey) => void
  onRemovePreset?: (key: StyleKey, index: number) => void
  /** Choosing the tools and the pen settings: when given, the bar has a Customise button. */
  onTools?: (list: ToolId[]) => void
  onReset?: () => void
  /** Fold to the small button after this many milliseconds without any pointer or key activity (not saved: the next visit opens it again). */
  idleCollapse?: number
}

/** How the buttons are laid out for the room there is: one column, two columns, or the tools alone with a "More" button. */
export type BarMode = 'one' | 'two' | 'more'

export function barMode(cells: { tools: number; extras: number }, size: number, room: number): { mode: BarMode; cols: 1 | 2 } {
  const header = (cols: number) => (cols === 1 ? 1.4 : 0.7) * size
  const height = (cols: number, count: number) => header(cols) + Math.ceil(count / cols) * size + 12
  const all = cells.tools + cells.extras
  if (height(1, all) <= room) return { mode: 'one', cols: 1 }
  if (height(2, all) <= room) return { mode: 'two', cols: 2 }
  return { mode: 'more', cols: height(1, cells.tools + 1) <= room ? 1 : 2 }
}

/**
 * The markup tools, as a narrow vertical bar floating over a page or picture. Drag its handle anywhere: it lands on the nearer side
 * edge. Collapse it to one small handle. Each marking tool shows its own colour on its icon; tapping the active tool (or the corner
 * chevron) opens a flyout with that tool's colours, thickness and strength, remembered per tool on this device. When the tools do not
 * fit the height they go into two columns, and then into a "More" flyout; the bar never scrolls.
 */
export function MarkupToolbar({ tool, onTool, styles, onStyle, shape, extras, placeKey, onSide, readOnly, label = 'Markup tools', idleCollapse, tools: toolList, presets, onSavePreset, onRemovePreset, onTools, onReset }: MarkupToolbarProps) {
  const touch = useTouchFriendly()
  const root = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [place, setPlaceState] = useState<ToolbarPlace>(() => loadBar(placeKey) ?? defaultPlace(touch))
  const [area, setArea] = useState({ width: 0, height: 0 })
  const [barH, setBarH] = useState(0)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [flyout, setFlyout] = useState<{ key: StyleKey | 'shapes' | 'more' | 'settings'; top: number } | null>(null)
  const [awake, setAwake] = useState(true)
  const [idleFolded, setIdleFolded] = useState(false)
  const folded = place.collapsed || idleFolded
  const timer = useRef(0)
  const dragged = useRef(false)

  useEffect(() => onSide?.(place.side), [place.side, onSide])
  const setPlace = useCallback(
    (p: ToolbarPlace) => {
      setPlaceState(p)
      saveBar(placeKey, p)
    },
    [placeKey]
  )

  // The size of the area it floats over, and of the bar itself.
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
  }, [folded, extras.length])

  // Auto-collapse: after a few seconds with no pointer, key or wheel activity anywhere, the bar folds to its small button.
  useEffect(() => {
    if (!idleCollapse || folded) return
    let t = window.setTimeout(() => setIdleFolded(true), idleCollapse)
    const again = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => setIdleFolded(true), idleCollapse)
    }
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel'] as const
    for (const e of events) window.addEventListener(e, again, true)
    return () => {
      window.clearTimeout(t)
      for (const e of events) window.removeEventListener(e, again, true)
    }
  }, [idleCollapse, folded])

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
      setPlace({ ...place, ...snapToolbar(p.x + box.width / 2, p.y, area, { height: box.height }) })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const size = 44
  const shownTools = toolList ?? ALL_TOOLS.filter((t) => t !== 'lasso')
  const tools = shownTools.length
  const { mode, cols } = barMode({ tools, extras: extras.length + 1 + (onTools ? 1 : 0) }, size, Math.max(120, area.height - 16))
  const width = cols * size + 8 + (cols - 1) * 2
  const h = Math.min(barH || area.height, Math.max(120, area.height - 8))
  const top = drag ? Math.max(0, Math.min(drag.y, area.height - h)) : Math.round(place.y * Math.max(0, area.height - h))
  const style: React.CSSProperties = drag
    ? { left: Math.max(0, Math.min(drag.x, area.width - width - 8)), top }
    : place.side === 'left'
      ? { left: 'max(6px, env(safe-area-inset-left))', top }
      : { right: 'max(6px, env(safe-area-inset-right))', top }
  const faded = place.fade && !awake && !drag && !flyout

  const flyTop = (el: HTMLElement) => {
    const base = root.current?.getBoundingClientRect()
    return base ? el.getBoundingClientRect().top - base.top : 0
  }
  const choose = (t: PdfTool, key: StyleKey | 'shapes' | undefined, e: React.MouseEvent) => {
    if (key && tool === t) return setFlyout(flyout?.key === key ? null : { key, top: flyTop(e.currentTarget as HTMLElement) })
    setFlyout(null)
    onTool(t)
  }
  const openFlyout = (key: StyleKey | 'shapes', t: PdfTool, e: React.MouseEvent) => {
    if (tool !== t) onTool(t)
    setFlyout(flyout?.key === key ? null : { key, top: flyTop(e.currentTarget.parentElement as HTMLElement) })
  }

  const btn = 'relative grid shrink-0 place-items-center rounded-ui hover:bg-bg disabled:opacity-40'
  const on = 'bg-brand/20 text-ink ring-1 ring-brand/60'
  const dot = (c: string) => <span aria-hidden="true" className="absolute bottom-1 left-1/2 h-1.5 w-4 -translate-x-1/2 rounded-full border border-black/20" style={{ background: c }} />

  const toolButton = ({ t, icon, key2, text }: { t: PdfTool; icon: IconName; key2?: StyleKey | 'shapes'; text: string }) => {
    const styleKey = hasStyle(t) ? t : undefined
    const active = key2 === 'shapes' ? isShape(tool) : tool === t
    const colorKey = key2 === 'shapes' ? shape : styleKey
    const k = keyOf(t)
    return (
      <div className="relative" key={`${t}${key2 ?? ''}`}>
        <button type="button" data-tool={t} aria-pressed={active} aria-label={text} title={`${text}${k ? ` (${k})` : ''}`} onClick={(e) => choose(key2 === 'shapes' ? shape : t, key2 ?? styleKey, e)} className={`${btn} ${active ? on : 'text-muted'}`} style={{ width: size, height: size }}>
          <Icon name={icon} size={20} />
          {colorKey && dot(styles[colorKey].color)}
        </button>
        {(key2 || styleKey) && (
          <button type="button" aria-label={`Colour and size: ${text}`} title="Colour and size" onClick={(e) => openFlyout(key2 ?? (styleKey as StyleKey), key2 === 'shapes' ? shape : t, e)} className="absolute right-0 top-0 grid h-5 w-5 place-items-center rounded text-muted hover:bg-bg">
            <Icon name="chevronDown" size={10} />
          </button>
        )}
      </div>
    )
  }
  const extraButton = (x: ToolbarExtra) => (
    <button key={x.key} type="button" aria-label={x.label} title={x.label} disabled={x.disabled} onClick={() => (x.onClick(), setFlyout(null))} className={`${btn} text-muted`} style={{ width: size, height: size }}>
      <Icon name={x.icon} size={20} />
    </button>
  )
  const fadeButton = (
    <button key="fade" type="button" aria-pressed={place.fade} aria-label="Fade the tools when not in use" title="Fade the tools when not in use" onClick={() => setPlace({ ...place, fade: !place.fade })} className={`${btn} ${place.fade ? on : 'text-muted'}`} style={{ width: size, height: size }}>
      <Icon name="preview" size={18} />
    </button>
  )

  const settingsButton = onTools && (
    <button key="settings" type="button" data-settings aria-haspopup="dialog" aria-expanded={flyout?.key === 'settings'} aria-label="Customise the tools" title="Customise the tools: which ones show, their order and how the pen behaves" onClick={(e) => setFlyout(flyout?.key === 'settings' ? null : { key: 'settings', top: flyTop(e.currentTarget) })} className={`${btn} ${flyout?.key === 'settings' ? on : 'text-muted'}`} style={{ width: size, height: size }}>
      <Icon name="format" size={18} />
    </button>
  )

  if (readOnly) return null

  const activeStyleKey: StyleKey = isShape(tool) ? tool : hasStyle(tool) ? tool : 'pen'
  const ActiveIcon: IconName = isShape(tool) ? SHAPE_ICON[tool] : tool === 'highlight' ? 'highlighter' : tool === 'underline' ? 'underline' : tool === 'strike' ? 'strike' : tool === 'pen' ? 'edit' : tool === 'text' ? 'type' : tool === 'eraser' ? 'trash' : tool === 'whiteout' ? 'eraser' : tool === 'link' ? 'link' : 'select'
  const toward: IconName = place.side === 'left' ? 'chevronLeft' : 'chevronRight'
  const half = Math.round(size * 0.7)

  return (
    <div
      ref={root}
      data-floating-tools={folded ? 'collapsed' : place.side}
      data-bar-mode={mode}
      className={`absolute z-20 transition-opacity ${faded ? 'opacity-30' : 'opacity-100'}`}
      style={style}
      onPointerEnter={wake}
      onPointerDown={wake}
      onFocus={wake}
    >
      {folded ? (
        <button type="button" aria-label="Show the markup tools" title="Show the markup tools (drag to move)" onPointerDown={startDrag} onClick={() => !dragged.current && (setIdleFolded(false), setPlace({ ...place, collapsed: false }))} className={`${btn} touch-none border border-line bg-surface shadow-lg ${on}`} style={{ width: size, height: size }}>
          <Icon name={ActiveIcon} size={20} />
          {hasStyle(tool) || isShape(tool) ? dot(styles[activeStyleKey].color) : null}
        </button>
      ) : (
        <>
          <div ref={bar} role="toolbar" aria-orientation="vertical" aria-label={label} className="grid justify-center gap-0.5 rounded-ui border border-line bg-surface p-0.5 shadow-lg" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, width }}>
            <button type="button" aria-label="Move the markup tools" title="Drag to move the tools; they snap to the left or right edge" onPointerDown={startDrag} className={`${btn} cursor-grab touch-none text-muted`} style={{ width: size, height: half }}>
              ⠿
            </button>
            <button type="button" aria-label="Collapse the markup tools" title="Collapse the tools to one small button" onClick={() => (setFlyout(null), setPlace({ ...place, collapsed: true }))} className={`${btn} text-muted`} style={{ width: size, height: half }}>
              <Icon name={toward} size={14} />
            </button>
            {shownTools.map((id) => {
              switch (id) {
                case 'select':
                  return toolButton({ t: 'select', icon: 'select', text: NAME.select as string })
                case 'lasso':
                  return toolButton({ t: 'lasso', icon: 'boundary', text: NAME.lasso as string })
                case 'highlight':
                  return toolButton({ t: 'highlight', icon: 'highlighter', text: 'Highlight' })
                case 'underline':
                  return toolButton({ t: 'underline', icon: 'underline', text: 'Underline' })
                case 'strike':
                  return toolButton({ t: 'strike', icon: 'strike', text: 'Strikethrough' })
                case 'pen':
                  return toolButton({ t: 'pen', icon: 'edit', text: 'Pen' })
                case 'text':
                  return toolButton({ t: 'text', icon: 'type', text: 'Text box' })
                case 'shapes':
                  return toolButton({ t: shape, key2: 'shapes', icon: SHAPE_ICON[shape], text: `Shapes (${SHAPE_NAME[shape]})` })
                case 'whiteout':
                  return toolButton({ t: 'whiteout', icon: 'eraser', text: NAME.whiteout as string })
                case 'eraser':
                  return toolButton({ t: 'eraser', icon: 'trash', text: 'Eraser: touch markup to delete it' })
                case 'link':
                  return toolButton({ t: 'link', icon: 'link', text: NAME.link as string })
              }
            })}
            {mode !== 'more' ? (
              <>
                {extras.map(extraButton)}
                {fadeButton}
                {settingsButton}
              </>
            ) : (
              <button type="button" data-more aria-haspopup="dialog" aria-expanded={flyout?.key === 'more'} aria-label="More: undo, redo and page actions" title="More" onClick={(e) => setFlyout(flyout?.key === 'more' ? null : { key: 'more', top: flyTop(e.currentTarget) })} className={`${btn} ${flyout?.key === 'more' ? on : 'text-muted'}`} style={{ width: size, height: size }}>
                <Icon name="details" size={20} />
              </button>
            )}
          </div>
          {flyout && flyout.key !== 'more' && flyout.key !== 'settings' && <Flyout kind={flyout.key} top={flyout.top} side={place.side} styles={styles} onStyle={onStyle} shape={shape} tool={tool} onTool={onTool} presets={presets} onSavePreset={onSavePreset} onRemovePreset={onRemovePreset} onClose={() => setFlyout(null)} />}
          {flyout?.key === 'settings' && onTools && <ToolSettings tools={shownTools} onTools={onTools} onReset={() => onReset?.()} onClose={() => setFlyout(null)} side={place.side} top={flyout.top} />}
          {flyout?.key === 'more' && (
            <MoreFlyout top={flyout.top} side={place.side} onClose={() => setFlyout(null)}>
              {extras.map(extraButton)}
              {fadeButton}
              {settingsButton}
            </MoreFlyout>
          )}
        </>
      )}
    </div>
  )
}

function useOutside(ref: React.RefObject<HTMLElement>, onClose: () => void) {
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
  }, [ref, onClose])
}

/** The actions that did not fit in the bar. */
function MoreFlyout({ top, side, onClose, children }: { top: number; side: 'left' | 'right'; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)
  return (
    <div ref={ref} role="dialog" aria-label="More tools" data-flyout="more" className={`absolute z-30 flex flex-wrap gap-0.5 rounded-ui border border-line bg-surface p-1 shadow-xl ${side === 'left' ? 'left-full ml-2' : 'right-full mr-2'}`} style={{ top: Math.max(0, top - 4), width: 5 * 44 + 12 }}>
      {children}
    </div>
  )
}

/** One tool's colours, thickness and strength, beside the bar, with a live preview. */
function Flyout({ kind, top, side, styles, onStyle, shape, tool, onTool, presets, onSavePreset, onRemovePreset, onClose }: { kind: StyleKey | 'shapes'; top: number; side: 'left' | 'right'; styles: ToolStyles; onStyle: (key: StyleKey, change: Partial<ToolStyle>) => void; shape: Shape; tool: PdfTool; onTool: (t: PdfTool) => void; presets?: Presets; onSavePreset?: (key: StyleKey) => void; onRemovePreset?: (key: StyleKey, index: number) => void; onClose: () => void }) {
  const key: StyleKey = kind === 'shapes' ? shape : kind
  const st = styles[key]
  const range = sizeRange(key)
  const ref = useRef<HTMLDivElement>(null)
  useOutside(ref, onClose)

  const name = kind === 'shapes' ? 'Shapes' : (NAME[key] ?? key)
  return (
    <div ref={ref} role="dialog" aria-label={`${name}: colour and size`} data-flyout={key} className={`absolute z-30 w-60 rounded-ui border border-line bg-surface p-3 text-sm shadow-xl ${side === 'left' ? 'left-full ml-2' : 'right-full mr-2'}`} style={{ top: Math.max(0, top - 8) }}>
      <div className="mb-2 font-medium">{name.split(' (')[0]}</div>
      {kind === 'shapes' && (
        <div className="mb-3 flex gap-1" role="radiogroup" aria-label="Shape">
          {SHAPES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={shape === s} aria-label={SHAPE_NAME[s]} title={SHAPE_NAME[s]} onClick={() => onTool(s)} className={`grid h-11 w-11 place-items-center rounded-ui border border-line hover:bg-bg ${shape === s && isShape(tool) ? 'bg-brand/20 ring-1 ring-brand/60' : ''}`}>
              <Icon name={SHAPE_ICON[s]} size={18} />
            </button>
          ))}
        </div>
      )}
      <div role="radiogroup" aria-label="Colour" className="flex flex-wrap gap-1.5">
        {PALETTE.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={st.color.toLowerCase() === c} aria-label={`Colour ${c}`} title={c} onClick={() => onStyle(key, { color: c })} className="grid h-10 w-10 place-items-center rounded-full">
            <span className={`h-6 w-6 rounded-full border ${st.color.toLowerCase() === c ? 'border-ink ring-2 ring-brand' : 'border-line'}`} style={{ background: c }} />
          </button>
        ))}
        <label className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-dashed border-line text-xs text-muted" title="Custom colour">
          <span aria-hidden="true">+</span>
          <input type="color" aria-label="Custom colour" value={st.color} onChange={(e) => onStyle(key, { color: e.target.value })} className="sr-only" />
        </label>
      </div>
      {range && (
        <label className="mt-3 block">
          <span className="flex justify-between text-xs text-muted">
            <span>{range.label}</span>
            <span>{st.size}</span>
          </span>
          <input type="range" min={range.min} max={range.max} step={range.step} value={st.size} aria-label={range.label} onChange={(e) => onStyle(key, { size: Number(e.target.value) })} className="h-8 w-full accent-[rgb(var(--c-brand))]" />
        </label>
      )}
      {key === 'highlight' && (
        <label className="mt-3 block">
          <span className="flex justify-between text-xs text-muted">
            <span>Strength</span>
            <span>{Math.round(st.opacity * 100)}%</span>
          </span>
          <input type="range" min={15} max={85} step={5} value={Math.round(st.opacity * 100)} aria-label="Highlighter strength" onChange={(e) => onStyle(key, { opacity: Number(e.target.value) / 100 })} className="h-8 w-full accent-[rgb(var(--c-brand))]" />
        </label>
      )}
      <Preview kind={key} color={st.color} size={st.size} opacity={st.opacity} />
      {onSavePreset && (
        <div className="mt-3" data-presets={key}>
          <div className="mb-1 flex items-center justify-between text-xs text-muted">
            <span>Presets</span>
            <button type="button" data-save-preset onClick={() => onSavePreset(key)} className="rounded border border-line px-2 py-1 text-ink hover:bg-bg [@media(pointer:coarse)]:min-h-11" title="Keep this colour and thickness for next time">
              Save current
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {(presets?.[key] ?? []).slice(0, MAX_PRESETS).map((p, i) => (
              <span key={`${p.color}-${p.size}-${i}`} className="relative inline-flex">
                <button type="button" data-preset={i} aria-label={`Use preset ${i + 1}: ${p.color}, ${p.size}`} title={`${p.color}, ${p.size}`} onClick={() => onStyle(key, p)} className="grid h-10 min-w-10 place-items-center gap-0 rounded-ui border border-line px-1 hover:bg-bg">
                  <span className="rounded-full border border-black/20" style={{ background: p.color, width: 20, height: Math.max(4, Math.min(16, p.size + 2)) }} />
                  <span className="text-[10px] leading-none text-muted">{p.size}</span>
                </button>
                <button type="button" aria-label={`Remove preset ${i + 1}`} onClick={() => onRemovePreset?.(key, i)} className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-line bg-surface text-[9px] leading-none text-muted hover:text-ink">
                  ✕
                </button>
              </span>
            ))}
            {!presets?.[key]?.length && <span className="text-xs text-muted">None yet</span>}
          </div>
        </div>
      )}
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
