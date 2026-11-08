/** "Send a new code" is allowed again only after a wait, per address; the time is kept for the tab so a reload does not skip it. */
export const RESEND_SECONDS = 30
const KEY = 'wishtaamaps:code-sent'

interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

export class ResendGate {
  constructor(private store?: Store, private now: () => number = Date.now, private seconds = RESEND_SECONDS) {}

  private read(): Record<string, number> {
    try {
      const v = JSON.parse(this.store?.getItem(KEY) ?? '{}') as unknown
      return v && typeof v === 'object' ? (v as Record<string, number>) : {}
    } catch {
      return {}
    }
  }

  /** Whole seconds still to wait for this address (0 = may send now). */
  remaining(email: string): number {
    const at = this.read()[email]
    if (typeof at !== 'number') return 0
    return Math.max(0, Math.ceil((at + this.seconds * 1000 - this.now()) / 1000))
  }

  mark(email: string) {
    const all = this.read()
    const t = this.now()
    for (const k of Object.keys(all)) if (t - (all[k] ?? 0) > 3600_000) delete all[k]
    all[email] = t
    try {
      this.store?.setItem(KEY, JSON.stringify(all))
    } catch {
      /* the wait still holds for this page */
    }
  }
}
