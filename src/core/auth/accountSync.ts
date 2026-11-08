import { toFailure } from './errors'
import type { AccountDb, DriveLinkRow, RecentRow } from './types'

type Op = { k: 'recent'; row: RecentRow } | { k: 'prefs'; version: number; data: object } | { k: 'drive'; link: DriveLinkRow }

interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

export interface AccountSyncOptions {
  storage?: Store
  /** Wait before sending, so a burst of changes becomes one request. */
  delayMs?: number
  /** Called when the service refuses a change (not when it is only unreachable). */
  onRejected?: (what: string, message: string) => void
}

const queueKey = (uid: string) => `wishtaamaps:acct-queue:${uid}`
const MAX_RECENT = 200

/**
 * Sends the account's small records (recent files, preferences, the Drive link) to Supabase. A change made offline, or while the
 * service is unreachable, waits in a queue that survives a reload and goes out when the connection is back. The queue is per account.
 * Never carries map content, only titles and ids.
 */
export class AccountSync {
  private queue = new Map<string, Op>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<void> | null = null
  private again = false
  private stopped = false
  private onOnline = () => void this.flush()
  private onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && this.queue.size) void this.flush()
  }

  constructor(private db: AccountDb, readonly uid: string, private opts: AccountSyncOptions = {}) {
    this.load()
  }

  private load() {
    try {
      const raw = this.opts.storage?.getItem(queueKey(this.uid))
      const list = raw ? (JSON.parse(raw) as [string, Op][]) : []
      for (const [k, op] of list) if (typeof k === 'string' && op && typeof op === 'object') this.queue.set(k, op)
    } catch {
      /* a damaged queue is dropped: these records are rebuilt as files are opened */
    }
  }

  private save() {
    try {
      if (this.queue.size) this.opts.storage?.setItem(queueKey(this.uid), JSON.stringify([...this.queue]))
      else this.opts.storage?.removeItem(queueKey(this.uid))
    } catch {
      /* ignore */
    }
  }

  /** Starts sending queued changes now and whenever the connection or the tab comes back. */
  start() {
    this.stopped = false
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline)
      document.addEventListener('visibilitychange', this.onVisible)
    }
    if (this.queue.size) this.schedule()
  }

  stop() {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline)
      document.removeEventListener('visibilitychange', this.onVisible)
    }
  }

  /** Forgets everything waiting to be sent (on sign-out). */
  clear() {
    this.stop()
    this.queue.clear()
    this.save()
  }

  pending(): number {
    return this.queue.size
  }

  recent(row: RecentRow) {
    this.queue.set(`recent:${row.file_ref}`, { k: 'recent', row })
    this.changed()
  }
  prefs(version: number, data: object) {
    this.queue.set('prefs', { k: 'prefs', version, data })
    this.changed()
  }
  driveLink(link: DriveLinkRow) {
    this.queue.set('drive', { k: 'drive', link })
    this.changed()
  }

  private changed() {
    this.save()
    this.schedule()
  }

  private schedule() {
    if (this.stopped || this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, this.opts.delayMs ?? 1500)
  }

  /** Sends what is queued. Resolves when done or when the service cannot be reached (the rest stays queued). */
  flush(): Promise<void> {
    if (this.flushing) {
      this.again = true
      return this.flushing
    }
    this.flushing = this.run().finally(() => {
      this.flushing = null
      if (this.again) {
        this.again = false
        if (this.queue.size) this.schedule()
      }
    })
    return this.flushing
  }

  private async run() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    // One batch at a time, in the order: preferences, the Drive link, then recent files.
    const take = (pred: (op: Op) => boolean) => [...this.queue].filter(([, op]) => pred(op))
    const done = (keys: string[]) => {
      for (const k of keys) this.queue.delete(k)
      this.save()
    }
    const attempt = async (what: string, keys: string[], send: () => Promise<void>): Promise<boolean> => {
      if (!keys.length) return true
      try {
        await send()
        done(keys)
        return true
      } catch (e) {
        const f = toFailure(e)
        if (f.kind === 'network' || f.kind === 'rate') return false // try again later
        done(keys) // refused for good: do not retry forever
        this.opts.onRejected?.(what, f.message)
        return true
      }
    }

    for (const [key, op] of take((o) => o.k === 'prefs')) {
      if (op.k !== 'prefs') continue
      if (!(await attempt('preferences', [key], () => this.db.putPrefs(this.uid, op.version, op.data)))) return
    }
    for (const [key, op] of take((o) => o.k === 'drive')) {
      if (op.k !== 'drive') continue
      if (!(await attempt('drive link', [key], () => this.db.putDriveLink(this.uid, op.link)))) return
    }
    const recents = take((o) => o.k === 'recent')
    if (recents.length) {
      const rows = recents.map(([, op]) => (op.k === 'recent' ? op.row : null)).filter((r): r is RecentRow => !!r).slice(-MAX_RECENT)
      await attempt('recent files', recents.map(([k]) => k), () => this.db.upsertRecent(this.uid, rows))
    }
  }
}
