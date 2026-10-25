import { createMapDoc, ensureRoot, snapshotTopics } from '@/core/model/doc'
import { encodeDoc, loadInto } from '@/core/persistence'
import { useEditor } from './store'

export const GUEST_KEY = 'wishtaamaps:guest:v1'
export const mapDoc = createMapDoc()

let timer: ReturnType<typeof setTimeout> | undefined
let dirty = false

function flush() {
  if (!dirty) return
  clearTimeout(timer)
  try {
    localStorage.setItem(GUEST_KEY, encodeDoc(mapDoc))
    dirty = false
    useEditor.setState({ saveState: 'saved' })
  } catch {
    useEditor.setState({ saveState: 'error' })
  }
}

/** Loads the guest map from this browser, mirrors the Yjs doc into the store and autosaves. */
export function initSession() {
  try {
    const saved = localStorage.getItem(GUEST_KEY)
    if (saved) loadInto(mapDoc, saved)
  } catch {
    /* storage blocked: start fresh */
  }
  const rootId = ensureRoot(mapDoc)
  useEditor.setState({ topics: snapshotTopics(mapDoc), rootId, selected: [rootId] })

  mapDoc.topics.observe((e) => {
    const st = useEditor.getState()
    const next = { ...st.topics }
    e.changes.keys.forEach((change, key) => {
      if (change.action === 'delete') delete next[key]
      else {
        const v = mapDoc.topics.get(key)
        if (v) next[key] = v
      }
    })
    const selected = st.selected.filter((id) => next[id])
    useEditor.setState({
      topics: next,
      selected: selected.length ? selected : next[st.rootId] ? [st.rootId] : [],
      editingId: st.editingId && next[st.editingId] ? st.editingId : null,
      focusId: st.focusId && next[st.focusId] ? st.focusId : null,
    })
  })

  const syncUndo = () =>
    useEditor.setState({ canUndo: mapDoc.undo.undoStack.length > 0, canRedo: mapDoc.undo.redoStack.length > 0 })
  mapDoc.undo.on('stack-item-added', syncUndo)
  mapDoc.undo.on('stack-item-popped', syncUndo)
  mapDoc.undo.on('stack-cleared', syncUndo)

  mapDoc.ydoc.on('update', () => {
    dirty = true
    useEditor.setState({ saveState: 'saving' })
    clearTimeout(timer)
    timer = setTimeout(flush, 400)
  })
  window.addEventListener('pagehide', flush)
  window.addEventListener('beforeunload', flush)
}
