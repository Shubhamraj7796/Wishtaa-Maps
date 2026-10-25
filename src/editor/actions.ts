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
  serializeBranches,
  setCollapsed,
  setFloatingPosition,
  setText,
  type Branch,
} from '@/core/model/commands'
import { LOCAL, snapshotTopics } from '@/core/model/doc'
import { ancestorIds, buildIndex, childrenOf, topLevelOnly } from '@/core/model/tree'
import { outlineToBranches, parseOutline, toOutline } from '@/core/io/outline'
import { revealAncestors, searchTopics } from '@/core/search'
import { addImageReferenceSource } from './images'
import { getScene } from './scene'
import { mapDoc } from './mapdoc'
import { MAX_ZOOM, MIN_ZOOM, useEditor, type Viewport } from './store'

const get = useEditor.getState
const set = useEditor.setState

export const primary = (): string | null => get().selected[get().selected.length - 1] ?? null

// ---------- selection ----------
export function selectIds(ids: string[]) {
  set({ selected: ids })
}
export function selectOnly(id: string) {
  set({ selected: [id] })
}
export function toggleSelect(id: string) {
  const s = get().selected
  set({ selected: s.includes(id) ? s.filter((x) => x !== id) : [...s, id] })
}
export function selectAll() {
  set({ selected: getScene().order })
}
export function clearSelection() {
  set({ selected: [] })
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

export function cmdToggleCollapse() {
  const { selected, topics } = get()
  const idx = buildIndex(topics)
  const withKids = selected.filter((id) => childrenOf(idx, id).length)
  if (!withKids.length) return
  const allCollapsed = withKids.every((id) => topics[id]?.collapsed)
  setCollapsed(mapDoc, withKids, !allCollapsed)
}

export function expandBadge(id: string) {
  const t = get().topics[id]
  if (t?.collapsed) setCollapsed(mapDoc, [id], false)
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

export const cmdUndo = () => mapDoc.undo.undo()
export const cmdRedo = () => mapDoc.undo.redo()

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

/** Renames the map. Not an undo step. */
export function setTitle(title: string) {
  mapDoc.ydoc.transact(() => mapDoc.meta.set('title', title), 'title')
}
export const setPalette = (paletteOpen: boolean) => set({ paletteOpen })
export const setHelp = (helpOpen: boolean) => set({ helpOpen })
