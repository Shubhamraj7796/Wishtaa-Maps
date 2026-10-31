import type { DriveApi, DriveFileMeta } from './client'
import { DriveError } from './errors'

/**
 * Pictures live in a Drive folder next to their map, one file per picture (and one small thumbnail file), named after the
 * picture's content id. The map file holds only ids. This module uploads them (each at most once), keeps a persisted queue
 * that survives reloads, and fetches them back one at a time when they are needed.
 */

export type PictureKind = 'full' | 'thumb'

export interface UploadJob {
  key: string
  mapId: string
  folderId: string
  id: string
  kind: PictureKind
  attempts: number
  /** Not before this time (ms since 1970): the retry back-off. */
  nextAt: number
  error?: string
}

/** Remembers the queue and what is already in Drive, across reloads. */
export interface Ledger {
  jobs(): Promise<UploadJob[]>
  putJob(job: UploadJob): Promise<void>
  deleteJob(key: string): Promise<void>
  uploaded(folderId: string): Promise<Record<string, string>>
  markUploaded(folderId: string, name: string, fileId: string): Promise<void>
}

export class MemoryLedger implements Ledger {
  private j = new Map<string, UploadJob>()
  private u = new Map<string, Record<string, string>>()
  async jobs() {
    return [...this.j.values()].map((x) => ({ ...x }))
  }
  async putJob(job: UploadJob) {
    this.j.set(job.key, { ...job })
  }
  async deleteJob(key: string) {
    this.j.delete(key)
  }
  async uploaded(folderId: string) {
    return { ...(this.u.get(folderId) ?? {}) }
  }
  async markUploaded(folderId: string, name: string, fileId: string) {
    this.u.set(folderId, { ...(this.u.get(folderId) ?? {}), [name]: fileId })
  }
}

const wrap = <T,>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => ((req.onsuccess = () => resolve(req.result)), (req.onerror = () => reject(req.error))))

/** The same, in IndexedDB. */
export class IndexedDbLedger implements Ledger {
  private db: Promise<IDBDatabase> | null = null
  constructor(private name = 'wishtaa-maps-uploads') {}
  private open() {
    this.db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, 1)
      r.onupgradeneeded = () => {
        r.result.createObjectStore('jobs', { keyPath: 'key' })
        r.result.createObjectStore('uploaded', { keyPath: 'key' })
      }
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => {
        this.db = null
        reject(r.error)
      }
    })
    return this.db
  }
  private async store(name: string, mode: IDBTransactionMode) {
    return (await this.open()).transaction(name, mode).objectStore(name)
  }
  async jobs() {
    return (await wrap((await this.store('jobs', 'readonly')).getAll())) as UploadJob[]
  }
  async putJob(job: UploadJob) {
    await wrap((await this.store('jobs', 'readwrite')).put(job))
  }
  async deleteJob(key: string) {
    await wrap((await this.store('jobs', 'readwrite')).delete(key))
  }
  async uploaded(folderId: string) {
    const rows = (await wrap((await this.store('uploaded', 'readonly')).getAll())) as { key: string; folderId: string; name: string; fileId: string }[]
    const out: Record<string, string> = {}
    for (const r of rows) if (r.folderId === folderId) out[r.name] = r.fileId
    return out
  }
  async markUploaded(folderId: string, name: string, fileId: string) {
    await wrap((await this.store('uploaded', 'readwrite')).put({ key: `${folderId}|${name}`, folderId, name, fileId }))
  }
}

/** Where the bytes of a picture (or its thumbnail) come from. */
export interface PictureSource {
  read(id: string, kind: PictureKind): Promise<{ bytes: Uint8Array; type: string } | null>
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif' }
export const extFor = (type: string) => EXT[type] ?? 'bin'
export const fileNameFor = (id: string, kind: PictureKind, type: string) => (kind === 'thumb' ? `${id}.t.${extFor(type)}` : `${id}.${extFor(type)}`)
const isThumbName = (name: string) => /\.t\.[a-z0-9]+$/.test(name)

/** The id in a picture file name, and which kind it is. */
export function parsePictureName(name: string): { id: string; kind: PictureKind } | null {
  const m = /^(.+?)(\.t)?\.[a-z0-9]+$/.exec(name)
  return m ? { id: m[1] as string, kind: m[2] ? 'thumb' : 'full' } : null
}

export type SyncMode = 'auto' | 'manual'

export interface SyncOptions {
  /** 3 or 4 uploads at once. */
  concurrency?: number
  mode?: () => SyncMode
  /** True on a metered or data-saver connection, when the person asked to pause there. */
  holdBack?: () => boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

export interface SyncStatus {
  /** Files waiting (including those waiting to retry). */
  pending: number
  /** Pictures (not files) that still have something to send. */
  pictures: number
  /** Files being sent right now. */
  active: number
  /** Files sent since the page opened. */
  done: number
  /** Files that failed at least once and are waiting to retry. */
  retrying: number
  /** Pictures (full-size files) in the current batch: how many were queued and how many are done, for "120 of 500". */
  batchTotal: number
  batchDone: number
  /** Rough seconds left for the batch, once enough has been sent to tell; otherwise null. */
  etaSeconds: number | null
  paused: boolean
  mode: SyncMode
  bytesUploaded: number
  lastError: string | null
}

/** 2 s, 4 s, 8 s ... up to 5 minutes. */
export const backoffMs = (attempts: number) => Math.min(5 * 60_000, 1000 * 2 ** Math.max(1, attempts))

export class PictureSync {
  private index = new Map<string, Map<string, DriveFileMeta>>()
  private running: Promise<void> | null = null
  private batch = { total: 0, done: 0, startedAt: 0 }
  private paused = false
  private listeners = new Set<() => void>()
  private snap: SyncStatus = { pending: 0, pictures: 0, batchTotal: 0, batchDone: 0, etaSeconds: null, active: 0, done: 0, retrying: 0, paused: false, mode: 'auto', bytesUploaded: 0, lastError: null }
  private readonly concurrency: number
  private readonly now: () => number
  private readonly sleep: (ms: number) => Promise<void>

  constructor(
    private api: Pick<DriveApi, 'listFolder' | 'uploadBinary'>,
    private source: PictureSource,
    private ledger: Ledger,
    private opts: SyncOptions = {}
  ) {
    this.concurrency = opts.concurrency ?? 3
    this.now = opts.now ?? Date.now
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  }

  // ---- status ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  getStatus = (): SyncStatus => this.snap
  private set(patch: Partial<SyncStatus>) {
    this.snap = { ...this.snap, ...patch, mode: this.opts.mode?.() ?? 'auto', paused: this.paused }
    this.listeners.forEach((l) => l())
  }
  private async refreshCounts(active = this.snap.active) {
    const jobs = await this.ledger.jobs()
    const left = this.batch.total - this.batch.done
    const elapsed = (this.now() - this.batch.startedAt) / 1000
    const eta = this.batch.done >= 3 && left > 0 && elapsed > 0 ? Math.round((elapsed / this.batch.done) * left) : null
    this.set({ batchTotal: this.batch.total, batchDone: Math.min(this.batch.done, this.batch.total), etaSeconds: eta, pending: jobs.length, pictures: new Set(jobs.map((j) => j.id)).size, retrying: jobs.filter((j) => j.attempts > 0).length, active })
  }

  // ---- what is already in Drive ----
  /** The folder's files by name, asked of Drive once and then kept (and kept up to date by our own uploads). */
  async remoteIndex(folderId: string, refresh = false): Promise<Map<string, DriveFileMeta>> {
    const known = this.index.get(folderId)
    if (known && !refresh) return known
    const fresh = new Map<string, DriveFileMeta>()
    for (const f of await this.api.listFolder(folderId)) fresh.set(f.name, f)
    this.index.set(folderId, fresh)
    for (const [name, f] of fresh) await this.ledger.markUploaded(folderId, name, f.id)
    return fresh
  }

  private has(index: Map<string, DriveFileMeta>, ledgerNames: Record<string, string>, id: string, kind: PictureKind): boolean {
    const test = (name: string) => name.startsWith(`${id}.`) && isThumbName(name) === (kind === 'thumb')
    for (const name of index.keys()) if (test(name)) return true
    return Object.keys(ledgerNames).some(test)
  }

  /** True when the picture (or its thumbnail) is already in this folder in Drive. */
  async isUploaded(folderId: string, id: string, kind: PictureKind = 'full'): Promise<boolean> {
    return this.has(await this.remoteIndex(folderId), await this.ledger.uploaded(folderId), id, kind)
  }

  // ---- the queue ----
  /** Adds the pictures (and their thumbnails) that are not in Drive yet. Never queues one that is already there. */
  async enqueue(mapId: string, folderId: string, ids: readonly string[]): Promise<number> {
    const index = await this.remoteIndex(folderId)
    const ledgerNames = await this.ledger.uploaded(folderId)
    const queued = await this.ledger.jobs()
    if (!queued.length) this.batch = { total: 0, done: 0, startedAt: this.now() } // nothing was waiting: a new batch
    const existing = new Set(queued.map((j) => j.key))
    let added = 0
    let addedFull = 0
    for (const id of new Set(ids)) {
      for (const kind of ['full', 'thumb'] as const) {
        const key = `${folderId}|${id}|${kind}`
        if (existing.has(key) || this.has(index, ledgerNames, id, kind)) continue
        await this.ledger.putJob({ key, mapId, folderId, id, kind, attempts: 0, nextAt: 0 })
        added++
        if (kind === 'full') addedFull++
      }
    }
    this.batch.total += addedFull
    await this.refreshCounts()
    if (added && this.autoRuns()) void this.run().catch(() => undefined)
    return added
  }

  private autoRuns() {
    return !this.paused && (this.opts.mode?.() ?? 'auto') === 'auto' && !this.opts.holdBack?.()
  }

  pause() {
    this.paused = true
    this.set({})
  }
  resume() {
    this.paused = false
    this.set({})
    void this.run().catch(() => undefined)
  }

  /** "Sync now": runs the queue even in "only when I tap Sync" mode. */
  syncNow(): Promise<void> {
    this.paused = false
    return this.run({ force: true })
  }

  /** Picks the queue up again after a reload or a crash. */
  async resumeFromLedger(): Promise<void> {
    await this.refreshCounts()
    if (this.snap.pending && this.autoRuns()) void this.run().catch(() => undefined)
  }

  /**
   * Sends what is ready, up to `concurrency` at a time, and returns when nothing more can be done right now (everything sent, or the
   * rest is waiting to retry). A second call while one is running joins it.
   */
  run(o: { force?: boolean } = {}): Promise<void> {
    if (this.running) return this.running
    if (!o.force && !this.autoRuns()) return Promise.resolve()
    this.running = this.drain().finally(() => {
      this.running = null
    })
    return this.running
  }

  private async drain() {
    const inFlight = new Set<string>()
    // Choosing a job and marking it taken happen with no wait in between, so two workers never pick the same one.
    const claim = async (): Promise<UploadJob | null> => {
      const jobs = await this.ledger.jobs()
      const job = jobs.filter((j) => !inFlight.has(j.key) && j.nextAt <= this.now()).sort((a, b) => a.nextAt - b.nextAt)[0] ?? null
      if (job) inFlight.add(job.key)
      return job
    }
    const worker = async () => {
      for (;;) {
        if (this.paused) return
        const job = await claim()
        if (!job) return
        await this.refreshCounts(inFlight.size)
        try {
          await this.send(job)
        } finally {
          inFlight.delete(job.key)
          await this.refreshCounts(inFlight.size)
        }
      }
    }
    await Promise.all(Array.from({ length: this.concurrency }, () => worker()))
  }

  private async send(job: UploadJob) {
    try {
      const index = await this.remoteIndex(job.folderId)
      if (this.has(index, await this.ledger.uploaded(job.folderId), job.id, job.kind)) {
        await this.ledger.deleteJob(job.key) // already there (another device, or an earlier run): never send it again
        return
      }
      const data = await this.source.read(job.id, job.kind)
      if (!data) {
        await this.ledger.deleteJob(job.key) // nothing stored here to send (it was removed)
        return
      }
      const name = fileNameFor(job.id, job.kind, data.type)
      const made = await this.api.uploadBinary({ name, parentId: job.folderId, bytes: data.bytes, mimeType: data.type, appProperties: { pictureId: job.id, pictureKind: job.kind } })
      index.set(name, made)
      await this.ledger.markUploaded(job.folderId, name, made.id)
      await this.ledger.deleteJob(job.key)
      if (job.kind === 'full') this.batch.done++
      this.set({ done: this.snap.done + 1, bytesUploaded: this.snap.bytesUploaded + data.bytes.byteLength, lastError: null })
    } catch (e) {
      const err = e instanceof DriveError ? e : new DriveError('other', e instanceof Error ? e.message : 'Upload failed.')
      const attempts = job.attempts + 1
      await this.ledger.putJob({ ...job, attempts, nextAt: this.now() + backoffMs(attempts), error: err.message })
      this.set({ lastError: err.message })
      // Signed out, access removed or Drive full: more tries right now would only fail the same way.
      if (err.kind === 'auth' || err.kind === 'revoked' || err.kind === 'quota') this.paused = true
    }
  }

  /** Sends every one of these pictures and does not return until they are all in Drive (used before an old file is converted). */
  async uploadAll(mapId: string, folderId: string, ids: readonly string[]): Promise<void> {
    await this.enqueue(mapId, folderId, ids)
    for (let round = 0; round < 6; round++) {
      await this.run({ force: true })
      const index = await this.remoteIndex(folderId, true)
      const names = await this.ledger.uploaded(folderId)
      const missing = [...new Set(ids)].filter((id) => !this.has(index, names, id, 'full'))
      if (!missing.length) return
      // Retry waiting jobs now: a conversion must finish or leave the old file as it is.
      for (const j of await this.ledger.jobs()) await this.ledger.putJob({ ...j, nextAt: 0 })
      if (round > 0) await this.sleep(backoffMs(round))
    }
    throw new DriveError('other', 'Some pictures could not be sent to Google Drive yet, so the file was left as it was. Try again when the connection is steady.')
  }
}

export class NotUploadedYet extends Error {
  constructor() {
    super('Picture is still uploading')
    this.name = 'NotUploadedYet'
  }
}

/** Gets a picture back from Drive when this device does not have it. */
export class PictureFetcher {
  constructor(
    private api: Pick<DriveApi, 'downloadBytes'>,
    private sync: PictureSync
  ) {}

  /** The bytes of a picture, or throws NotUploadedYet when it has not reached Drive. */
  async fetch(folderId: string, id: string, kind: PictureKind = 'full'): Promise<{ bytes: Uint8Array; type: string }> {
    let file = this.find(await this.sync.remoteIndex(folderId), id, kind)
    if (!file) file = this.find(await this.sync.remoteIndex(folderId, true), id, kind) // another device may have just sent it
    if (!file) throw new NotUploadedYet()
    return { bytes: await this.api.downloadBytes(file.id), type: file.mimeType }
  }

  private find(index: Map<string, DriveFileMeta>, id: string, kind: PictureKind) {
    for (const [name, f] of index) if (name.startsWith(`${id}.`) && isThumbName(name) === (kind === 'thumb')) return f
    return undefined
  }
}
