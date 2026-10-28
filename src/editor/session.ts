import * as Y from 'yjs'
import { Autosaver, type MapStorage } from '@/core/autosave'
import { buildFileIndex, referencedIds } from '@/core/files/indexer'
import { makeThumbnail } from '@/core/files/thumbnail'
import type { FileRecord, FileRepository, SaveMeta } from '@/core/files/types'
import { buildScene } from '@/core/layout/engine'
import { ensureRoot, snapshotObjects, snapshotTopics } from '@/core/model/doc'
import { OBJECT_COLLECTION } from '@/core/model/objects'
import { encodeDoc, fromBase64 } from '@/core/persistence'
import { snapshotSettings } from '@/core/settings'
import type { TopicData } from '@/core/model/topic'
import { repository } from '../app/repo'
import { noteAttachmentStep, scanAttachments } from './attachments'
import { imagesIdle, noteUndoStep, scheduleImageGc } from './images'
import { mapDoc, resetMapDoc } from './mapdoc'
import { getTheme } from './scene'
import { useEditor } from './store'

export { mapDoc }

const pendingKey = (fileId: string) => `wishtaamaps:pending:${fileId}`
export const LAST_OPEN_KEY = 'wishtaamaps:last-open'

/** What is stored alongside a map each time it is saved: picture, search index, counters. */
export function buildSaveMeta(fileId: string): SaveMeta {
  const { topics, rootId, settings } = useEditor.getState()
  const { imageIds, attachmentIds } = referencedIds(topics)
  let thumbnail: string | null = null
  try {
    const scene = buildScene(topics, { rootId, maxDepth: null, focusId: null, reveal: new Set(), layout: settings.layout, spacing: settings.spacing })
    thumbnail = makeThumbnail(scene, getTheme(settings))
  } catch {
    /* a thumbnail is a nicety; never block saving on it */
  }
  return { thumbnail, imageIds, attachmentIds, topicCount: Object.keys(topics).length, index: buildFileIndex(fileId, topics) }
}

/**
 * Saves a map into the file repository. While the page is closing, async storage can't finish, so the latest
 * state is also kept in a small synchronous "pending" copy that is recovered the next time the file opens.
 */
export class RepoMapStorage implements MapStorage {
  constructor(
    private fileId: string,
    private repo: FileRepository,
    private meta: () => SaveMeta = () => buildSaveMeta(fileId)
  ) {}

  async load() {
    return null
  }

  async save(data: string) {
    await this.repo.saveContent(this.fileId, fromBase64(data), this.meta())
    try {
      localStorage.removeItem(pendingKey(this.fileId))
    } catch {
      /* ignore */
    }
  }

  saveSync(data: string) {
    localStorage.setItem(pendingKey(this.fileId), data)
  }
}

interface Open {
  fileId: string
  autosaver: Autosaver
  dispose: () => void
}
let open: Open | null = null
let listenersInstalled = false

export const currentFileId = () => open?.fileId ?? null

/** Retries a failed save right away (the "Not saved - retry" button). */
export function retrySave() {
  void open?.autosaver.retry()
}

function installPageListeners() {
  if (listenersInstalled) return
  listenersInstalled = true
  // Never leave an edit behind.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void open?.autosaver.flush()
  })
  window.addEventListener('blur', () => void open?.autosaver.flush())
  // Back online: send whatever could not be saved while offline.
  window.addEventListener('online', () => {
    if (open?.autosaver.hasUnsaved) void open.autosaver.retry()
  })
  window.addEventListener('pagehide', () => void open?.autosaver.prepareForUnload())
  window.addEventListener('beforeunload', (e) => {
    if (open && !open.autosaver.prepareForUnload()) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}

/** The file the screen currently wants open (null when none). Lets a close that is immediately followed by a reopen cancel out. */
let wanted: string | null = null
let queue: Promise<unknown> = Promise.resolve()
/** Opens and closes run one at a time, in the order they were asked for. */
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work)
  queue = run.catch(() => undefined)
  return run
}

async function closeCurrent(flush = true): Promise<void> {
  const o = open
  if (!o) return
  open = null
  try {
    if (flush) await o.autosaver.flush()
  } finally {
    o.dispose()
    useEditor.setState({ fileId: null, fileType: null })
  }
}

/**
 * Writes any change not yet saved and stops watching the open file. If the same file is asked for again before this
 * runs (React mounts effects twice in development), it stays open.
 */
export function closeFile(): Promise<void> {
  wanted = null
  return enqueue(async () => {
    if (wanted !== null && wanted === open?.fileId) return
    await closeCurrent()
  })
}

/**
 * Opens a file in the editor: loads its content (or a copy recovered after a crash), shows it, and starts
 * autosaving back to the same file. Returns null if it doesn't exist or is in the bin.
 */
export function openFile(fileId: string, repo: FileRepository = repository): Promise<FileRecord | null> {
  wanted = fileId
  return enqueue(() => doOpen(fileId, repo))
}

/**
 * Re-reads the open file from the repository, throwing away what the editor holds (used after the file's content was
 * replaced from outside, such as keeping Google Drive's version in a conflict).
 */
export function reopenFile(fileId: string, repo: FileRepository = repository): Promise<FileRecord | null> {
  wanted = fileId
  return enqueue(async () => {
    await closeCurrent(false)
    try {
      localStorage.removeItem(pendingKey(fileId))
    } catch {
      /* ignore */
    }
    return doOpen(fileId, repo)
  })
}

async function doOpen(fileId: string, repo: FileRepository): Promise<FileRecord | null> {
  if (open?.fileId === fileId) return repo.get(fileId)
  await closeCurrent()
  const file = await repo.get(fileId)
  if (!file || file.trashed || file.type === 'folder') return null

  let bytes = await repo.loadContent(fileId)
  let recovered = false
  try {
    const pending = localStorage.getItem(pendingKey(fileId))
    if (pending) {
      bytes = fromBase64(pending)
      recovered = true
    }
  } catch {
    /* ignore */
  }

  resetMapDoc()
  if (bytes) {
    try {
      Y.applyUpdate(mapDoc.ydoc, bytes, 'load')
    } catch {
      resetMapDoc() // unreadable content: start from an empty map rather than failing to open
    }
  }
  const rootId = ensureRoot(mapDoc)
  useEditor.setState({
    fileId,
    fileType: file.type === 'kb' ? 'kb' : 'map',
    topics: snapshotTopics(mapDoc),
    rootId,
    selected: [rootId],
    title: file.name,
    settings: snapshotSettings(mapDoc),
    objects: snapshotObjects(mapDoc),
    editingId: null,
    editingObject: null,
    selectedObject: null,
    imageSelected: null,
    relationFrom: null,
    linkFrom: null,
    view: 'map',
    levels: null,
    focusId: null,
    tagFilter: [],
    reveal: [],
    search: { open: false, query: '', matches: [], index: 0 },
    save: { status: 'saved', savedAt: null, error: null },
    canUndo: false,
    canRedo: false,
    painter: null,
  })

  const disposers: (() => void)[] = []
  const watch = <T extends { observe: (f: () => void) => void; unobserve: (f: () => void) => void }>(map: T, handler: () => void) => {
    map.observe(handler)
    disposers.push(() => map.unobserve(handler))
  }

  const onTopics = (e: Y.YMapEvent<TopicData>) => {
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
  }
  mapDoc.topics.observe(onTopics)
  disposers.push(() => mapDoc.topics.unobserve(onTopics))
  watch(mapDoc.settings, () => useEditor.setState({ settings: snapshotSettings(mapDoc) }))
  const syncObjects = () => {
    const objects = snapshotObjects(mapDoc)
    const sel = useEditor.getState().selectedObject
    const gone = sel && !objects[OBJECT_COLLECTION[sel.kind]][sel.id]
    useEditor.setState({ objects, ...(gone ? { selectedObject: null, editingObject: null } : {}) })
  }
  for (const m of [mapDoc.relationships, mapDoc.callouts, mapDoc.boundaries, mapDoc.summaries]) watch(m, syncObjects)

  const undo = mapDoc.undo
  const syncUndo = () => useEditor.setState({ canUndo: undo.undoStack.length > 0, canRedo: undo.redoStack.length > 0 })
  const onAdded = () => {
    noteUndoStep()
    noteAttachmentStep()
    syncUndo()
  }
  undo.on('stack-item-added', onAdded)
  undo.on('stack-item-popped', syncUndo)
  undo.on('stack-cleared', syncUndo)
  disposers.push(() => {
    undo.off('stack-item-added', onAdded)
    undo.off('stack-item-popped', syncUndo)
    undo.off('stack-cleared', syncUndo)
  })

  const saver = new Autosaver({
    storage: new RepoMapStorage(fileId, repo),
    serialize: () => encodeDoc(mapDoc),
    // Image blobs must reach storage before the map that references them.
    beforeSave: imagesIdle,
    onChange: (save) => {
      if (open?.fileId !== fileId && open !== null) return
      useEditor.setState({ save })
      if (save.status === 'saved') {
        scheduleImageGc()
        void scanAttachments()
      }
    },
  })
  // Every change to the document (edits, undo/redo, images, settings) is saved; loading is not.
  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin !== 'load') saver.markDirty()
  }
  mapDoc.ydoc.on('update', onUpdate)
  disposers.push(() => {
    mapDoc.ydoc.off('update', onUpdate)
    saver.dispose()
  })

  open = { fileId, autosaver: saver, dispose: () => disposers.forEach((d) => d()) }
  installPageListeners()
  try {
    localStorage.setItem(LAST_OPEN_KEY, fileId)
  } catch {
    /* ignore */
  }
  if (recovered) saver.markDirty() // put the recovered copy into the file
  return file
}

/** Renames the open file (the name shown in the header). */
export async function renameOpenFile(name: string, repo: FileRepository = repository) {
  const id = open?.fileId
  if (!id) return
  const updated = await repo.update(id, { name })
  useEditor.setState({ title: updated.name })
}
