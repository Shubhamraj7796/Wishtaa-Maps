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
export const openNote = (id: string) => useItems.setState({ popup: { kind: 'note', id }, list: null })
export const openTask = (id: string) => useItems.setState({ popup: { kind: 'task', id }, list: null })
export const closePopup = () => useItems.setState({ popup: null })
