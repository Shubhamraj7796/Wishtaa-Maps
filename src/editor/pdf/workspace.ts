/**
 * The PDF panel's workspace: which PDFs of a map are open in tabs, which one (or two, side by side) is showing, and where each one was
 * left (page, zoom, place on the page). These are small pure steps on the panel state so they can be tested without a screen. The
 * workspace is remembered per map and per device (local storage); the PDF files themselves are not touched.
 */
import { isDocColor, type DocColor } from './docColor'

export interface SourceView {
  /** The page at the top of the view (1-based). */
  page: number
  /** null fits the width of the pane. */
  zoom: number | null
  /** Where in the document the view was left: a page and how far down it (0 to 1), so a change of width keeps the place. */
  anchor?: { n: number; frac: number }
  /** A request from the other pane (Sync scrolling) to move here. `at` makes the same place move again. */
  syncTo?: { n: number; frac: number; at: number }
  // Layout choices (all optional; absent = one page, scrolling, fit width, left to right). Remembered per PDF and per device.
  /** Two pages side by side, like an open book. */
  two?: boolean
  /** With two pages: the first page alone on the right, then 2-3, 4-5... (off: 1-2, 3-4...). */
  cover?: boolean
  /** One page (or spread) at a time instead of a continuous scroll. */
  paged?: boolean
  /** Right-to-left reading: the first page of a spread is on the right. */
  rtl?: boolean
  /** What "no zoom" fits: the width of the pane (default) or the whole page or spread. */
  fit?: 'width' | 'page' | 'height'
  /** In Two-page view with scrolling off, a turn moves by one page instead of a whole spread ("1-page flipping"). */
  flip1?: boolean
  /** Document colour: how the pages look on screen (absent = Light). Display only. */
  color?: DocColor
}

/** The layout choices of a view, only the ones that are set (so old saves and new ones stay small). */
const layoutOf = (v: SourceView) => ({
  ...(v.two ? { two: true } : {}),
  ...(v.cover ? { cover: true } : {}),
  ...(v.paged ? { paged: true } : {}),
  ...(v.rtl ? { rtl: true } : {}),
  ...(v.fit === 'page' || v.fit === 'height' ? { fit: v.fit } : {}),
  ...(v.flip1 ? { flip1: true } : {}),
  ...(isDocColor(v.color) && v.color !== 'light' ? { color: v.color } : {}),
})
/** The valid layout choices out of anything (a saved file, a stored default): only the ones that are set. */
export const layoutFrom = (v: Partial<SourceView>): Pick<SourceView, 'two' | 'cover' | 'paged' | 'rtl' | 'fit' | 'flip1' | 'color'> => ({
  ...(v.two === true ? { two: true } : {}),
  ...(v.cover === true ? { cover: true } : {}),
  ...(v.paged === true ? { paged: true } : {}),
  ...(v.rtl === true ? { rtl: true } : {}),
  ...(v.fit === 'page' || v.fit === 'height' ? { fit: v.fit } : {}),
  ...(v.flip1 === true ? { flip1: true } : {}),
  ...(isDocColor(v.color) && v.color !== 'light' ? { color: v.color } : {}),
})

export const DEFAULT_VIEW: SourceView = { page: 1, zoom: null }

export interface Workspace {
  /** The PDF the tools work on (the active pane). */
  sourceId: string | null
  /** The PDF in the other pane when two are side by side. */
  other: string | null
  /** Which side the active pane is on. */
  activeSide: 'left' | 'right'
  /** Every open PDF, in tab order. */
  tabs: string[]
  views: Record<string, SourceView>
  /** The share of the PDF area the left (or top) pane takes. */
  ratio: number
  /** Scrolling one pane scrolls the other. */
  sync: boolean
  /** The active pane's page and zoom, copied from its view so everything that reads them keeps working. */
  page: number
  zoom: number | null
}

export const viewOf = (w: Pick<Workspace, 'views'>, id: string | null): SourceView => (id ? w.views[id] ?? DEFAULT_VIEW : DEFAULT_VIEW)

export const mirrorOf = <T extends Workspace>(w: T): T => mirror(w)

function mirror<T extends Workspace>(w: T): T {
  const v = viewOf(w, w.sourceId)
  return { ...w, page: v.page, zoom: v.zoom }
}

const withTab = (tabs: string[], id: string) => (tabs.includes(id) ? tabs : [...tabs, id])

/** Opens a PDF as a tab (nothing else changes). */
export const openTab = <T extends Workspace>(w: T, id: string): T => ({ ...w, tabs: withTab(w.tabs, id) })

/** Shows a PDF in the active pane (or focuses the pane it is already in). */
export function activate<T extends Workspace>(w: T, id: string): T {
  const tabs = withTab(w.tabs, id)
  if (id === w.sourceId) return { ...w, tabs }
  if (id === w.other) return mirror({ ...w, tabs, sourceId: id, other: w.sourceId, activeSide: w.activeSide === 'left' ? 'right' : 'left' })
  return mirror({ ...w, tabs, sourceId: id })
}

/** Closes a tab (the PDF stays in the map). */
export function closeTab<T extends Workspace>(w: T, id: string): T {
  const tabs = w.tabs.filter((t) => t !== id)
  if (id === w.other) return { ...w, tabs, other: null, activeSide: 'left' }
  if (id !== w.sourceId) return { ...w, tabs }
  if (w.other) return mirror({ ...w, tabs, sourceId: w.other, other: null, activeSide: 'left' })
  const i = w.tabs.indexOf(id)
  const next = tabs[Math.min(i, tabs.length - 1)] ?? null
  return mirror({ ...w, tabs, sourceId: next })
}

/** Puts `id` in the left or right pane (a tab dropped on a half). The pane's former PDF goes to the other half. */
export function splitWith<T extends Workspace>(w: T, id: string, side: 'left' | 'right'): T {
  const tabs = withTab(w.tabs, id)
  const panes = w.activeSide === 'left' ? [w.sourceId, w.other] : [w.other, w.sourceId]
  // The PDF that stays: the other one of the current two, or (if `id` was not showing) the one that was active.
  const stays = id === panes[0] ? panes[1] : id === panes[1] ? panes[0] : w.sourceId
  if (!stays || stays === id) return { ...w, tabs } // a split needs two different PDFs
  return mirror({ ...w, tabs, sourceId: id, other: stays, activeSide: side })
}

/** Back to one pane, keeping the given PDF (default: the active one). */
export function unsplit<T extends Workspace>(w: T, keep: string | null = w.sourceId): T {
  if (!w.other) return w
  const id = keep && (keep === w.sourceId || keep === w.other) ? keep : w.sourceId
  return mirror({ ...w, sourceId: id, other: null, activeSide: 'left' })
}

/** Moves a tab (drag to reorder). */
export function reorder<T extends Workspace>(w: T, id: string, to: number): T {
  const from = w.tabs.indexOf(id)
  if (from < 0) return w
  const tabs = w.tabs.filter((t) => t !== id)
  tabs.splice(Math.max(0, Math.min(tabs.length, to)), 0, id)
  return { ...w, tabs }
}

/** Changes one PDF's view. The active pane's page and zoom follow. */
export function setView<T extends Workspace>(w: T, id: string, change: Partial<SourceView>): T {
  const next = { ...w, views: { ...w.views, [id]: { ...viewOf(w, id), ...change } } }
  return id === w.sourceId ? mirror(next) : next
}

/** Forgets PDFs that are no longer in the map. */
export function prune<T extends Workspace>(w: T, valid: ReadonlySet<string>): T {
  const tabs = w.tabs.filter((t) => valid.has(t))
  const views = Object.fromEntries(Object.entries(w.views).filter(([k]) => valid.has(k)))
  let next: T = { ...w, tabs, views }
  if (next.other && !valid.has(next.other)) next = { ...next, other: null, activeSide: 'left' }
  if (next.sourceId && !valid.has(next.sourceId)) next = next.other ? mirror({ ...next, sourceId: next.other, other: null, activeSide: 'left' }) : mirror({ ...next, sourceId: tabs[0] ?? null })
  return next
}

// ---- remembered per map and per device -------------------------------------------------------------------------------------------

export interface SavedWorkspace {
  v: 1
  tabs: string[]
  active: string | null
  other: string | null
  side: 'left' | 'right'
  ratio: number
  sync: boolean
  views: Record<string, SourceView>
}

const key = (fileId: string) => `wishtaamaps:pdf-workspace:${fileId}`

export function saveWorkspace(fileId: string, w: Workspace, store: Pick<Storage, 'setItem'> | undefined = safe()) {
  try {
    const views = Object.fromEntries(Object.entries(w.views).map(([id, v]) => [id, { page: v.page, zoom: v.zoom, ...(v.anchor ? { anchor: v.anchor } : {}), ...layoutOf(v) }]))
    const saved: SavedWorkspace = { v: 1, tabs: w.tabs, active: w.sourceId, other: w.other, side: w.activeSide, ratio: w.ratio, sync: w.sync, views }
    store?.setItem(key(fileId), JSON.stringify(saved))
  } catch {
    /* not remembered */
  }
}

export function loadWorkspace(fileId: string, valid: ReadonlySet<string>, store: Pick<Storage, 'getItem'> | undefined = safe()): Partial<Workspace> | null {
  try {
    const raw = store?.getItem(key(fileId))
    if (!raw) return null
    const s = JSON.parse(raw) as Partial<SavedWorkspace>
    if (s.v !== 1 || !Array.isArray(s.tabs)) return null
    const num = (n: unknown, d: number) => (typeof n === 'number' && Number.isFinite(n) ? n : d)
    const views: Record<string, SourceView> = {}
    for (const [id, v] of Object.entries(s.views ?? {})) {
      if (!valid.has(id) || !v) continue
      views[id] = { page: Math.max(1, Math.round(num(v.page, 1))), zoom: v.zoom === null || v.zoom === undefined ? null : Math.min(4, Math.max(0.25, num(v.zoom, 1))), ...(v.anchor ? { anchor: { n: Math.max(1, Math.round(num(v.anchor.n, 1))), frac: Math.min(1, Math.max(0, num(v.anchor.frac, 0))) } } : {}), ...layoutFrom(v) }
    }
    const base: Workspace = {
      sourceId: typeof s.active === 'string' ? s.active : null,
      other: typeof s.other === 'string' ? s.other : null,
      activeSide: s.side === 'right' ? 'right' : 'left',
      tabs: s.tabs.filter((t): t is string => typeof t === 'string'),
      views,
      ratio: Math.min(0.8, Math.max(0.2, num(s.ratio, 0.5))),
      sync: s.sync === true,
      page: 1,
      zoom: null,
    }
    return prune(mirror(base), valid)
  } catch {
    return null
  }
}

function safe(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
