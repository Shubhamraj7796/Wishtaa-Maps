import { normalizeLink, linkedFile, linkedTopicId, isWebLink, topicLink } from '@/core/links'
import { navigateTo, routeForFile } from '../app/navigation'
import { repository } from '../app/repo'
import { clearMarks, patchTask, setAllImageWidths, setImageAlt, setImagePosition, toggleMarkOn, addTag, removeTag, setInlineNote, setLatex, setLink, setTable } from '@/core/model/content'
import { addBoundary, addCallout, addRelationship, addSummary, deleteObject, updateObject } from '@/core/model/objectCommands'
import type { BoundaryShape, ObjectKind, ObjectRef } from '@/core/model/objects'
import type { ImagePosition } from '@/core/model/topic'
import { setSetting } from '@/core/settings'
import { centerOn, primary, selectIds, selectOnly } from './actions'
import { mapDoc } from './mapdoc'
import { showNotice } from './notice'
import { mayEdit } from './readmode'
import { useEditor, type DetailsSection, type PanelTab, type ViewMode } from './store'

const get = useEditor.getState
const set = useEditor.setState

// ---------- diagram objects ----------
export function selectObject(ref: ObjectRef | null) {
  set({ selectedObject: ref, ...(ref ? { selected: [], imageSelected: null } : {}) })
}

export function editObject(ref: ObjectRef | null) {
  set({ editingObject: ref, ...(ref ? { selectedObject: ref } : {}) })
}

/** Starts a relationship from the selected topic: the next topic you click is the other end. */
export function startRelationship() {
  if (!mayEdit('Relationship lines')) return
  const sel = get().selected
  if (sel.length >= 2) {
    finishRelationship(sel[0] as string, sel[1] as string)
    return
  }
  const from = primary()
  if (!from) {
    showNotice('Select a topic first, then choose Relationship and click the topic to connect it to.')
    return
  }
  set({ relationFrom: from })
  showNotice('Click the topic to connect to. Press Esc to cancel.')
}

export function cancelRelationship() {
  set({ relationFrom: null })
}

export function finishRelationship(from: string, to: string) {
  set({ relationFrom: null })
  if (from === to) return
  const id = addRelationship(mapDoc, from, to)
  if (id) editObject({ kind: 'relationship', id })
}

export function addCalloutToSelected() {
  const id = primary()
  if (!id) return showNotice('Select a topic first, then add a callout to it.')
  const c = addCallout(mapDoc, id)
  if (c) editObject({ kind: 'callout', id: c })
}

export function addBoundaryToSelected(shape: BoundaryShape = 'rounded') {
  const ids = get().selected
  if (!ids.length) return showNotice('Select one or more topics first, then add a boundary around them.')
  const b = addBoundary(mapDoc, ids, shape)
  if (b) selectObject({ kind: 'boundary', id: b })
}

export function addSummaryToSelected() {
  const ids = get().selected
  if (!ids.length) return showNotice('Select sibling topics first, then add a summary for them.')
  const s = addSummary(mapDoc, ids)
  if (!s) return showNotice('A summary needs topics that share the same parent (not the central topic).')
  editObject({ kind: 'summary', id: s })
}

export function patchObject(kind: ObjectKind, id: string, patch: Record<string, unknown>) {
  updateObject(mapDoc, kind, id, patch)
}

export function commitObjectText(kind: ObjectKind, id: string, text: string) {
  updateObject(mapDoc, kind, id, kind === 'relationship' ? { label: text.slice(0, 80) } : { text: text.slice(0, 400) })
  set({ editingObject: null })
}

export function deleteSelectedObject(): boolean {
  const ref = get().selectedObject
  if (!ref) return false
  deleteObject(mapDoc, ref.kind, ref.id)
  set({ selectedObject: null, editingObject: null })
  return true
}

// ---------- marks, tags, tasks, links ----------
const targets = () => (get().selected.length ? get().selected : [])

export function toggleMarkSelected(mark: string) {
  const ids = targets()
  if (!ids.length) return showNotice('Select a topic first, then pick a mark.')
  toggleMarkOn(mapDoc, ids, mark)
}

export function clearMarksSelected() {
  clearMarks(mapDoc, targets())
}

export function addTagToSelected(tag: string): boolean {
  const ids = targets()
  if (!ids.length) {
    showNotice('Select a topic first, then add a tag.')
    return false
  }
  return addTag(mapDoc, ids, tag)
}

export function removeTagFromSelected(tag: string) {
  removeTag(mapDoc, targets(), tag)
}

export function setTagColor(tag: string, color: string) {
  setSetting(mapDoc, 'tagColors', { ...get().settings.tagColors, [tag]: color })
}

export function toggleTagFilter(tag: string) {
  const cur = get().tagFilter
  set({ tagFilter: cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag] })
}

export const clearTagFilter = () => set({ tagFilter: [] })

export function toggleTaskDone(topicId: string) {
  if (!mayEdit('Changing a task')) return
  const t = get().topics[topicId]
  patchTask(mapDoc, topicId, { done: !(t?.task?.done ?? false) })
}

/** Link a topic to another topic: click this, then click the target topic. */
export function startLinkPick(fromId: string) {
  if (!mayEdit('Linking topics')) return
  set({ linkFrom: fromId })
  showNotice('Click the topic to link to. Press Esc to cancel.')
}
export function finishLinkPick(toId: string) {
  const from = get().linkFrom
  set({ linkFrom: null })
  if (from && from !== toId) setLink(mapDoc, from, topicLink(toId))
}
export const cancelLinkPick = () => set({ linkFrom: null })

export function setTopicLink(topicId: string, input: string): boolean {
  if (!input.trim()) {
    setLink(mapDoc, topicId, null)
    return true
  }
  const link = normalizeLink(input)
  if (!link) {
    showNotice('That doesn’t look like a web address. Use https://… or a mail address.')
    return false
  }
  setLink(mapDoc, topicId, link)
  return true
}

/** Opens a topic's link: web links in a new tab, topic links by jumping to that topic. */
export function followLink(topicId: string) {
  const link = get().topics[topicId]?.link
  const file = linkedFile(link)
  if (file) {
    void repository.get(file.fileId).then((f) => {
      if (!f || f.trashed) showNotice('The file this link points to is no longer here.')
      else navigateTo(routeForFile(f, file.topicId))
    })
    return
  }
  const target = linkedTopicId(link)
  if (target) {
    if (!get().topics[target]) return showNotice('The topic this link points to no longer exists.')
    selectOnly(target)
    centerOn(target)
  } else if (isWebLink(link)) {
    window.open(link, '_blank', 'noopener,noreferrer')
  }
}

export const setInline = (id: string, text: string) => setInlineNote(mapDoc, id, text)
export const setFormula = (id: string, latex: string | null) => setLatex(mapDoc, id, latex)
export const setTopicTable = (id: string, table: string[][] | null) => setTable(mapDoc, id, table)
export const setPictureAlt = (id: string, alt: string) => setImageAlt(mapDoc, id, alt)
export const setPicturePosition = (id: string, position: ImagePosition) => setImagePosition(mapDoc, id, position)

/** Gives every picture the width of the selected topic's picture. */
export function applyPictureSizeToAll(id: string) {
  const w = get().topics[id]?.image?.width
  if (w) setAllImageWidths(mapDoc, w)
}

// ---------- panels and views ----------
export function openTab(tab: PanelTab, section?: DetailsSection) {
  if (get().readOnly) return
  set({ panelOpen: true, panelTab: tab, panelTabManual: true, panelOpener: 'handle', detailsSection: section ?? null })
}

export function setView(view: ViewMode) {
  set({ view })
}

export function toggleNumbering() {
  setSetting(mapDoc, 'numbering', !get().settings.numbering)
}

export function toggleInsert(open?: boolean) {
  set({ insertOpen: open ?? !get().insertOpen })
}

export const showPreview = (imageId: string | null) => set({ lightbox: imageId })
export const startOcr = (topicId: string | null) => set({ ocrTopic: topicId })

/** Selects topics in the map by id (used by the outline view). */
export const selectTopics = (ids: string[]) => selectIds(ids)
