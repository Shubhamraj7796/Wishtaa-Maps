import { ResendGate } from './cooldown'
import { isDeadSession, toFailure } from './errors'
import { normalizeEmail, validEmail } from './passwords'
import { AuthFailure, type AuthBackend, type AuthUser, type BackendEvent, type Provider } from './types'

export type AuthStatus =
  | 'disabled' // this site has no accounts set up: guest mode only
  | 'loading' // coming back from Google, or checking a saved sign-in
  | 'signed-out'
  | 'signed-in'
  | 'expired' // was signed in; the sign-in no longer works. Files are untouched.

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  /** Signed in from what was remembered, but the service could not be reached. */
  offline: boolean
  /** The person arrived from a "reset password" email and is choosing a new password. */
  recovery: boolean
  /** The address to pre-fill in "Sign in again". */
  expiredEmail: string | null
  /** The sign-in was confirmed with the service this session (not only remembered from last time). */
  verified: boolean
}

export interface AccountHooks {
  /** Removes everything that belongs to the previous account from this browser (Drive access, the cached Drive list, queued sync). Guest files stay. */
  clearAccountData(reason: 'sign-out' | 'other-user'): Promise<void>
  /** A sign-in was confirmed. `newBrowserUser` is true the first time this person signs in on this browser. */
  signedIn?(user: AuthUser, info: { newBrowserUser: boolean }): void
  /**
   * A sign-in event for an account that uses Google. `providerToken` is the Google access token from the sign-in (it carries the Drive
   * permission asked for there) and is only present right after "Sign in with Google".
   */
  googleSignedIn?(user: AuthUser, providerToken: string | undefined): void
}

interface Store {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

/** The person last signed in here (only who they are, never a token). Lets the app show "signed in" at once and while offline. */
export const HINT_KEY = 'wishtaamaps:auth-hint'
/** Whose Drive list and caches this browser holds. A different person signing in clears them. */
export const OWNER_KEY = 'wishtaamaps:cache-owner'

export interface ControllerOptions {
  storage?: Store
  sessionStorage?: Pick<Store, 'getItem' | 'setItem'>
  hooks?: AccountHooks
  now?: () => number
  /** The site's own address, for links in emails and the return from Google. */
  siteUrl?: () => string
  /** True when the page is returning from a sign-in link or from Google (so the saved session must be checked before showing anything). */
  returning?: boolean
}

const SIGNED_OUT: AuthState = { status: 'signed-out', user: null, offline: false, recovery: false, expiredEmail: null, verified: false }

export class AuthController {
  private snap: AuthState
  private listeners = new Set<() => void>()
  private backendPromise: Promise<AuthBackend> | null = null
  private initPromise: Promise<void> | null = null
  private verified = false
  private signingOut = false
  private gate: ResendGate
  private unsubscribe: (() => void) | null = null

  constructor(private load: (() => Promise<AuthBackend>) | null, private opts: ControllerOptions = {}) {
    this.gate = new ResendGate(opts.sessionStorage, opts.now)
    const hint = this.readHint()
    this.snap = !load ? { ...SIGNED_OUT, status: 'disabled' } : hint ? { ...SIGNED_OUT, status: 'signed-in', user: hint } : opts.returning ? { ...SIGNED_OUT, status: 'loading' } : SIGNED_OUT
  }

  // ------------------------------------------------------------------ state
  get state(): AuthState {
    return this.snap
  }
  getState = () => this.snap
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  private set(patch: Partial<AuthState>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l())
  }

  get enabled() {
    return !!this.load
  }

  private readHint(): AuthUser | null {
    try {
      const raw = this.opts.storage?.getItem(HINT_KEY)
      const v = raw ? (JSON.parse(raw) as Partial<AuthUser>) : null
      if (!v || typeof v.id !== 'string') return null
      return { id: v.id, email: v.email ?? null, name: v.name ?? '', avatarUrl: v.avatarUrl ?? null, providers: v.providers ?? [], googleEmail: v.googleEmail ?? null }
    } catch {
      return null
    }
  }
  private writeHint(user: AuthUser | null) {
    try {
      if (user) this.opts.storage?.setItem(HINT_KEY, JSON.stringify(user))
      else this.opts.storage?.removeItem(HINT_KEY)
    } catch {
      /* the hint is only a convenience */
    }
  }
  /** Who owns the account caches in this browser. */
  cacheOwner(): string | null {
    try {
      return this.opts.storage?.getItem(OWNER_KEY) ?? null
    } catch {
      return null
    }
  }

  private siteUrl() {
    return (this.opts.siteUrl ?? (() => (typeof location === 'undefined' ? '' : location.origin)))()
  }

  // ---------------------------------------------------------------- backend
  /** The sign-in service, loaded on first use so guests never download it. */
  backend(): Promise<AuthBackend> {
    if (!this.load) return Promise.reject(new AuthFailure('config', 'Accounts are not set up on this site yet.'))
    this.backendPromise ??= this.load().catch((e) => {
      this.backendPromise = null
      throw toFailure(e)
    })
    return this.backendPromise
  }

  /** Checks the saved sign-in with the service and starts listening for changes. Safe to call more than once. */
  init(): Promise<void> {
    if (!this.load) return Promise.resolve()
    this.initPromise ??= this.doInit()
    return this.initPromise
  }

  private async doInit() {
    let b: AuthBackend
    try {
      b = await this.backend()
    } catch {
      // The service could not even be loaded (offline). Keep what was remembered.
      this.set({ offline: true, ...(this.snap.status === 'loading' ? { status: 'signed-out' as const } : {}) })
      this.waitForOnline()
      return
    }
    this.unsubscribe?.()
    this.unsubscribe = b.onChange((e, u, x) => void this.onEvent(e, u, x))
    await this.verify(b)
  }

  private async verify(b: AuthBackend) {
    const { user, error } = await b.getSession()
    if (user) return this.accept(user)
    if (error?.kind === 'network') {
      this.set({ offline: true, ...(this.snap.status === 'loading' ? { status: 'signed-out' as const } : {}) })
      this.waitForOnline()
      return
    }
    const hint = this.readHint()
    if (hint && !this.signingOut) this.set({ status: 'expired', user: null, offline: false, expiredEmail: hint.email, verified: false })
    else if (this.snap.status !== 'signed-out') this.set({ ...SIGNED_OUT })
  }

  private waitForOnline() {
    if (typeof window === 'undefined') return
    const again = () => {
      window.removeEventListener('online', again)
      void this.backend().then((b) => {
        if (!this.unsubscribe) this.unsubscribe = b.onChange((e, u, x) => void this.onEvent(e, u, x))
        return this.verify(b)
      }, () => this.waitForOnline())
    }
    window.addEventListener('online', again)
  }

  private async onEvent(event: BackendEvent, user: AuthUser | null, extra?: { providerToken?: string }) {
    if (event === 'SIGNED_OUT') {
      if (this.signingOut) return
      // Signed out somewhere else (or revoked): the files here are untouched, the person is asked to sign in again.
      const email = this.snap.user?.email ?? this.readHint()?.email ?? null
      if (this.snap.status === 'signed-in' || this.snap.status === 'expired') this.set({ status: 'expired', user: null, expiredEmail: email, offline: false, verified: false })
      return
    }
    if (!user) return
    await this.accept(user)
    if (event === 'PASSWORD_RECOVERY') this.set({ recovery: true })
    if (event === 'SIGNED_IN' && user.providers.includes('google')) this.opts.hooks?.googleSignedIn?.(user, extra?.providerToken)
  }

  /** A confirmed signed-in person. */
  private async accept(user: AuthUser) {
    const owner = this.cacheOwner()
    const other = !!owner && owner !== user.id
    const firstTime = !this.verified || this.snap.user?.id !== user.id
    if (other) await this.opts.hooks?.clearAccountData('other-user')
    try {
      this.opts.storage?.setItem(OWNER_KEY, user.id)
    } catch {
      /* ignore */
    }
    this.writeHint(user)
    this.verified = true
    this.set({ status: 'signed-in', user, offline: false, expiredEmail: null, verified: true })
    if (firstTime) this.opts.hooks?.signedIn?.(user, { newBrowserUser: !owner || other })
  }

  // ---------------------------------------------------------------- sign in
  private async guard<T>(work: (b: AuthBackend) => Promise<T>): Promise<T> {
    try {
      return await work(await this.backend())
    } catch (e) {
      throw toFailure(e)
    }
  }

  private cleanEmail(email: string): string {
    const e = normalizeEmail(email)
    if (!validEmail(e)) throw new AuthFailure('invalid', 'Enter a valid email address, like name@example.com.')
    return e
  }

  /** Seconds until a new code may be requested for this address (0 = now). */
  resendIn(email: string): number {
    return this.gate.remaining(normalizeEmail(email))
  }

  /** Emails a 6-digit code. Creates the account on first use. */
  async sendCode(email: string, captchaToken?: string): Promise<void> {
    const e = this.cleanEmail(email)
    const wait = this.gate.remaining(e)
    if (wait > 0) throw new AuthFailure('cooldown', `Please wait ${wait} seconds before asking for another code.`, wait)
    await this.guard((b) => b.sendCode(e, captchaToken))
    this.gate.mark(e)
  }

  async verifyCode(email: string, code: string): Promise<void> {
    const e = this.cleanEmail(email)
    const digits = code.replace(/\s+/g, '')
    if (!/^\d{6}$/.test(digits)) throw new AuthFailure('invalid', 'Enter the 6-digit code from the email.')
    await this.guard((b) => b.verifyCode(e, digits))
    await this.afterSignIn()
  }

  async signInPassword(email: string, password: string, captchaToken?: string): Promise<void> {
    const e = this.cleanEmail(email)
    if (!password) throw new AuthFailure('invalid', 'Enter your password.')
    await this.guard((b) => b.signInPassword(e, password, captchaToken))
    await this.afterSignIn()
  }

  /** 'confirm' when a link was emailed first; 'signed-in' when the service let the person straight in. */
  async signUp(email: string, password: string, captchaToken?: string): Promise<'confirm' | 'signed-in'> {
    const e = this.cleanEmail(email)
    const r = await this.guard((b) => b.signUp(e, password, `${this.siteUrl()}/home`, captchaToken))
    if (r.needsConfirmation) return 'confirm'
    await this.afterSignIn()
    return 'signed-in'
  }

  async resendConfirmation(email: string, captchaToken?: string): Promise<void> {
    const e = this.cleanEmail(email)
    const wait = this.gate.remaining(e)
    if (wait > 0) throw new AuthFailure('cooldown', `Please wait ${wait} seconds before asking again.`, wait)
    await this.guard((b) => b.resendConfirmation(e, `${this.siteUrl()}/home`, captchaToken))
    this.gate.mark(e)
  }

  async forgotPassword(email: string, captchaToken?: string): Promise<void> {
    const e = this.cleanEmail(email)
    const wait = this.gate.remaining(e)
    if (wait > 0) throw new AuthFailure('cooldown', `Please wait ${wait} seconds before asking again.`, wait)
    await this.guard((b) => b.sendReset(e, `${this.siteUrl()}/reset-password`, captchaToken))
    this.gate.mark(e)
  }

  /** The new password after a reset link, or a password added or changed from the account page. */
  async setPassword(password: string): Promise<void> {
    await this.guard((b) => b.setPassword(password))
    this.set({ recovery: false })
    await this.refreshUser()
  }

  /** Goes to Google and comes back to the page the person was on. */
  async signInGoogle(): Promise<void> {
    await this.guard((b) => b.signInGoogle(this.returnAddress()))
  }

  async linkGoogle(): Promise<void> {
    await this.guard((b) => b.linkGoogle(`${this.siteUrl()}/account`))
  }

  private returnAddress() {
    return typeof location === 'undefined' ? this.siteUrl() : `${location.origin}${location.pathname}`
  }

  /** Reads the session again after a sign-in step, so the screen is signed in before the dialog closes. */
  private async afterSignIn() {
    const b = await this.backend()
    if (!this.unsubscribe) this.unsubscribe = b.onChange((ev, u, x) => void this.onEvent(ev, u, x))
    const { user } = await b.getSession()
    if (user) await this.accept(user)
  }

  async refreshUser(): Promise<void> {
    const b = await this.backend()
    const { user } = await b.getSession()
    if (user) await this.accept(user)
  }

  // -------------------------------------------------------------- the account
  /** Removes a sign-in method. Never the last one. */
  async unlink(provider: Provider): Promise<void> {
    const u = this.snap.user
    if (!u) throw new AuthFailure('session', 'Sign in first.')
    if (u.providers.length < 2 || !u.providers.includes(provider)) throw new AuthFailure('last-method', 'You need at least one way to sign in, so the last one cannot be removed. Add another first.')
    await this.guard((b) => b.unlink(provider))
    await this.refreshUser()
  }

  async updateDisplayName(name: string): Promise<void> {
    const u = this.snap.user
    if (!u) throw new AuthFailure('session', 'Sign in first.')
    const clean = name.trim().slice(0, 100)
    if (!clean) throw new AuthFailure('invalid', 'The name cannot be empty.')
    await this.guard((b) => b.db.setDisplayName(u.id, clean))
    const next = { ...u, name: clean }
    this.writeHint(next)
    this.set({ user: next })
  }

  /** Fills in the saved display name (a person may have changed it from the account page). */
  async loadProfile(): Promise<void> {
    const u = this.snap.user
    if (!u) return
    try {
      const p = await (await this.backend()).db.getProfile(u.id)
      if (p?.display_name && this.snap.user?.id === u.id && p.display_name !== this.snap.user.name) this.set({ user: { ...this.snap.user, name: p.display_name } })
    } catch {
      /* the name from the sign-in is fine */
    }
  }

  /**
   * Signs out. Always works, even offline: the sign-in on this device is removed, this person's Drive access and cached Drive list
   * are cleared, and guest files stay. `everywhere` also ends every other device's session (needs a connection).
   */
  async signOut(opts: { everywhere?: boolean } = {}): Promise<void> {
    this.signingOut = true
    try {
      if (this.load) {
        try {
          await (await this.backend()).signOut(opts.everywhere ? 'global' : 'local')
        } catch (e) {
          if (opts.everywhere) throw toFailure(e) // asked to end other devices: do not pretend it worked
        }
      }
      await this.opts.hooks?.clearAccountData('sign-out')
      this.writeHint(null)
      try {
        this.opts.storage?.removeItem(OWNER_KEY)
      } catch {
        /* ignore */
      }
      this.verified = false
      this.set({ ...SIGNED_OUT })
    } finally {
      this.signingOut = false
    }
  }

  /** Deletes the account and its data in Supabase. Files in Google Drive are not touched. */
  async deleteAccount(): Promise<void> {
    await this.guard((b) => b.deleteAccount())
    await this.signOut()
  }

  /** Closes the "sign in again" state without signing in. The person keeps using the app as a guest; their files are untouched. */
  dismissExpired() {
    if (this.snap.status !== 'expired') return
    this.writeHint(null)
    this.set({ ...SIGNED_OUT })
  }

  isDead = isDeadSession
}
