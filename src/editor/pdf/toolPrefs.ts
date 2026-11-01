import type { PdfTool } from '../store'

/** The tools that draw or mark, each remembering its own colour and size (and the highlighter its strength). */
export type StyleKey = 'highlight' | 'underline' | 'strike' | 'pen' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow'

export interface ToolStyle {
  color: string
  /** 1 to 12 for strokes (a tenth of a percent of the page width each), 8 to 60 for text (a thousandth of the page height). */
  size: number
  /** Highlighter only: 0.15 to 0.85. */
  opacity: number
}

export type ToolStyles = Record<StyleKey, ToolStyle>

export const STYLE_KEYS: readonly StyleKey[] = ['highlight', 'underline', 'strike', 'pen', 'text', 'rect', 'ellipse', 'line', 'arrow']
export const SHAPES = ['rect', 'ellipse', 'line', 'arrow'] as const
export type Shape = (typeof SHAPES)[number]
export const isShape = (t: PdfTool): t is Shape => (SHAPES as readonly string[]).includes(t)
export const hasStyle = (t: PdfTool): t is StyleKey => (STYLE_KEYS as readonly string[]).includes(t)

/** A good palette (the first is each tool's own starting colour where it fits). */
export const PALETTE = ['#facc15', '#4ade80', '#38bdf8', '#f472b6', '#fb923c', '#ef4444', '#a855f7', '#2563eb', '#111827', '#ffffff'] as const

export const DEFAULT_STYLES: ToolStyles = {
  highlight: { color: '#facc15', size: 4, opacity: 0.4 },
  underline: { color: '#2563eb', size: 3, opacity: 1 },
  strike: { color: '#ef4444', size: 3, opacity: 1 },
  pen: { color: '#ef4444', size: 4, opacity: 1 },
  text: { color: '#111827', size: 20, opacity: 1 },
  rect: { color: '#ef4444', size: 4, opacity: 1 },
  ellipse: { color: '#ef4444', size: 4, opacity: 1 },
  line: { color: '#ef4444', size: 4, opacity: 1 },
  arrow: { color: '#ef4444', size: 4, opacity: 1 },
}

/** The range of the size slider for a tool, and what it is called. */
export function sizeRange(key: StyleKey): { min: number; max: number; label: string } | null {
  if (key === 'highlight') return null
  if (key === 'text') return { min: 8, max: 60, label: 'Text size' }
  if (key === 'underline' || key === 'strike') return { min: 1, max: 8, label: 'Thickness' }
  return { min: 1, max: 12, label: 'Thickness' }
}

/** A stroke's width as the fraction of the page width that is stored in the markup. */
export const strokeWidth = (size: number) => size / 1000
/** A text box's size as the fraction of the page height that is stored in the markup. */
export const textSize = (size: number) => size / 1000

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const isColor = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)

export function sanitizeStyle(key: StyleKey, raw: Partial<ToolStyle> | undefined): ToolStyle {
  const d = DEFAULT_STYLES[key]
  const range = sizeRange(key)
  return {
    color: isColor(raw?.color) ? raw.color : d.color,
    size: range && Number.isFinite(raw?.size) ? clamp(Math.round(raw?.size as number), range.min, range.max) : d.size,
    opacity: Number.isFinite(raw?.opacity) ? clamp(raw?.opacity as number, 0.15, 0.85) : d.opacity,
  }
}

/** Where the floating toolbar is: which edge of the PDF area it snaps to, and how far down (0 top, 1 bottom). */
export interface ToolbarPlace {
  side: 'left' | 'right'
  y: number
  collapsed: boolean
  fade: boolean
}

export interface Prefs {
  styles: ToolStyles
  shape: Shape
  bar: ToolbarPlace | null
}

const KEY = 'wishtaamaps:pdf-tools'

export function defaultPlace(touch: boolean): ToolbarPlace {
  return touch ? { side: 'right', y: 0.8, collapsed: false, fade: false } : { side: 'left', y: 0.12, collapsed: false, fade: false }
}

export function loadPrefs(): Prefs {
  let raw: Partial<{ styles: Record<string, Partial<ToolStyle>>; shape: string; bar: Partial<ToolbarPlace> }> = {}
  try {
    raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}
  } catch {
    raw = {}
  }
  const styles = {} as ToolStyles
  for (const k of STYLE_KEYS) styles[k] = sanitizeStyle(k, raw.styles?.[k])
  const b = raw.bar
  const bar: ToolbarPlace | null = b && (b.side === 'left' || b.side === 'right') ? { side: b.side, y: clamp(Number(b.y) || 0, 0, 1), collapsed: !!b.collapsed, fade: !!b.fade } : null
  return { styles, shape: (SHAPES as readonly string[]).includes(raw.shape ?? '') ? (raw.shape as Shape) : 'rect', bar }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* not remembered */
  }
}

/** Where a dragged toolbar lands: on the nearer side edge of the area, keeping its height (clamped so it stays inside). */
export function snapToolbar(centerX: number, top: number, area: { width: number; height: number }, bar: { height: number }): { side: 'left' | 'right'; y: number } {
  const side = centerX < area.width / 2 ? 'left' : 'right'
  const room = Math.max(1, area.height - bar.height)
  return { side, y: clamp(top / room, 0, 1) }
}

/** Where a floating toolbar was left on this device. Each surface ("pdf", "picture") keeps its own place. */
export function loadBar(key: string): ToolbarPlace | null {
  if (key === 'pdf') return loadPrefs().bar
  try {
    const b = JSON.parse(localStorage.getItem(`wishtaamaps:markup-bar:${key}`) ?? 'null') as Partial<ToolbarPlace> | null
    return b && (b.side === 'left' || b.side === 'right') ? { side: b.side, y: clamp(Number(b.y) || 0, 0, 1), collapsed: !!b.collapsed, fade: !!b.fade } : null
  } catch {
    return null
  }
}

export function saveBar(key: string, place: ToolbarPlace) {
  if (key === 'pdf') return savePrefs({ ...loadPrefs(), bar: place })
  try {
    localStorage.setItem(`wishtaamaps:markup-bar:${key}`, JSON.stringify(place))
  } catch {
    /* not remembered */
  }
}
