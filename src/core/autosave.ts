/**
 * Where the map is persisted. Local storage today; a Supabase implementation can be
 * dropped in later without touching the autosaver or the UI.
 */
export interface MapStorage {
  load(): Promise<string | null>
  save(data: string): Promise<void>
  /** Optional synchronous write, used while the page is closing. */
  saveSync?(data: string): void
}

export type SaveStatus = 'saved' | 'saving' | 'error' | 'offline'

export interface SaveSnapshot {
  status: SaveStatus
  /** When the last successful write finished (ms since epoch), or null. */
  savedAt: number | null
  error: string | null
}

export interface AutosaverOptions {
  storage: MapStorage
  /** Returns the current state to persist. Called at write time so the latest state always wins. */
  serialize: () => string
  /** Awaited before each write (e.g. image blobs must reach storage before the map that references them). */
  beforeSave?: () => Promise<void>
  debounceMs?: number
  /** Delays between automatic retries after a failure; the last value repeats. */
  retryDelaysMs?: number[]
  now?: () => number
  onChange?: (snapshot: SaveSnapshot) => void
}

export class Autosaver {
  private dirty = false
  private writing = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private failures = 0
  private snap: SaveSnapshot = { status: 'saved', savedAt: null, error: null }
  private readonly debounceMs: number
  private readonly retryDelays: number[]
  private readonly now: () => number

  constructor(private opts: AutosaverOptions) {
    this.debounceMs = opts.debounceMs ?? 400
    this.retryDelays = opts.retryDelaysMs ?? [1000, 2000, 5000, 10000, 30000]
    this.now = opts.now ?? Date.now
  }

  get snapshot(): SaveSnapshot {
    return this.snap
  }

  /** True while there is anything not yet safely written (pending, in flight, or failed). */
  get hasUnsaved(): boolean {
    return this.dirty || this.writing || this.snap.status === 'error'
  }

  /** Call after every change to the map. Shows "saving" immediately, writes shortly after. */
  markDirty() {
    this.dirty = true
    this.set({ status: 'saving', error: null })
    clearTimeout(this.retryTimer)
    if (this.writing) return // the running write loops and picks up the latest state
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), this.debounceMs)
  }

  /** Writes now (skipping the debounce) and resolves when storage is up to date. */
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    clearTimeout(this.retryTimer)
    await this.run()
  }

  /** Manual retry after an error. */
  retry(): Promise<void> {
    return this.flush()
  }

  /**
   * For page close, where async work may never finish. Writes synchronously when the storage
   * supports it. Returns true if it is safe to leave (nothing unsaved).
   */
  prepareForUnload(): boolean {
    if (this.dirty && !this.writing && this.opts.storage.saveSync) {
      clearTimeout(this.timer)
      clearTimeout(this.retryTimer)
      try {
        this.opts.storage.saveSync(this.opts.serialize())
        this.dirty = false
        this.failures = 0
        this.set({ status: 'saved', savedAt: this.now(), error: null })
      } catch (e) {
        this.set({ status: 'error', error: message(e) })
      }
    } else if (this.dirty && !this.writing) {
      void this.run()
    }
    return !this.hasUnsaved
  }

  dispose() {
    clearTimeout(this.timer)
    clearTimeout(this.retryTimer)
  }

  private async run(): Promise<void> {
    if (this.writing) return
    this.writing = true
    try {
      while (this.dirty) {
        this.dirty = false
        this.set({ status: 'saving', error: null })
        try {
          await this.opts.beforeSave?.()
          await this.opts.storage.save(this.opts.serialize())
          this.failures = 0
        } catch (e) {
          this.dirty = true // keep the changes in memory and try again
          this.set({ status: isOffline(e) ? 'offline' : 'error', error: message(e) })
          this.scheduleRetry()
          return
        }
      }
      this.set({ status: 'saved', savedAt: this.now(), error: null })
    } finally {
      this.writing = false
    }
  }

  private scheduleRetry() {
    const delay = this.retryDelays[Math.min(this.failures, this.retryDelays.length - 1)] ?? 5000
    this.failures++
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => void this.run(), delay)
  }

  private set(patch: Partial<SaveSnapshot>) {
    const next = { ...this.snap, ...patch }
    if (next.status === this.snap.status && next.savedAt === this.snap.savedAt && next.error === this.snap.error) return
    this.snap = next
    this.opts.onChange?.(next)
  }
}

/** Errors from storage can mark themselves as "no connection" (`offline: true`) so the status says so. */
function isOffline(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { offline?: unknown }).offline === true
}

function message(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Storage is unavailable'
}

/** Browser localStorage implementation. */
export class LocalMapStorage implements MapStorage {
  constructor(private key: string) {}
  async load() {
    try {
      return localStorage.getItem(this.key)
    } catch {
      return null
    }
  }
  async save(data: string) {
    this.saveSync(data)
  }
  saveSync(data: string) {
    localStorage.setItem(this.key, data)
  }
}
