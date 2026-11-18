import { create } from 'zustand'

export type ListKind = 'notes' | 'tasks'

/** Which small list (the notes or tasks of one topic) is open, and which note or task has its popup open. UI state only, never saved. */
interface ItemsState {
  list: { kind: ListKind; topicId: string; anchor: HTMLElement } | null
  popup: { kind: 'note' | 'task'; id: string } | null
  /** Notes that are minimized to the tray (their popups stay mounted but hidden, so nothing about them changes). At most MAX_MINIMIZED. */
  minimized: string[]
}

/** How many notes the tray holds. A minimize past it closes the oldest one (it was saved already). */
export const MAX_MINIMIZED = 4

export const useItems = create<ItemsState>(() => ({ list: null, popup: null, minimized: [] }))

export function toggleList(kind: ListKind, topicId: string, anchor: HTMLElement) {
  const cur = useItems.getState().list
  useItems.setState({ list: cur && cur.kind === kind && cur.topicId === topicId ? null : { kind, topicId, anchor } })
}
export const closeList = () => useItems.setState({ list: null })

/**
 * What a popup does when it is left for another one (a note chosen from the side list, Previous / Next, a task opened): it saves what
 * was typed (the title and the text, at once, not 500 ms later) and an empty new note is removed. Each open popup registers its own.
 */
const leaveHooks = new Map<string, () => void>()
export function onLeave(id: string, fn: () => void): () => void {
  leaveHooks.set(id, fn)
  return () => {
    if (leaveHooks.get(id) === fn) leaveHooks.delete(id)
  }
}
function leaveCurrent(except: string) {
  const p = useItems.getState().popup
  if (p && p.id !== except) leaveHooks.get(p.id)?.()
}

/** Keeps the tray to its limit: the oldest minimized notes are closed (saved first, an empty new note removed). */
function trim(min: string[]): string[] {
  const out = [...min]
  while (out.length > MAX_MINIMIZED) {
    const old = out.shift()
    if (old) leaveHooks.get(old)?.()
  }
  return out
}

export const openNote = (id: string) => {
  if (useItems.getState().minimized.includes(id)) return restoreNote(id)
  leaveCurrent(id)
  useItems.setState({ popup: { kind: 'note', id }, list: null })
}
export const openTask = (id: string) => {
  leaveCurrent(id)
  useItems.setState({ popup: { kind: 'task', id }, list: null })
}

/** The open note becomes a chip in the tray. Its popup is only hidden: the text, the cursor, the scroll, the size and the autosave go on. */
export function minimizeNote(id: string) {
  const s = useItems.getState()
  const min = trim([...s.minimized.filter((x) => x !== id), id])
  useItems.setState({ popup: s.popup?.id === id ? null : s.popup, minimized: min, list: null })
}

/** A chip is opened again, exactly as it was. The note that was open (if any) takes its place in the tray, saved and still alive. */
export function restoreNote(id: string) {
  const s = useItems.getState()
  const cur = s.popup
  const min = s.minimized.filter((x) => x !== id)
  if (cur && cur.id !== id) {
    if (cur.kind === 'note') min.push(cur.id)
    else leaveHooks.get(cur.id)?.()
  }
  useItems.setState({ popup: { kind: 'note', id }, minimized: trim(min), list: null })
}

/** A note is closed for good (the chip's close icon, a note that was deleted elsewhere): saved first, an empty new note removed. */
export function closeNote(id: string, settleFirst = true) {
  if (settleFirst) leaveHooks.get(id)?.()
  const s = useItems.getState()
  useItems.setState({ popup: s.popup?.id === id ? null : s.popup, minimized: s.minimized.filter((x) => x !== id) })
}

/** The map is closing: every open or minimized note saves and an empty new one is removed, then they are all gone. */
export function closeAllItems() {
  for (const fn of [...leaveHooks.values()]) fn()
  useItems.setState({ popup: null, minimized: [], list: null })
}

/** Closes the open popup (the note or task is saved by the popup before it calls this). */
export const closePopup = () => useItems.setState({ popup: null })
