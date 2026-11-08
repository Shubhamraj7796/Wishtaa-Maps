import type { DriveAuth } from './auth'

/** The browser, as far as renewal cares. A stand-in is used in tests. */
export interface RenewalEnv {
  visible(): boolean
  /** Calls back when the tab becomes visible, gets focus, or the network returns. Returns a way to stop listening. */
  onWake(cb: () => void): () => void
  /** Calls back once, on the next click, tap or key press (the browser allows opening Google's window then). */
  onceGesture(cb: () => void): () => void
  setTimer(cb: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

export interface RenewalOptions {
  /** Renew this long before the token stops working (the token lasts about an hour, so this is about every 50 minutes). */
  leadMs?: number
  /** After a failed quiet try while the token still works, try again after this long. */
  retryMs?: number
  env?: RenewalEnv
}

type Auth = Pick<DriveAuth, 'connected' | 'hasValidToken' | 'expiresInMs' | 'renewQuietly' | 'markReconnect' | 'subscribe' | 'state'>

export const RECONNECT_MESSAGE = 'Google Drive needs you to sign in again to keep syncing. Your changes are safe in this browser.'
const MAX_TIMER = 2 ** 31 - 1

export function browserEnv(): RenewalEnv {
  return {
    visible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    onWake: (cb) => {
      const onVisible = () => document.visibilityState === 'visible' && cb()
      window.addEventListener('focus', cb)
      window.addEventListener('online', cb)
      document.addEventListener('visibilitychange', onVisible)
      return () => {
        window.removeEventListener('focus', cb)
        window.removeEventListener('online', cb)
        document.removeEventListener('visibilitychange', onVisible)
      }
    },
    onceGesture: (cb) => {
      const run = () => {
        off()
        cb()
      }
      const off = () => {
        document.removeEventListener('pointerdown', run, true)
        document.removeEventListener('keydown', run, true)
      }
      document.addEventListener('pointerdown', run, true)
      document.addEventListener('keydown', run, true)
      return off
    },
    setTimer: (cb, ms) => setTimeout(cb, ms),
    clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  }
}

/**
 * Keeps Google Drive access alive without the person noticing. About 50 minutes after a token was issued (and whenever the tab comes
 * back into view, or the network returns) it asks Google for a new one with no window and no question. If the browser will not open
 * Google's window without a click, it waits for the person's next click or key press and does it then, still silently. Only when Google
 * itself says the person must confirm, and the old token has stopped working, does the "Reconnect" bar appear.
 */
export class DriveRenewal {
  private timer: unknown = null
  private busy = false
  private failures = 0
  private offWake: (() => void) | null = null
  private offAuth: (() => void) | null = null
  private offGesture: (() => void) | null = null
  private readonly lead: number
  private readonly retry: number
  private readonly env: RenewalEnv

  constructor(private auth: Auth, opts: RenewalOptions = {}) {
    this.lead = opts.leadMs ?? 10 * 60_000
    this.retry = opts.retryMs ?? 60_000
    this.env = opts.env ?? browserEnv()
  }

  start() {
    this.stop()
    this.offWake = this.env.onWake(() => this.check())
    this.offAuth = this.auth.subscribe(() => this.schedule())
    this.check()
  }

  stop() {
    this.offWake?.()
    this.offAuth?.()
    this.offGesture?.()
    this.offWake = this.offAuth = this.offGesture = null
    if (this.timer !== null) this.env.clearTimer(this.timer)
    this.timer = null
  }

  private due(): boolean {
    // Once the "Reconnect" bar is up, only the person's own Reconnect click helps: no more quiet tries.
    if (!this.auth.connected() || this.auth.state.status === 'reconnect') return false
    const left = this.auth.expiresInMs()
    return left === null || left <= this.lead
  }

  private schedule() {
    if (this.timer !== null) this.env.clearTimer(this.timer)
    this.timer = null
    if (!this.auth.connected() || this.auth.state.status === 'reconnect') {
      this.offGesture?.()
      this.offGesture = null
      return
    }
    const left = this.auth.expiresInMs()
    const wait = left === null ? this.retry : Math.max(1000, left - this.lead)
    this.timer = this.env.setTimer(() => {
      this.timer = null
      this.check()
    }, Math.min(wait, MAX_TIMER))
  }

  /** Renews now if it is time, the tab can be seen, and nothing is already under way. */
  check() {
    if (this.busy) return
    if (!this.due()) return this.schedule()
    if (!this.env.visible()) return // renews when the tab comes back
    void this.attempt()
  }

  private async attempt() {
    this.busy = true
    let result: Awaited<ReturnType<Auth['renewQuietly']>>
    try {
      result = await this.auth.renewQuietly()
    } finally {
      this.busy = false
    }
    switch (result) {
      case 'ok':
        this.failures = 0
        this.offGesture?.()
        this.offGesture = null
        return this.schedule()
      case 'needs-gesture':
        // Done on the next click or key press, which the browser treats as permission to open Google's window.
        this.offGesture ??= this.env.onceGesture(() => {
          this.offGesture = null
          void this.attempt()
        })
        return
      case 'offline':
        return // the "online" wake-up tries again
      case 'not-linked':
        return this.schedule()
      case 'failed':
        this.failures++
        if (!this.auth.hasValidToken()) {
          // Nothing left that works, and Google wants the person to confirm: the one place the bar is shown.
          this.auth.markReconnect(RECONNECT_MESSAGE)
          return
        }
        // The old token still works: try again soon, and after a few failures just wait until it is about to stop.
        this.timer = this.env.setTimer(
          () => {
            this.timer = null
            this.check()
          },
          this.failures >= 3 ? Math.min(MAX_TIMER, Math.max(this.retry, (this.auth.expiresInMs() ?? 0) - 5000)) : this.retry
        )
    }
  }
}
