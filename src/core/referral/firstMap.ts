import type { AccountDb } from '../auth/types'
import { DEFAULT_PLAN_SETTINGS } from '../plan'

/**
 * Tells the database, once, that an INVITED person saved a first real map. Only a number is sent (how many topics the map has): no title,
 * no text, no content. It only does anything while this account is waiting for that (it was invited and has not qualified yet), it never
 * asks more than once a minute, and it stops for good as soon as the database says the referral qualified (or that there is none).
 * The database re-checks everything (email confirmed, enough topics), so a wrong guess here costs nothing.
 */
export class FirstMapReporter {
  private awaiting = false
  private min: number = DEFAULT_PLAN_SETTINGS.minTopicsFirstMap
  private last = -Infinity
  private inflight = false
  private stopped = false

  constructor(
    private db: AccountDb,
    private opts: { now?: () => number; gapMs?: number } = {}
  ) {}

  /** Asks the database whether this account is waiting for a first map. Any failure simply means "not now". */
  async start(): Promise<void> {
    try {
      const s = await this.db.referralSummary()
      if (this.stopped || !s) return
      // Older databases (before 0005) do not say: an invited person is then treated as waiting, and the first answer from the database ends it.
      this.awaiting = s.awaitingFirstMap ?? s.invitedByFriend
      if (typeof s.minTopics === 'number') this.min = s.minTopics
    } catch {
      /* offline: nothing is reported, nothing is lost */
    }
  }

  stop() {
    this.stopped = true
    this.awaiting = false
  }

  get waiting() {
    return this.awaiting
  }

  /** Call after every successful save of a map with the number of topics it has now. */
  onSaved(topics: number): void {
    if (this.stopped || !this.awaiting || this.inflight || topics < this.min) return
    const now = (this.opts.now ?? Date.now)()
    if (now - this.last < (this.opts.gapMs ?? 60_000)) return
    this.last = now
    this.inflight = true
    this.db
      .recordFirstMap(topics)
      .then((r) => {
        if (r !== 'waiting') this.awaiting = false
      })
      .catch(() => undefined)
      .finally(() => {
        this.inflight = false
      })
  }
}
