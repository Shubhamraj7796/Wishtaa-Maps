import { descendantsOf } from '../files/tree'
import { isReadableContent, saveMetaFromContent } from '../files/content'
import type { CreateInput, FileIndex, FilePatch, FileRecord, FileRepository, ListQuery, SaveMeta, SearchHit, SearchQuery } from '../files/types'
import type { DriveApi, DriveFileMeta } from './client'
import { driveLog } from './debug'
import { DriveConflictError, DriveError } from './errors'
import { driveFileName, nameFromDrive, packFile, restoreBlobs, unpackFile, type BlobStores } from './format'
import { baseOf, classify, describeWriter, markerProps, type Marker } from './sync'

export interface DriveConflict {
  fileId: string
  /** What Drive has now. */
  remote: DriveFileMeta
}

export type ConflictChoice = 'mine' | 'drive' | 'copy'

export interface DriveRepositoryOptions {
  /** Pictures and attachments, packed into files sent to Drive and restored from files received. */
  blobs?: () => BlobStores | undefined
  /** Remembers which files have changes not yet sent to Drive (survives a reload). */
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  /** This tab's writer identity (made fresh per page load). Tests set it to act as different tabs. */
  sessionId?: string
  /** The address the app runs at (shown to the person when another address wrote the file). */
  writerOrigin?: string
}

const DIRTY_KEY = 'wishtaamaps:drive-unsynced'
/** The Drive property that carries a file's "open in Read mode by default" protection. */
export const READ_ONLY_PROP = 'wishtaaReadOnly'

/**
 * The per-file queue of remote work, shared by every repository in this page (a second instance can exist after a hot
 * reload), so no two of them can interleave "check Drive, upload, store the new base" for the same file.
 */
const chains = new Map<string, Promise<unknown>>()

/**
 * Wraps the local file repository. Files stored in Google Drive keep a local copy (so editing is instant and works
 * offline) and every save is sent to Drive. Everything else behaves exactly like the local repository.
 *
 * A file's Drive state is `driveMeta` (the version we last saw). Before each upload the version in Drive is checked:
 * if it moved, someone changed the file elsewhere, and the user chooses which version to keep.
 */
export class DriveRepository implements FileRepository {
  private conflictMap = new Map<string, DriveConflict>()
  private conflictList: DriveConflict[] = []
  private syncListeners = new Set<() => void>()
  private unsynced: Set<string>
  /** Who this tab is, as a writer: stamped on every file it writes so its own writes are recognised by identity. */
  readonly session: string
  readonly origin: string | undefined
  private counter = 0

  constructor(
    private local: FileRepository,
    private api: DriveApi,
    private opts: DriveRepositoryOptions = {}
  ) {
    this.unsynced = new Set(this.readUnsynced())
    this.session = opts.sessionId ?? newSessionId()
    this.origin = opts.writerOrigin ?? (typeof location !== 'undefined' ? location.host : undefined)
  }

  /** The marker for the next write: this tab's session and a counter that only goes up. */
  private nextMarker(): Marker {
    return { session: this.session, counter: ++this.counter, ...(this.origin ? { origin: this.origin } : {}) }
  }

  // ---- unsynced bookkeeping ------------------------------------------------------------------------------

  private readUnsynced(): string[] {
    try {
      const raw = this.opts.storage?.getItem(DIRTY_KEY)
      const v: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  }

  private writeUnsynced() {
    try {
      this.opts.storage?.setItem(DIRTY_KEY, JSON.stringify([...this.unsynced]))
    } catch {
      /* ignore */
    }
  }

  private markUnsynced(id: string, on: boolean) {
    if (on === this.unsynced.has(id)) return
    if (on) this.unsynced.add(id)
    else this.unsynced.delete(id)
    this.writeUnsynced()
  }

  /**
   * True when Drive says the signed-in person may not edit this file (it was shared with them to view). Asked of Drive; false
   * when Drive can't be reached, so a file never gets locked out by a bad connection.
   */
  async isViewOnly(id: string): Promise<boolean> {
    const f = await this.local.get(id)
    if (!this.isDrive(f) || !this.api.available()) return false
    try {
      return (await this.api.meta(f.contentRef)).capabilities?.canEdit === false
    } catch {
      return false
    }
  }

  /**
   * Read mode's way of picking up what changed in Drive: quiet and safe. If Drive holds newer content and nothing here is
   * waiting to be sent, the local copy is replaced; nothing is ever written to Drive and no conflict is raised.
   * Resolves 'updated' (the caller should reload the open map), 'same', or 'skipped' (unsynced edits here, or Drive can't be reached).
   */
  async refresh(id: string): Promise<'updated' | 'same' | 'skipped'> {
    const f = await this.local.get(id)
    if (!this.isDrive(f) || !this.api.available()) return 'skipped'
    try {
      return await this.lock(id, async () => {
        const remote = await this.api.meta(f.contentRef)
        if (remote.trashed) return 'skipped'
        await this.adoptProtection(f, remote)
        if (classify(f.driveMeta, remote) !== 'external') return 'same'
        if (this.unsynced.has(id)) return 'skipped' // edits made here are not sent yet: leave them for Edit mode to sort out
        await this.pull(f, remote)
        return 'updated'
      })
    } catch {
      return 'skipped'
    }
  }

  /** True while the file has changes that have not reached Drive. */
  hasUnsynced(id: string) {
    return this.unsynced.has(id)
  }

  // ---- conflicts -----------------------------------------------------------------------------------------

  /** The same array until a conflict appears or is settled, so screens can subscribe to it cheaply. */
  conflicts = (): DriveConflict[] => this.conflictList

  /** An arrow function so it can be handed straight to React's useSyncExternalStore. */
  subscribeSync = (fn: () => void): (() => void) => {
    this.syncListeners.add(fn)
    return () => void this.syncListeners.delete(fn)
  }

  private emitSync() {
    this.conflictList = [...this.conflictMap.values()]
    this.syncListeners.forEach((l) => l())
  }

  private setConflict(fileId: string, remote: DriveFileMeta) {
    this.conflictMap.set(fileId, { fileId, remote })
    this.emitSync()
  }

  private clearConflict(fileId: string) {
    if (this.conflictMap.delete(fileId)) this.emitSync()
  }

  // ---- helpers -------------------------------------------------------------------------------------------

  /** Runs remote work for one file one at a time, so a rename and a save never trip over each other. */
  private lock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const prev = chains.get(id) ?? Promise.resolve()
    const guarded = () => this.acrossTabs(id, work)
    const run: Promise<T> = prev.then(guarded, guarded)
    const tail = run.catch(() => undefined)
    chains.set(id, tail)
    void tail.then(() => {
      if (chains.get(id) === tail) chains.delete(id)
    })
    return run
  }

  /**
   * Also takes a browser-wide lock for the file (Web Locks), so two tabs of this browser can't interleave "check Drive,
   * upload, store the new base": whichever comes second checks against the base the first one just stored.
   */
  private acrossTabs<T>(id: string, work: () => Promise<T>): Promise<T> {
    const locks = typeof navigator !== 'undefined' ? ((navigator as unknown as { locks?: WebLocks }).locks ?? undefined) : undefined
    return locks ? locks.request<T>(`wishtaamaps-drive-${id}`, work) : work()
  }

  /** A file protected in Drive (on another device) is protected here too. Turning protection off is always a deliberate act. */
  private async adoptProtection(f: FileRecord, remote: DriveFileMeta) {
    if (remote.appProperties?.[READ_ONLY_PROP] === '1' && !f.readOnlyDefault) await this.local.update(f.id, { readOnlyDefault: true })
  }

  /** True when what Drive holds is byte-for-byte what we hold, so there is nothing to choose between. */
  private async sameContent(f: FileRecord & { contentRef: string }): Promise<boolean> {
    try {
      const mine = await this.local.loadContent(f.id)
      if (!mine) return false
      const theirs = unpackFile(await this.api.download(f.contentRef)).content
      return mine.length === theirs.length && mine.every((b, i) => b === theirs[i])
    } catch {
      return false
    }
  }

  private isDrive(f: FileRecord | null | undefined): f is FileRecord & { contentRef: string } {
    return !!f && f.type !== 'folder' && f.storage === 'drive' && !!f.contentRef
  }

  private async pack(f: FileRecord, content: Uint8Array): Promise<string> {
    return packFile(
      { type: f.type === 'kb' ? 'kb' : 'map', name: f.name, createdAt: f.createdAt, modifiedAt: f.modifiedAt, content, imageIds: f.imageIds, attachmentIds: f.attachmentIds },
      this.opts.blobs?.()
    )
  }

  /** Brings Drive's copy into the local cache and records the version we now have. */
  private async pull(f: FileRecord & { contentRef: string }, remote: DriveFileMeta): Promise<Uint8Array> {
    const un = unpackFile(await this.api.download(f.contentRef))
    if (!isReadableContent(un.content)) throw new DriveError('other', 'The copy in Google Drive could not be read.')
    await restoreBlobs(un, this.opts.blobs?.())
    await this.local.saveContent(f.id, un.content, saveMetaFromContent(f.id, un.content))
    await this.local.update(f.id, { driveMeta: baseOf(remote) })
    driveLog('pulled', { file: f.name, stored: baseOf(remote) })
    this.markUnsynced(f.id, false)
    return un.content
  }

  // ---- uploading -----------------------------------------------------------------------------------------

  /** Sends the local copy to Drive. Throws if Drive can't be reached, or if the file's content changed there (a conflict). */
  private push(id: string): Promise<void> {
    return this.lock(id, () => this.pushLocked(id))
  }

  /**
   * The upload itself. Must run inside `lock(id)`, which serializes everything that writes this file's record or its Drive
   * copy: a save never starts before the previous one has stored its new base.
   */
  private async pushLocked(id: string): Promise<void> {
    const f = await this.local.get(id) // fresh: the record is the single source of the base (shared by tabs of this browser)
    if (!this.isDrive(f)) return
    let remote: DriveFileMeta
    try {
      remote = await this.api.meta(f.contentRef) // always fetched anew, also on a retry
    } catch (e) {
      driveLog('check-failed', { file: f.name, error: e instanceof Error ? e.message : String(e) })
      if (e instanceof DriveError && e.kind === 'notfound') {
        throw new DriveError('notfound', 'This file is no longer in Google Drive. Move it to Drive again to keep syncing, or keep it in this browser.')
      }
      throw e
    }
    if (remote.trashed) throw new DriveError('notfound', 'This file was moved to the Google Drive bin. Restore it there, or keep it in this browser.')
    const state = classify(f.driveMeta, remote)
    const external = state === 'external'
    driveLog('check', {
      file: f.name,
      base: f.driveMeta ?? null,
      fresh: { version: remote.version, modifiedTime: remote.modifiedTime, md5: remote.md5Checksum, rev: remote.headRevisionId },
      writer: remote.appProperties ?? null,
      versionDiffers: !!f.driveMeta && f.driveMeta.version !== remote.version,
      state,
    })
    if (external) {
      if (await this.sameContent(f)) {
        // Another writer, but the content is identical to ours: nothing to choose, adopt Drive's revision.
        await this.local.update(id, { driveMeta: baseOf(remote) })
        driveLog('adopted-identical', { file: f.name, stored: baseOf(remote) })
        this.markUnsynced(id, false)
        this.clearConflict(id)
        return
      }
      this.setConflict(id, remote)
      throw new DriveConflictError(`This file was changed in Google Drive. ${describeWriter(remote, { session: this.session, origin: this.origin })} Choose which version to keep.`)
    }
    // Not a real change (our own write, or Drive's housekeeping): a conflict raised earlier from a stale check is void.
    this.clearConflict(id)
    const content = await this.local.loadContent(id)
    if (!content) return
    const marker = this.nextMarker()
    const out = await this.api.update(f.contentRef, { name: driveFileName(f.name), body: await this.pack(f, content), appProperties: markerProps(marker) })
    // The new base (revision and our marker) is stored before this save counts as finished, so the next one compares against it.
    await this.local.update(id, { driveMeta: baseOf(out, marker) })
    driveLog('saved', { file: f.name, stored: baseOf(out, marker) })
    this.markUnsynced(id, false)
  }

  // ---- FileRepository: delegated ------------------------------------------------------------------------

  list(query?: ListQuery) {
    return this.local.list(query)
  }
  get(id: string) {
    return this.local.get(id)
  }
  create(input: CreateInput) {
    return this.local.create(input)
  }
  move(id: string, parentId: string | null) {
    return this.local.move(id, parentId)
  }
  duplicate(id: string) {
    return this.local.duplicate(id)
  }
  trash(id: string) {
    return this.local.trash(id)
  }
  restore(id: string) {
    return this.local.restore(id)
  }
  search(query: SearchQuery): Promise<SearchHit[]> {
    return this.local.search(query)
  }
  getIndex(id: string): Promise<FileIndex | null> {
    return this.local.getIndex(id)
  }
  allIndexes() {
    return this.local.allIndexes()
  }
  referencedImageIds() {
    return this.local.referencedImageIds()
  }
  referencedAttachmentIds() {
    return this.local.referencedAttachmentIds()
  }
  subscribe(listener: () => void) {
    return this.local.subscribe(listener)
  }

  // ---- FileRepository: Drive-aware ----------------------------------------------------------------------

  async update(id: string, patch: FilePatch): Promise<FileRecord> {
    const cur = await this.local.get(id)
    if (!this.isDrive(cur)) return this.local.update(id, patch)
    // Writing the record while a save is storing its new base could overwrite that base with an older one.
    if (patch.readOnlyDefault !== undefined) {
      // The protection follows the file in Drive, so Drive must be reachable to change it.
      if (!this.api.available()) throw new DriveError('auth', 'Reconnect Google Drive to change this setting for a file stored there.')
      await this.api.setAppProperties(cur.contentRef, { [READ_ONLY_PROP]: patch.readOnlyDefault ? '1' : null })
    }
    const rec = await this.lock(id, () => this.local.update(id, patch))
    if (patch.name !== undefined) {
      // The new name goes to Drive with the next save (and now, if possible).
      this.markUnsynced(id, true)
      void this.push(id).catch(() => undefined)
    }
    return rec
  }

  /**
   * Opens a file's content. For Drive files, a newer version made elsewhere is fetched first (if we are connected and
   * have nothing unsynced); otherwise the local copy is used, so opening never waits on or fails because of Drive.
   */
  async loadContent(id: string): Promise<Uint8Array | null> {
    const f = await this.local.get(id)
    if (!this.isDrive(f) || !this.api.available()) return this.local.loadContent(id)
    try {
      return await this.lock(id, async () => {
        const remote = await this.api.meta(f.contentRef)
        if (remote.trashed) return this.local.loadContent(id)
        await this.adoptProtection(f, remote)
        const state = classify(f.driveMeta, remote)
        if (state !== 'external') return this.local.loadContent(id)
        if (this.unsynced.has(id)) {
          if (await this.sameContent(f)) {
            await this.local.update(id, { driveMeta: baseOf(remote) }) // identical: nothing to choose, adopt silently
            this.markUnsynced(id, false)
            this.clearConflict(id)
            return this.local.loadContent(id)
          }
          this.setConflict(id, remote)
          return this.local.loadContent(id)
        }
        return this.pull(f, remote)
      })
    } catch {
      return this.local.loadContent(id)
    }
  }

  /**
   * Saves locally first (so nothing is lost), then sends to Drive, as ONE serialized step per file. A Drive failure is
   * thrown so the status shows it; the local copy is already safe.
   */
  async saveContent(id: string, data: Uint8Array, meta?: SaveMeta): Promise<FileRecord> {
    const cur = await this.local.get(id)
    if (!this.isDrive(cur)) return this.local.saveContent(id, data, meta)
    return this.lock(id, async () => {
      const rec = await this.local.saveContent(id, data, meta)
      this.markUnsynced(id, true)
      await this.pushLocked(id)
      return (await this.local.get(id)) ?? rec
    })
  }

  async remove(id: string): Promise<void> {
    await this.trashRemote(await this.driveFilesUnder([id]))
    return this.local.remove(id)
  }

  async emptyTrash(): Promise<void> {
    const binned = await this.local.list({ parentId: 'any', trashed: true })
    await this.trashRemote(binned.filter((f) => this.isDrive(f)))
    return this.local.emptyTrash()
  }

  private async driveFilesUnder(ids: string[]): Promise<FileRecord[]> {
    const all = [...(await this.local.list({ parentId: 'any' })), ...(await this.local.list({ parentId: 'any', trashed: true }))]
    const out = new Map<string, FileRecord>()
    for (const id of ids) {
      const f = all.find((x) => x.id === id)
      if (!f) continue
      for (const g of [f, ...descendantsOf(all, id)]) if (this.isDrive(g)) out.set(g.id, g)
    }
    return [...out.values()]
  }

  /** Deleting forever sends the Drive copy to Drive's own bin, where it can still be recovered. Best effort. */
  private async trashRemote(files: FileRecord[]) {
    for (const f of files) {
      this.markUnsynced(f.id, false)
      this.clearConflict(f.id)
      if (!this.api.available() || !f.contentRef) continue
      try {
        await this.api.trash(f.contentRef)
      } catch {
        /* the local file is gone either way; a leftover in Drive is harmless */
      }
    }
  }

  // ---- Drive-specific features ---------------------------------------------------------------------------

  /** A real folder in Drive, inside `parentFolderId` (the Wishtaa Maps folder when not given). */
  async createDriveFolder(name: string, parentFolderId?: string): Promise<DriveFileMeta> {
    return this.api.createFolder(name, parentFolderId ?? (await this.api.ensureAppFolder()))
  }

  /** Stores an existing local file in Drive from now on, in `parentFolderId` (the Wishtaa Maps folder when not given). */
  async moveToDrive(id: string, parentFolderId?: string): Promise<FileRecord> {
    const f = await this.local.get(id)
    if (!f || f.type === 'folder') throw new DriveError('other', 'Only maps and knowledge bases can be stored in Google Drive.')
    if (this.isDrive(f)) return f
    const content = await this.local.loadContent(id)
    if (!content) throw new DriveError('other', 'This file has no content to save yet.')
    const parentId = parentFolderId ?? (await this.api.ensureAppFolder())
    const marker = this.nextMarker()
    const made = await this.api.create({ name: driveFileName(f.name), parentId, body: await this.pack(f, content), appProperties: { ...markerProps(marker), ...(f.readOnlyDefault ? { [READ_ONLY_PROP]: '1' } : {}) } })
    driveLog('moved-to-drive', { file: f.name, stored: baseOf(made, marker) })
    return this.local.update(id, { storage: 'drive', contentRef: made.id, driveMeta: baseOf(made, marker) })
  }

  /**
   * Moves a file out of Drive into this browser: the latest version is brought here, the Drive copy goes to Drive's bin
   * (recoverable there), and from now on the file lives only in this browser. Nothing changes if Drive can't be reached.
   */
  async moveToLocal(id: string): Promise<FileRecord> {
    const f = await this.local.get(id)
    if (!f) throw new DriveError('notfound', 'That file no longer exists.')
    if (!this.isDrive(f)) return f
    if (!this.api.available()) throw new DriveError('auth', 'Reconnect Google Drive first, so the copy there can be moved to the Drive bin.')
    if (this.conflictMap.has(id)) throw new DriveConflictError('Choose which version to keep before moving this file out of Google Drive.')
    await this.loadContent(id) // brings in a newer version made elsewhere, or flags a conflict
    if (this.conflictMap.has(id)) throw new DriveConflictError('Choose which version to keep before moving this file out of Google Drive.')
    try {
      await this.api.trash(f.contentRef)
    } catch (e) {
      if (!(e instanceof DriveError && e.kind === 'notfound')) throw e // already gone from Drive: nothing to remove
    }
    this.markUnsynced(id, false)
    return this.local.update(id, { storage: 'local', contentRef: id, driveMeta: null })
  }

  /** Stops syncing: the file stays here, in this browser, and the Drive copy is left untouched. */
  async keepLocal(id: string): Promise<FileRecord> {
    this.markUnsynced(id, false)
    this.clearConflict(id)
    return this.local.update(id, { storage: 'local', contentRef: id, driveMeta: null })
  }

  /** Opens a file that is already in Drive (chosen with Picker or from the Drive browser). Reuses the local file if linked. */
  async openFromDrive(driveFileId: string): Promise<FileRecord> {
    const existing = (await this.local.list({ parentId: 'any' })).find((f) => f.storage === 'drive' && f.contentRef === driveFileId)
    if (existing) {
      await this.loadContent(existing.id) // picks up a newer version if there is one
      return (await this.local.get(existing.id)) ?? existing
    }
    const remote = await this.api.meta(driveFileId)
    if (remote.trashed) throw new DriveError('notfound', 'That file is in the Google Drive bin.')
    const un = unpackFile(await this.api.download(driveFileId))
    if (!isReadableContent(un.content)) throw new DriveError('other', 'That file could not be read.')
    await restoreBlobs(un, this.opts.blobs?.())
    const rec = await this.local.create({ type: un.type, name: un.name || nameFromDrive(remote.name), content: un.content, storage: 'drive' })
    await this.local.saveContent(rec.id, un.content, saveMetaFromContent(rec.id, un.content))
    return this.local.update(rec.id, { contentRef: driveFileId, driveMeta: baseOf(remote), ...(remote.appProperties?.[READ_ONLY_PROP] === '1' ? { readOnlyDefault: true } : {}) })
  }

  /** What is in a folder of the app's Drive area (the "Wishtaa Maps" folder when none is given). */
  async browse(folderId?: string): Promise<{ folderId: string; items: DriveFileMeta[] }> {
    const id = folderId ?? (await this.api.ensureAppFolder())
    return { folderId: id, items: await this.api.list(id) }
  }

  /** After connecting: fetch newer versions of Drive files, and flag any that changed on both sides. */
  async syncAll(): Promise<void> {
    if (!this.api.available()) return
    const files = (await this.local.list({ parentId: 'any' })).filter((f) => this.isDrive(f))
    for (const f of files) {
      try {
        if (this.unsynced.has(f.id)) await this.push(f.id)
        else await this.loadContent(f.id)
      } catch {
        /* a file that can't sync right now (offline, conflict) is handled when it is opened or saved */
      }
    }
  }

  /** Settles a conflict. 'mine' overwrites Drive, 'drive' replaces the local copy, 'copy' keeps mine as a new file and then takes Drive's. */
  async resolveConflict(id: string, choice: ConflictChoice): Promise<FileRecord | null> {
    const c = this.conflictMap.get(id)
    const f = await this.local.get(id)
    if (!c || !this.isDrive(f)) {
      this.clearConflict(id)
      return f
    }
    return this.lock(id, async () => {
      if (choice === 'mine') {
        const content = await this.local.loadContent(id)
        if (content) {
          const marker = this.nextMarker()
          const out = await this.api.update(f.contentRef, { name: driveFileName(f.name), body: await this.pack(f, content), appProperties: markerProps(marker) })
          await this.local.update(id, { driveMeta: baseOf(out, marker) })
          driveLog('kept-mine', { file: f.name, stored: baseOf(out, marker) })
        }
        this.markUnsynced(id, false)
      } else {
        if (choice === 'copy') {
          const content = await this.local.loadContent(id)
          if (content) {
            const copy = await this.local.create({ type: f.type, name: `${f.name} (my copy)`.slice(0, 120), parentId: f.parentId, content })
            await this.local.saveContent(copy.id, content, saveMetaFromContent(copy.id, content))
          }
        }
        const remote = await this.api.meta(f.contentRef)
        await this.pull(f, remote)
      }
      this.clearConflict(id)
      return this.local.get(id)
    })
  }
}

function newSessionId(): string {
  try {
    return globalThis.crypto.randomUUID()
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  }
}

interface WebLocks {
  request<R>(name: string, callback: () => Promise<R>): Promise<R>
}
