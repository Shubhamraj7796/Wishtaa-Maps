import { Autosaver, LocalMapStorage } from '@/core/autosave'
import { ensureRoot, snapshotObjects, snapshotTopics } from '@/core/model/doc'
import { OBJECT_COLLECTION } from '@/core/model/objects'
import { snapshotSettings } from '@/core/settings'
import { encodeDoc, loadInto } from '@/core/persistence'
import { noteAttachmentStep, scanAttachments, sweepAttachments } from './attachments'
import { imagesIdle, noteUndoStep, scheduleImageGc, sweepUnusedImages } from './images'
import { mapDoc } from './mapdoc'
import { useEditor } from './store'

export { mapDoc }
export const GUEST_KEY = 'wishtaamaps:guest:v1'

let autosaver: Autosaver | null = null

/** Retries a failed save right away (the "Not saved - retry" button). */
export function retrySave() {
  void autosaver?.retry()
}

/** Loads the guest map from this browser, mirrors the Yjs doc into the store and starts autosaving. */
export async function initSession() {
  const storage = new LocalMapStorage(GUEST_KEY)
  const saved = await storage.load()
  const loaded = saved ? loadInto(mapDoc, saved) : false
  if (saved && !loaded) {
    // Keep the unreadable data around instead of silently overwriting it.
    try {
      localStorage.setItem(`${GUEST_KEY}:corrupt`, saved)
    } catch {
      /* ignore */
    }
  }
  const rootId = ensureRoot(mapDoc)
  useEditor.setState({
    topics: snapshotTopics(mapDoc),
    rootId,
    selected: [rootId],
    title: mapDoc.meta.get('title') ?? 'Untitled map',
    settings: snapshotSettings(mapDoc),
    objects: snapshotObjects(mapDoc),
  })

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
  mapDoc.meta.observe(() => useEditor.setState({ title: mapDoc.meta.get('title') ?? 'Untitled map' }))
  mapDoc.settings.observe(() => useEditor.setState({ settings: snapshotSettings(mapDoc) }))
  const syncObjects = () => {
    const objects = snapshotObjects(mapDoc)
    const st = useEditor.getState()
    const sel = st.selectedObject
    const gone = sel && !objects[OBJECT_COLLECTION[sel.kind]][sel.id]
    useEditor.setState({ objects, ...(gone ? { selectedObject: null, editingObject: null } : {}) })
  }
  for (const m of [mapDoc.relationships, mapDoc.callouts, mapDoc.boundaries, mapDoc.summaries]) m.observe(syncObjects)

  const syncUndo = () =>
    useEditor.setState({ canUndo: mapDoc.undo.undoStack.length > 0, canRedo: mapDoc.undo.redoStack.length > 0 })
  mapDoc.undo.on('stack-item-added', () => {
    noteUndoStep()
    noteAttachmentStep()
    syncUndo()
  })
  mapDoc.undo.on('stack-item-popped', syncUndo)
  mapDoc.undo.on('stack-cleared', syncUndo)

  const saver = new Autosaver({
    storage,
    serialize: () => encodeDoc(mapDoc),
    // Image blobs must reach storage before the map that references them.
    beforeSave: imagesIdle,
    onChange: (save) => {
      useEditor.setState({ save })
      if (save.status === 'saved') {
        scheduleImageGc()
        void scanAttachments()
      }
    },
  })
  autosaver = saver

  // Every change to the document (edits, undo/redo, images, title) is saved; loading is not.
  mapDoc.ydoc.on('update', (_update: Uint8Array, origin: unknown) => {
    if (origin !== 'load') saver.markDirty()
  })
  if (!saved) saver.markDirty() // first visit: persist the new central topic

  // Never leave an edit behind.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saver.flush()
  })
  window.addEventListener('blur', () => void saver.flush())
  window.addEventListener('pagehide', () => void saver.prepareForUnload())
  window.addEventListener('beforeunload', (e) => {
    if (!saver.prepareForUnload()) {
      e.preventDefault()
      e.returnValue = ''
    }
  })

  if (loaded) {
    void sweepUnusedImages()
    void sweepAttachments()
  }
}
