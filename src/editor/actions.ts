import {
  addChild,
  addFloating,
  addSibling,
  deleteTopics,
  detachTopic,
  duplicate,
  moveTopic,
  pasteBranches,
  reorder,
  replaceTopicStyle,
  serializeBranches,
  setBranchDir,
  setBranchOffset,
  setCollapsed,
  setFloatingPosition,
  setText,
  setTopicStyle,
  setTopicStyles,
  type Branch,
} from '@/core/model/commands'
import { LOCAL, snapshotTopics } from '@/core/model/doc'
import type { BranchDir } from '@/core/model/topic'
import type { TopicStyle } from '@/core/model/types'
import { isLayoutId } from '@/core/layout/catalog'
import { setSetting, type MapSettings } from '@/core/settings'
import { applyColorScheme, applyTheme, type ThemePreview } from '@/core/theme/apply'
import { clampTopicWidth, resolveLook } from '@/core/theme/resolve'
import { DEFAULT_THEME_ID, findTheme, type Theme } from '@/core/theme/themes'
import { ancestorIds, buildIndex, childrenOf, descendantIds, topLevelOnly } from '@/core/model/tree'
import { outlineToBranches, parseOutline, toOutline } from '@/core/io/outline'
import { revealAncestors, searchTopics } from '@/core/search'
import { addImageReferenceSource } from './images'
import { getScene, getTheme } from './scene'
import { mapDoc } from './mapdoc'
import { showNotice } from './notice'
import { mayEdit } from './readmode'
import { MAX_ZOOM, MIN_ZOOM } from './navigation'
import { useEditor, type PanelTab, type Viewport } from './store'

const get = useEditor.getState
const set = useEditor.setState

export const primary = (): string | null => get().selected[get().selected.length - 1] ?? null

// ---------- selection ----------
export function selectIds(ids: string[]) {
  set({ selected: ids, selectedObject: null })
}
export function selectOnly(id: string) {
  set({ selected: [id], selectedObject: null })
}
export function toggleSelect(id: string) {
  const s = get().selected
  set({ selected: s.includes(id) ? s.filter((x) => x !== id) : [...s, id], selectedObject: null })
}
export function selectAll() {
  set({ selected: getScene().order, selectedObject: null })
}
export function clearSelection() {
  set({ selected: [], selectedObject: null })
}

// ---------- viewport ----------
export function setViewport(v: Viewport) {
  set({ viewport: v })
}
export function zoomAround(factor: number, cx: number, cy: number) {
  const { viewport: v } = get()
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor))
  const wx = (cx - v.x) / v.k
  const wy = (cy - v.y) / v.k
  set({ viewport: { k, x: cx - wx * k, y: cy - wy * k } })
}
export function zoomBy(factor: number) {
  const { w, h } = get().canvasSize
  zoomAround(factor, w / 2, h / 2)
}
/** Zooms to an exact percentage (2 to 400) around the middle of the canvas. */
export function setZoomPercent(percent: number) {
  if (!Number.isFinite(percent)) return
  const { w, h } = get().canvasSize
  const { viewport: v } = get()
  zoomAround(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, percent / 100)) / v.k, w / 2, h / 2)
}
export function zoomTo100() {
  const { w, h } = get().canvasSize
  const { viewport: v } = get()
  zoomAround(1 / v.k, w / 2, h / 2)
}
export function fitToScreen() {
  const { canvasSize: c } = get()
  const b = getScene().bounds
  if (!c.w || !c.h || !b.w) return
  const pad = 70
  const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 1.5, (c.w - pad * 2) / b.w, (c.h - pad * 2) / b.h))
  set({ viewport: { k, x: c.w / 2 - (b.x + b.w / 2) * k, y: c.h / 2 - (b.y + b.h / 2) * k } })
}
export function centerOn(id: string) {
  const box = getScene().boxes.get(id)
  const { canvasSize: c, viewport: v } = get()
  if (!box || !c.w) return
  set({ viewport: { k: v.k, x: c.w / 2 - (box.x + box.w / 2) * v.k, y: c.h / 2 - (box.y + box.h / 2) * v.k } })
}
/** Pans only if the topic is off-screen (or nearly). */
export function ensureVisible(id: string) {
  const box = getScene().boxes.get(id)
  const { canvasSize: c, viewport: v } = get()
  if (!box || !c.w) return
  const x0 = box.x * v.k + v.x
  const y0 = box.y * v.k + v.y
  const x1 = x0 + box.w * v.k
  const y1 = y0 + box.h * v.k
  const m = 40
  if (x0 < m || y0 < m || x1 > c.w - m || y1 > c.h - m) centerOn(id)
}
export function viewportCenterWorld() {
  const { canvasSize: c, viewport: v } = get()
  return { x: (c.w / 2 - v.x) / v.k, y: (c.h / 2 - v.y) / v.k }
}

// ---------- editing ----------
export function beginEdit(id: string | null = primary()) {
  if (!mayEdit('Renaming')) return
  if (id) set({ editingId: id, selected: [id] })
}
export function commitEdit(id: string, text: string) {
  const old = get().topics[id]?.text ?? ''
  setText(mapDoc, id, text.trim() ? text : old)
  set({ editingId: null })
}
export function cancelEdit() {
  set({ editingId: null })
}

function reveal(id: string) {
  const t = get().topics
  const rootId = get().focusId ?? get().rootId
  if (get().levels !== null) {
    const depth = ancestorIds(t, id).length - ancestorIds(t, rootId).length
    if (depth > (get().levels ?? 0)) set({ levels: depth })
  }
  requestAnimationFrame(() => ensureVisible(id))
}

export function cmdAddChild() {
  const pid = primary() ?? get().rootId
  if (!get().topics[pid]) return
  const id = addChild(mapDoc, pid)
  set({ selected: [id], editingId: id })
  reveal(id)
}

export function cmdAddSibling() {
  const cur = primary()
  const id = cur ? addSibling(mapDoc, cur) : null
  if (!id) return cmdAddChild()
  set({ selected: [id], editingId: id })
  reveal(id)
}

export function cmdAddFloating(pos = viewportCenterWorld()) {
  const id = addFloating(mapDoc, pos)
  set({ selected: [id], editingId: id })
}

export function cmdDelete() {
  const { selected, topics, rootId } = get()
  const ids = topLevelOnly(topics, selected.filter((id) => id !== rootId))
  if (!ids.length) return
  const first = topics[ids[0] ?? '']
  const idx = buildIndex(topics)
  let next: string | null = first?.parentId ?? rootId
  if (first?.parentId) {
    const sibs = childrenOf(idx, first.parentId).filter((s) => !ids.includes(s.id))
    const pos = childrenOf(idx, first.parentId).findIndex((s) => s.id === first.id)
    next = sibs[Math.min(pos, sibs.length - 1)]?.id ?? first.parentId
  }
  deleteTopics(mapDoc, ids)
  set({ selected: next ? [next] : [], editingId: null })
}

/** Whether a topic is collapsed as the reader sees it: in Read mode their own folding, else what the map says. */
export function isCollapsed(id: string): boolean {
  const { readOnly, viewCollapsed, topics } = get()
  return readOnly && id in viewCollapsed ? !!viewCollapsed[id] : !!topics[id]?.collapsed
}

/** Folds or unfolds. In Read mode this is view state only: it is never written to the map, the file or Drive. */
function foldTopics(ids: string[], collapsed: boolean) {
  if (!get().readOnly) return setCollapsed(mapDoc, ids, collapsed)
  const next = { ...get().viewCollapsed }
  for (const id of ids) next[id] = collapsed
  set({ viewCollapsed: next })
}

/** Folds or unfolds one topic (in Read mode as view state only). */
export function toggleFold(id: string) {
  foldTopics([id], !isCollapsed(id))
}

export function cmdToggleCollapse() {
  const { selected, topics } = get()
  const idx = buildIndex(topics)
  const withKids = selected.filter((id) => childrenOf(idx, id).length)
  if (!withKids.length) return
  const allCollapsed = withKids.every((id) => isCollapsed(id))
  foldTopics(withKids, !allCollapsed)
}

export function expandBadge(id: string) {
  if (isCollapsed(id)) foldTopics([id], false)
  else if (get().levels !== null) set({ levels: null })
}

export function cmdReorder(delta: -1 | 1) {
  const id = primary()
  if (id) reorder(mapDoc, id, delta)
}

export function cmdDetach() {
  const id = primary()
  const box = id ? getScene().boxes.get(id) : null
  if (id && box && detachTopic(mapDoc, id, { x: box.x + box.w / 2 + 40, y: box.y + box.h / 2 + 60 })) selectOnly(id)
}

export const cmdUndo = () => void (mayEdit('Undo') && mapDoc.undo.undo())
export const cmdRedo = () => void (mayEdit('Redo') && mapDoc.undo.redo())

// ---------- drag & drop ----------
export type DropMode = 'child' | 'before' | 'after'

export function dropTopics(ids: string[], targetId: string, mode: DropMode) {
  const order = getScene().order
  const sorted = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b))
  mapDoc.ydoc.transact(() => {
    let anchor = targetId
    let anchorMode: DropMode = mode
    for (const id of sorted) {
      const topics = snapshotTopics(mapDoc)
      if (anchorMode === 'child') {
        moveTopic(mapDoc, id, anchor)
        anchor = id
        anchorMode = 'child'
        continue
      }
      const a = topics[anchor]
      if (!a?.parentId) continue
      const sibs = childrenOf(buildIndex(topics), a.parentId).filter((s) => s.id !== id)
      const at = sibs.findIndex((s) => s.id === anchor)
      if (moveTopic(mapDoc, id, a.parentId, anchorMode === 'before' ? at : at + 1)) {
        anchor = id
        anchorMode = 'after'
      }
    }
  }, LOCAL)
  set({ selected: sorted })
}

export function moveFloating(ids: string[], dx: number, dy: number) {
  const scene = getScene()
  mapDoc.ydoc.transact(() => {
    for (const id of ids) {
      const b = scene.boxes.get(id)
      if (b) setFloatingPosition(mapDoc, id, { x: b.x + b.w / 2 + dx, y: b.y + b.h / 2 + dy })
    }
  }, LOCAL)
}

// ---------- clipboard ----------
let clip: { branches: Branch[]; text: string } | null = null

// A copied branch may carry images: keep their blobs while the clipboard holds them.
function branchImageIds(bs: Branch[]): string[] {
  return bs.flatMap((b) => [...(b.data.image ? [b.data.image.imageId] : []), ...branchImageIds(b.children)])
}
addImageReferenceSource(() => (clip ? branchImageIds(clip.branches) : []))

export function cmdCopy(): string | null {
  const { selected, topics, rootId } = get()
  const ids = selected.length ? selected : [rootId]
  const branches = serializeBranches(topics, ids)
  if (!branches.length) return null
  const text = toOutline(topics, ids)
  clip = { branches, text }
  navigator.clipboard?.writeText(text).catch(() => {})
  return text
}

export function cmdCut() {
  if (cmdCopy() !== null) cmdDelete()
}

export function cmdPasteText(text: string) {
  if (!mayEdit('Pasting')) return
  let branches: Branch[] | null = null
  if (clip && (!text.trim() || text === clip.text)) branches = clip.branches
  else if (text.trim()) branches = outlineToBranches(parseOutline(text))
  if (!branches?.length) return
  const parent = primary() ?? get().rootId
  const ids = pasteBranches(mapDoc, branches, parent)
  if (ids.length) {
    set({ selected: ids })
    reveal(ids[0] ?? parent)
  }
}

export function cmdDuplicate() {
  const ids = duplicate(mapDoc, get().selected)
  if (ids.length) set({ selected: ids })
}

// ---------- navigation ----------
export function navigate(dir: 'left' | 'right' | 'up' | 'down') {
  const scene = getScene()
  const cur = scene.boxes.get(primary() ?? '')
  if (!cur) {
    set({ selected: [scene.rootId] })
    return
  }
  const cx = cur.x + cur.w / 2
  const cy = cur.y + cur.h / 2
  let best: { id: string; score: number } | null = null
  for (const b of scene.boxes.values()) {
    if (b.id === cur.id) continue
    const dx = b.x + b.w / 2 - cx
    const dy = b.y + b.h / 2 - cy
    const ok = dir === 'right' ? dx > 1 : dir === 'left' ? dx < -1 : dir === 'down' ? dy > 1 : dy < -1
    if (!ok) continue
    const along = dir === 'left' || dir === 'right' ? Math.abs(dx) : Math.abs(dy)
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    const score = along + across * 2.5
    if (!best || score < best.score) best = { id: b.id, score }
  }
  if (best) {
    selectOnly(best.id)
    ensureVisible(best.id)
  } else if (dir === 'right' || dir === 'left') {
    // Moving toward hidden children expands them.
    const t = get().topics[cur.id]
    if (t?.collapsed) setCollapsed(mapDoc, [cur.id], false)
  }
}

// ---------- levels, focus ----------
export function setLevels(n: number | null) {
  set({ levels: n })
  requestAnimationFrame(fitToScreen)
}
export function toggleFocus() {
  const { focusId } = get()
  if (focusId) {
    set({ focusId: null })
  } else {
    const id = primary()
    if (id && id !== get().rootId) set({ focusId: id })
  }
  requestAnimationFrame(fitToScreen)
}

// ---------- search ----------
export function openSearch() {
  set({ search: { ...get().search, open: true } })
}
export function closeSearch() {
  set({ search: { open: false, query: '', matches: [], index: 0 }, reveal: [] })
}
export function setQuery(query: string) {
  const topics = get().topics
  const matches = searchTopics(topics, query)
  set({ search: { open: true, query, matches, index: 0 }, reveal: revealAncestors(topics, matches) })
  const first = matches[0]
  if (first) {
    selectOnly(first)
    requestAnimationFrame(() => centerOn(first))
  }
}
export function stepMatch(delta: 1 | -1) {
  const { search } = get()
  if (!search.matches.length) return
  const index = (search.index + delta + search.matches.length) % search.matches.length
  set({ search: { ...search, index } })
  const id = search.matches[index]
  if (id) {
    selectOnly(id)
    centerOn(id)
  }
}

// ---------- misc ----------
export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen()
  else void document.documentElement.requestFullscreen?.()
}
export const setTool = (tool: 'pan' | 'select') => set({ tool })
export const openMenu = (x: number, y: number, topicId: string) => set({ menu: { x, y, topicId } })
export const closeMenu = () => set({ menu: null })

/** Updates the name shown in the header while typing. The file is renamed by `renameOpenFile` on blur. */
export function setTitle(title: string) {
  set({ title })
}
export const setPalette = (paletteOpen: boolean) => set({ paletteOpen })
export const setHelp = (helpOpen: boolean) => set({ helpOpen })

// ---------- layout, theme and style ----------
export function setLayout(id: string) {
  if (!isLayoutId(id)) return
  setSetting(mapDoc, 'layout', id)
  requestAnimationFrame(fitToScreen)
}

export function changeSetting<K extends keyof MapSettings>(key: K, value: MapSettings[K]) {
  setSetting(mapDoc, key, value)
}

/** Applies a theme by id as one undo step. Topics keep their own overrides unless `resetOverrides` is set. */
export function selectTheme(id: string, opts: { resetOverrides?: boolean } = {}) {
  const { customThemes } = get().settings
  applyTheme(mapDoc, findTheme(id, customThemes), opts)
  setThemePreview(null)
}

/** Applies a theme that is not built in (from the user's library or a file); it is kept inside the map. */
export function applyThemeData(theme: Theme, opts: { resetOverrides?: boolean } = {}) {
  applyTheme(mapDoc, theme, opts)
  setThemePreview(null)
}

/** Removes a custom theme stored inside this map. If the map uses it, the default theme is applied instead. One undo step. */
export function removeMapTheme(id: string) {
  const { customThemes, themeId } = get().settings
  mapDoc.ydoc.transact(() => {
    mapDoc.settings.set('customThemes', customThemes.filter((t) => t.id !== id))
    if (themeId === id) mapDoc.settings.set('themeId', DEFAULT_THEME_ID)
  }, LOCAL)
}

/** Colour scheme for branches (null = the theme's own colours). Colours only. One undo step. */
export function setColorScheme(id: string | null) {
  applyColorScheme(mapDoc, id)
  setThemePreview(null)
}

/** Branch thickness for the whole map in px (null = the theme's). One undo step per call: commit on release, not per drag tick. */
export function setBranchThickness(px: number | null) {
  setSetting(mapDoc, 'branchThickness', px)
  setThemePreview(null)
}

/**
 * Puts branches back to automatic thickness and taper: for the selected topics' branches (and everything below them when
 * "this branch and below" is chosen), or for the whole map including the map-wide setting. One undo step.
 */
export function resetBranchesToAuto(scope: 'selection' | 'map') {
  const { topics, settings, selected } = get()
  const patch = { lineWidth: undefined, taper: undefined }
  const dirty = (id: string) => topics[id]?.style.lineWidth !== undefined || topics[id]?.style.taper !== undefined
  const mapWide = scope === 'map' && (settings.branchThickness !== null || settings.taper !== null)
  const ids = scope === 'map' ? Object.keys(topics) : selected
  const withBranch = scope === 'selection' && get().branchScope === 'branch'
  const reach = withBranch ? [...new Set(ids.flatMap((id) => [id, ...descendantIds(buildIndex(topics), id)]))] : ids
  if (!mapWide && !reach.some(dirty)) return
  mapDoc.ydoc.transact(() => {
    setTopicStyle(mapDoc, reach.filter(dirty), patch)
    if (mapWide) {
      setSetting(mapDoc, 'branchThickness', null)
      setSetting(mapDoc, 'taper', null)
    }
  }, LOCAL)
  setThemePreview(null)
}

/** Shows a theme, colour scheme or thickness on the canvas without saving anything (null stops). */
export function setThemePreview(p: ThemePreview | null) {
  if (get().themePreview === p) return
  set({ themePreview: p })
}

/** The topics a style change reaches: the selection, every topic at the selection's level, or the selection's whole branch. */
export function styleTargets(): { ids: string[]; withBranch: boolean } {
  const { selected, styleScope } = get()
  if (styleScope === 'level') {
    const scene = getScene()
    const depths = new Set(selected.map((id) => scene.boxes.get(id)?.depth).filter((d): d is number => d !== undefined))
    const ids: string[] = []
    scene.boxes.forEach((b, id) => {
      if (depths.has(b.depth)) ids.push(id)
    })
    return { ids, withBranch: false }
  }
  return { ids: selected, withBranch: styleScope === 'branch' }
}

/** Applies style changes to the selected topics (or their level, or their branch, per the scope chosen). One undo step. */
export function styleSelected(patch: Partial<TopicStyle>) {
  const { ids, withBranch } = styleTargets()
  setTopicStyle(mapDoc, ids, patch, withBranch)
}

export function resetStyleSelected() {
  const { ids, withBranch } = styleTargets()
  replaceTopicStyle(mapDoc, ids, {}, withBranch)
}

export type StyleMode = 'scope' | 'this' | 'branch'

function targetsFor(mode: StyleMode): { ids: string[]; withBranch: boolean } {
  if (mode === 'scope') return styleTargets()
  return { ids: get().selected, withBranch: mode === 'branch' }
}

/** What a branch control reaches, from the "this branch / this branch and below" choice. */
export const branchMode = (): StyleMode => (get().branchScope === 'branch' ? 'branch' : 'this')
export const setBranchScope = (branchScope: 'this' | 'branch') => set({ branchScope })

/**
 * Shows a style change on the canvas without saving it (a slider being dragged). `null` stops. Pair with `commitStyle`
 * on release, so a whole drag is one undo step.
 */
export function previewStyle(patch: Partial<TopicStyle> | null, mode: StyleMode = 'scope') {
  if (!patch) {
    if (get().styleLive) set({ styleLive: null })
    return
  }
  const { ids, withBranch } = targetsFor(mode)
  const topics = get().topics
  const out = new Set(ids.filter((id) => topics[id]))
  if (withBranch) {
    const idx = buildIndex(topics)
    for (const id of [...out]) descendantIds(idx, id).forEach((d) => out.add(d))
  }
  set({ styleLive: { ids: [...out], patch } })
}

/** Saves a style change (and drops any preview). One undo step. */
export function commitStyle(patch: Partial<TopicStyle>, mode: StyleMode = 'scope') {
  set({ styleLive: null })
  const { ids, withBranch } = targetsFor(mode)
  setTopicStyle(mapDoc, ids, patch, withBranch)
}

/** Makes the selected topics' text bigger or smaller by `delta` px (8 to 72), each from its own current size. One undo step. */
export function nudgeFontSize(delta: number) {
  const { ids } = styleTargets()
  const scene = getScene()
  const theme = getTheme(get().settings)
  const patches: Record<string, Partial<TopicStyle>> = {}
  for (const id of ids) {
    const box = scene.boxes.get(id)
    const topic = get().topics[id]
    if (!box || !topic) continue
    const look = resolveLook(theme, { depth: box.depth, branch: box.branch, isRoot: id === scene.rootId, style: topic.style, layoutShape: scene.layoutShape })
    patches[id] = { fontSize: Math.min(72, Math.max(8, Math.round(look.fontSize + delta))) }
  }
  setTopicStyles(mapDoc, patches)
}

export const setStyleScope = (styleScope: 'selection' | 'level' | 'branch') => set({ styleScope })

/** Shows a width on the topic while its handle is dragged (nothing is saved). */
export const setTopicWidthLive = (widthLive: { id: string; width: number } | null) => set({ widthLive })

/** Sets the custom width of the selected topics (null = automatic), one undo step. Follows the scope. */
export function commitTopicWidth(width: number | null) {
  styleSelected({ width: width === null ? undefined : clampTopicWidth(width) })
}

/** Makes the selected topics wider or narrower (the keyboard way of resizing). */
export function nudgeTopicWidth(delta: number) {
  const scene = getScene()
  const { selected, topics } = get()
  const first = selected[0]
  if (!first) return
  const base = topics[first]?.style.width ?? scene.boxes.get(first)?.w ?? 160
  commitTopicWidth(base + delta)
}

/** Gives every selected branch (not the central topic) its own direction, or back to the map's. One undo step. */
export function setSelectedBranchDir(dir: BranchDir | null) {
  const root = get().rootId
  const ids = get().selected.filter((id) => id !== root)
  if (!ids.length) return
  mapDoc.ydoc.transact(() => ids.forEach((id) => setBranchDir(mapDoc, id, dir)), LOCAL)
}

export function copyFormat() {
  const id = primary()
  const t = id ? get().topics[id] : undefined
  if (!t) return
  set({ copiedFormat: structuredClone(t.style) })
  showNotice('Format copied. Paste it with Ctrl+Alt+V, or use the format painter.')
}

export function pasteFormat() {
  const f = get().copiedFormat
  if (!f) {
    showNotice('Copy a topic’s format first (Ctrl+Alt+C).')
    return
  }
  replaceTopicStyle(mapDoc, get().selected, f, get().styleScope === 'branch')
}

/** Format painter: copy the selected topic's format, then click topics to paint them. */
export function togglePainter() {
  if (!mayEdit('The format painter')) return
  if (get().painter) {
    set({ painter: null })
    return
  }
  const id = primary()
  const t = id ? get().topics[id] : undefined
  if (!t) {
    showNotice('Select a topic first, then turn on the format painter.')
    return
  }
  const style = structuredClone(t.style)
  set({ painter: style, copiedFormat: style })
  showNotice('Format painter on: click topics to paint them. Hold Shift to keep painting; Esc to stop.')
}

export function applyPainter(id: string, keep = false) {
  const style = get().painter
  if (!style) return
  replaceTopicStyle(mapDoc, [id], style)
  if (!keep) set({ painter: null })
}

/** Branch free positioning: shift whole branches by a drag distance. One undo step. */
export function moveBranches(ids: string[], dx: number, dy: number) {
  const topics = get().topics
  mapDoc.ydoc.transact(() => {
    for (const id of topLevelOnly(topics, ids)) {
      const cur = topics[id]?.offset
      setBranchOffset(mapDoc, id, { x: (cur?.x ?? 0) + dx, y: (cur?.y ?? 0) + dy })
    }
  }, LOCAL)
}

/** Puts every manually moved branch back to its automatic position. One undo step. */
export function resetBranchPositions() {
  const topics = get().topics
  mapDoc.ydoc.transact(() => {
    for (const t of Object.values(topics)) if (t.offset) setBranchOffset(mapDoc, t.id, null)
  }, LOCAL)
}

export function toggleMinimap() {
  set({ minimap: !get().minimap })
}

export function togglePanel(tab?: PanelTab) {
  if (get().readOnly) return set({ readPanelOpen: !get().readPanelOpen })
  const { panelOpen, panelTab } = get()
  if (tab) set({ panelOpen: !panelOpen || panelTab !== tab, panelTab: tab, panelTabManual: true, panelOpener: 'handle' })
  else set({ panelOpen: !panelOpen, panelOpener: 'handle' })
}

/** Opens the settings panel on a section and keeps it there until it is closed (opened by hand). */
export function openPanel(tab?: PanelTab) {
  if (get().readOnly) return
  set({ panelOpen: true, panelOpener: 'handle', ...(tab ? { panelTab: tab, panelTabManual: true } : {}) })
}

/** Closes the settings panel, and (when asked) puts keyboard focus back on the canvas. */
export function closePanel(focusCanvas = false) {
  set({ panelOpen: false, panelOpener: null })
  if (focusCanvas) document.querySelector<HTMLElement>('[role=tree][aria-label="Mind map canvas"]')?.focus()
}

let panning = 0
/** Pans the canvas smoothly by (dx, 0) screen px, over about 220 ms (used to keep a selected topic clear of the panel). */
export function panViewportBy(dx: number, ms = 220) {
  if (!dx) return
  cancelAnimationFrame(panning)
  const from = get().viewport
  const start = performance.now()
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / ms)
    const eased = 1 - Math.pow(1 - t, 3)
    const v = get().viewport
    set({ viewport: { k: v.k, y: v.y, x: from.x + dx * eased } })
    panning = t < 1 ? requestAnimationFrame(step) : 0
  }
  panning = requestAnimationFrame(step)
}
