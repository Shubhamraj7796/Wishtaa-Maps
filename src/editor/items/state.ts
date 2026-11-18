import { create } from 'zustand'

export type ListKind = 'notes' | 'tasks'

/** Which small list (the notes or tasks of one topic) is open, and which note or task has its popup open. UI state only, never saved. */
interface ItemsState {
  list: { kind: ListKind; topicId: string; anchor: HTMLElement } | null
  popup: { kind: 'note' | 'task'; id: string } | null
}

export const useItems = create<ItemsState>(() => ({ list: null, popup: null }))

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

export const openNote = (id: string) => {
  leaveCurrent(id)
  useItems.setState({ popup: { kind: 'note', id }, list: null })
}
export const openTask = (id: string) => {
  leaveCurrent(id)
  useItems.setState({ popup: { kind: 'task', id }, list: null })
}
export const closePopup = () => useItems.setState({ popup: null })
