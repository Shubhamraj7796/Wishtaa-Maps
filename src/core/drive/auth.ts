import type { TokenProvider } from './client'
import { DriveError } from './errors'

/** The only permission ever requested: files this app creates, or that the user opens with it. Never all of Drive. */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'

export type DriveAuthStatus =
  | 'unconfigured' // no client id set up
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnect' // was connected, but the sign-in lapsed and needs a click to renew

export interface DriveAuthState {
  status: DriveAuthStatus
  /** Shown to the user after a failed or revoked sign-in. */
  message: string | null
  /** The Google account, when known. */
  account: string | null
}

/** The part of Google Identity Services (token model) that we use. */
export interface GisTokenResponse {
  access_token?: string
  expires_in?: number | string
  error?: string
  error_description?: string
  scope?: string
}
export interface GisTokenClient {
  requestAccessToken(overrides?: { prompt?: string; hint?: string }): void
}

/** How a quiet renewal (no window, no question) went. */
export type RenewResult =
  | 'ok'
  | 'needs-gesture' // the browser would not open Google's window without a click: try again on the next click
  | 'offline'
  | 'failed' // Google needs the person to confirm (signed out of Google, or access changed)
  | 'not-linked'
export interface Gis {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (r: GisTokenResponse) => void
    error_callback?: (e: { type: string; message?: string }) => void
  }): GisTokenClient
  hasGrantedAllScopes?(r: GisTokenResponse, ...scopes: string[]): boolean
  revoke(token: string, done?: () => void): void
}

export interface AuthStorage {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

/** The connected flag and account name are remembered; the access token never is (memory only). */
export const AUTH_HINT_KEY = 'wishtaamaps:drive-account'

const SCRIPT = 'https://accounts.google.com/gsi/client'
let gisPromise: Promise<Gis> | null = null

/** Loads Google's sign-in script once. */
export function loadGis(): Promise<Gis> {
  gisPromise ??= new Promise<Gis>((resolve, reject) => {
    const ready = () => {
      const g = (window as unknown as { google?: { accounts?: { oauth2?: Gis } } }).google?.accounts?.oauth2
      return g ?? null
    }
    const have = ready()
    if (have) return resolve(have)
    const s = document.createElement('script')
    s.src = SCRIPT
    s.async = true
    s.onload = () => {
      const g = ready()
      if (g) resolve(g)
      else reject(new DriveError('other', 'Google sign-in did not load.'))
    }
    s.onerror = () => {
      gisPromise = null
      reject(new DriveError('offline', 'Could not reach Google sign-in. Check your connection and try again.'))
    }
    document.head.appendChild(s)
  })
  return gisPromise
}

type Listener = () => void

export interface DriveAuthOptions {
  clientId: string | undefined
  loadGis?: () => Promise<Gis>
  storage?: AuthStorage
  now?: () => number
}

/** Google sign-in for Drive. Access tokens live in memory only and are renewed silently when they expire. */
export class DriveAuth implements TokenProvider {
  private token: { value: string; expiresAt: number } | null = null
  private client: GisTokenClient | null = null
  private pending: { resolve: (t: string) => void; reject: (e: DriveError) => void; quiet: boolean } | null = null
  /** The Google address to suggest when asking for access (the one the person signed in with), used until an account is linked. */
  private loginHint: string | null = null
  private inflight: Promise<string> | null = null
  private inflightQuiet = false
  private listeners = new Set<Listener>()
  private snap: DriveAuthState
  private readonly load: () => Promise<Gis>
  private readonly storage?: AuthStorage
  private readonly now: () => number

  constructor(private opts: DriveAuthOptions) {
    this.load = opts.loadGis ?? loadGis
    this.storage = opts.storage
    this.now = opts.now ?? Date.now
    const hint = this.readHint()
    this.snap = {
      status: !opts.clientId ? 'unconfigured' : hint ? 'connected' : 'disconnected',
      message: null,
      account: hint?.account ?? null,
    }
  }

  get state(): DriveAuthState {
    return this.snap
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }

  getState = () => this.snap

  private set(patch: Partial<DriveAuthState>) {
    this.snap = { ...this.snap, ...patch }
    this.listeners.forEach((l) => l())
  }

  private readHint(): { account: string | null } | null {
    try {
      const raw = this.storage?.getItem(AUTH_HINT_KEY)
      if (!raw) return null
      const v = JSON.parse(raw) as { account?: string | null }
      return { account: v.account ?? null }
    } catch {
      return null
    }
  }

  private writeHint(on: boolean) {
    try {
      if (on) this.storage?.setItem(AUTH_HINT_KEY, JSON.stringify({ account: this.snap.account }))
      else this.storage?.removeItem(AUTH_HINT_KEY)
    } catch {
      /* ignore */
    }
  }

  /** Linked to a Google account (a token may still need renewing). */
  connected(): boolean {
    return this.snap.status === 'connected' || this.snap.status === 'reconnect'
  }

  hasValidToken(): boolean {
    return !!this.token && this.token.expiresAt - this.now() > 60_000
  }

  ready(): boolean {
    return this.connected() && this.hasValidToken()
  }

  /** Clears a shown sign-in message (after the user has seen it). */
  dismissMessage() {
    if (this.snap.message) this.set({ message: null })
  }

  setAccount(account: string | null) {
    if (account === this.snap.account) return
    this.set({ account })
    if (this.connected()) this.writeHint(true)
  }

  private async tokenClient(): Promise<GisTokenClient> {
    if (this.client) return this.client
    if (!this.opts.clientId) throw new DriveError('config', 'Google Drive is not set up for this site yet.')
    const gis = await this.load()
    this.client = gis.initTokenClient({
      client_id: this.opts.clientId,
      scope: DRIVE_SCOPE,
      callback: (r) => this.onResponse(r, gis),
      error_callback: (e) => {
        const closed = e.type === 'popup_closed' || e.type === 'popup_failed_to_open'
        if (this.pending?.quiet) {
          // A quiet attempt that could not open Google's window is not a sign-in problem: it waits for a click.
          this.fail(new DriveError(e.type === 'popup_failed_to_open' ? 'popup' : 'auth', e.message || 'Google sign-in window.'), false, true)
          return
        }
        if (e.type === 'popup_failed_to_open') {
          this.fail(new DriveError('popup', 'Your browser blocked the Google window. Allow pop-ups for this site, or open it with the button.', undefined, e.type))
          return
        }
        this.fail(new DriveError('auth', closed ? 'The Google sign-in window was closed before finishing.' : e.message || 'Google sign-in failed.', undefined, e.type))
      },
    })
    return this.client
  }

  private onResponse(r: GisTokenResponse, gis: Gis) {
    if (r.error || !r.access_token) {
      const denied = r.error === 'access_denied'
      if (this.pending?.quiet && !denied) {
        this.fail(new DriveError('auth', r.error_description || 'Google needs you to confirm.'), false, true)
        return
      }
      this.fail(
        new DriveError(denied ? 'revoked' : 'auth', denied ? 'Google Drive access was not allowed. You can try connecting again.' : r.error_description || 'Google sign-in failed.', undefined, [r.error, r.error_description].filter(Boolean).join(': ')),
        denied
      )
      return
    }
    if (gis.hasGrantedAllScopes && !gis.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
      this.fail(new DriveError('revoked', 'Wishtaa Maps needs permission to create and open its own files in Google Drive.'), true)
      return
    }
    const seconds = Number(r.expires_in) || 3600
    this.token = { value: r.access_token, expiresAt: this.now() + seconds * 1000 }
    this.set({ status: 'connected', message: null })
    this.writeHint(true)
    const p = this.pending
    this.pending = null
    p?.resolve(r.access_token)
  }

  private fail(e: DriveError, forget = false, quiet = false) {
    if (quiet) {
      // A quiet renewal that did not work changes nothing the person sees: the old token (if any) keeps working until it expires.
      const p = this.pending
      this.pending = null
      p?.reject(e)
      return
    }
    this.token = null
    if (forget) {
      this.set({ status: 'disconnected', message: e.message, account: null })
      this.writeHint(false)
    } else {
      this.set({ status: this.snap.status === 'connecting' ? 'disconnected' : 'reconnect', message: e.message })
    }
    const p = this.pending
    this.pending = null
    p?.reject(e)
  }

  private request(prompt: string, o: { quiet?: boolean; chooseAccount?: boolean } = {}): Promise<string> {
    if (this.inflight) {
      // A person's own request never inherits the failure of a quiet one in progress: it asks properly if the quiet one did not work.
      if (!o.quiet && this.inflightQuiet) return this.inflight.then((t) => t, () => this.request(prompt, o))
      return this.inflight
    }
    this.inflightQuiet = !!o.quiet
    const p = new Promise<string>((resolve, reject) => {
      this.tokenClient().then(
        (client) => {
          this.pending = { resolve, reject, quiet: !!o.quiet }
          const hint = o.chooseAccount ? null : this.snap.account ?? this.loginHint
          client.requestAccessToken({ prompt, ...(hint ? { hint } : {}) })
        },
        (e) => reject(e)
      )
    })
    this.inflight = p
    const done = () => {
      if (this.inflight === p) this.inflight = null
    }
    p.then(done, done)
    return p
  }

  /**
   * Starts sign-in (call from a click). Resolves when connected. With `chooseAccount`, Google always shows its account chooser and no
   * address is suggested (for someone who signed in to Wishtaa Maps by email and picks which Google account holds their maps).
   */
  async connect(o: { chooseAccount?: boolean } = {}): Promise<void> {
    if (this.snap.status === 'unconfigured') throw new DriveError('config', 'Google Drive is not set up for this site yet.')
    const first = this.snap.status !== 'connected' && this.snap.status !== 'reconnect'
    if (first) this.set({ status: 'connecting', message: null })
    try {
      await this.request(first ? (o.chooseAccount ? 'select_account consent' : 'consent') : o.chooseAccount ? 'select_account' : '', { chooseAccount: o.chooseAccount })
    } catch (e) {
      if (first && this.snap.status === 'connecting') this.set({ status: 'disconnected' })
      throw e
    }
  }

  async getToken(): Promise<string> {
    if (this.hasValidToken()) return (this.token as { value: string }).value
    return this.refresh()
  }

  /** Gets a new token without asking, if Google allows it; otherwise the user is asked to reconnect. */
  async refresh(): Promise<string> {
    if (!this.connected()) throw new DriveError('auth', 'Connect Google Drive to save this file there.')
    this.token = null
    return this.request('')
  }

  /**
   * Takes a Drive token that was obtained during "Sign in with Google" (Google showed one consent screen for sign-in and Drive together), so
   * no second window is needed. The caller must check which account it belongs to before keeping it (see `linkDriveAccount`).
   */
  adoptToken(token: string, expiresInSeconds = 3300) {
    if (!this.opts.clientId) return
    this.token = { value: token, expiresAt: this.now() + expiresInSeconds * 1000 }
    this.set({ status: 'connected', message: null })
    this.writeHint(true)
  }

  /** Throws away a token that belongs to the wrong account: it is revoked with Google (best effort), forgotten, and nothing is linked. */
  async discard(): Promise<void> {
    const t = this.token?.value
    this.token = null
    this.set({ status: this.opts.clientId ? 'disconnected' : 'unconfigured', message: null, account: null })
    this.writeHint(false)
    if (t) {
      try {
        const gis = await this.load()
        await new Promise<void>((done) => gis.revoke(t, () => done()))
      } catch {
        /* revoking is best effort: the token is already gone from this browser */
      }
    }
  }

  /** Suggests a Google address for the next sign-in window (the account the person signed in with). Never overrides a linked account. */
  setLoginHint(email: string | null) {
    this.loginHint = email
  }

  /** Milliseconds until the current token stops working; null when there is no token in memory. */
  expiresInMs(): number | null {
    return this.token ? this.token.expiresAt - this.now() : null
  }

  /**
   * Gets a fresh token without asking anything (Google's `prompt: none`), ahead of expiry. Nothing the person sees changes unless
   * Google refuses outright (see `markReconnect`). The current token keeps working while this runs.
   */
  async renewQuietly(): Promise<RenewResult> {
    if (!this.connected()) return 'not-linked'
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
    try {
      await this.request('none', { quiet: true })
      return 'ok'
    } catch (e) {
      if (e instanceof DriveError && e.kind === 'popup') return 'needs-gesture'
      if (e instanceof DriveError && e.kind === 'offline') return 'offline'
      return 'failed'
    }
  }

  /** Shows the "Reconnect" bar: a quiet renewal failed and the current token is gone or about to be. */
  markReconnect(message: string) {
    if (this.snap.status === 'connected') this.set({ status: 'reconnect', message })
  }

  /**
   * Forgets the linked Google account on this browser (token and remembered account) WITHOUT revoking Google's permission. Used when
   * the Wishtaa Maps account signs out, so the next person never inherits this Drive access; signing in again needs no new consent.
   */
  forget() {
    this.token = null
    this.pending = null
    this.inflight = null
    this.set({ status: this.opts.clientId ? 'disconnected' : 'unconfigured', message: null, account: null })
    this.writeHint(false)
  }

  /** Removes our access: revokes the token with Google and forgets the account. */
  async disconnect(): Promise<void> {
    const t = this.token?.value
    this.token = null
    if (t) {
      try {
        const gis = await this.load()
        await new Promise<void>((done) => gis.revoke(t, () => done()))
      } catch {
        /* revoking is best effort */
      }
    }
    this.set({ status: this.opts.clientId ? 'disconnected' : 'unconfigured', message: null, account: null })
    this.writeHint(false)
  }
}
