export type Provider = 'email' | 'google'

export interface AuthUser {
  id: string
  email: string | null
  name: string
  avatarUrl: string | null
  /** How this account can sign in. */
  providers: Provider[]
  /** The Google account's own address, when Google is linked (Drive sign-in uses it as a hint). */
  googleEmail: string | null
}

export type BackendEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY'

export type FailureKind =
  | 'network' // no connection: nothing is wrong with the account
  | 'invalid' // wrong email, password or code
  | 'unconfirmed' // email not confirmed yet
  | 'rate' // too many tries
  | 'cooldown' // our own resend wait
  | 'captcha'
  | 'weak-password'
  | 'session' // the sign-in is no longer valid
  | 'last-method'
  | 'config'
  | 'other'

/** Anything that goes wrong in sign-in, with a message that is safe to show. */
export class AuthFailure extends Error {
  constructor(public kind: FailureKind, message: string, public retryAfter?: number) {
    super(message)
    this.name = 'AuthFailure'
  }
}

export interface RecentRow {
  file_ref: string
  title: string
  storage_kind: 'local' | 'drive'
  drive_file_id: string | null
  last_opened: string
}
export interface PrefsRow {
  version: number
  data: Record<string, unknown>
  updated_at: string
}
export interface DriveLinkRow {
  google_email: string | null
  app_folder_id?: string | null
  status: 'connected' | 'needs_reconnect' | 'disconnected'
  connected_at?: string
}

/** The account's own data in Supabase (see supabase/migrations/0003_accounts.sql). Every call is limited to the signed-in person by row-level security. */
export interface AccountDb {
  getProfile(uid: string): Promise<{ display_name: string; avatar_url: string | null } | null>
  setDisplayName(uid: string, name: string): Promise<void>
  getPrefs(uid: string): Promise<PrefsRow | null>
  putPrefs(uid: string, version: number, data: object): Promise<void>
  upsertRecent(uid: string, rows: RecentRow[]): Promise<void>
  listRecent(uid: string, limit: number): Promise<RecentRow[]>
  deleteRecent(uid: string, refs: string[]): Promise<void>
  getDriveLink(uid: string): Promise<DriveLinkRow | null>
  putDriveLink(uid: string, link: DriveLinkRow): Promise<void>
}

/** Everything the app needs from the sign-in service. The real one is Supabase; tests use a fake. */
export interface AuthBackend {
  db: AccountDb
  /** The saved session, if any. `error` is set when it could not be checked (for example offline). */
  getSession(): Promise<{ user: AuthUser | null; error?: AuthFailure }>
  onChange(cb: (event: BackendEvent, user: AuthUser | null) => void): () => void
  sendCode(email: string, captchaToken?: string): Promise<void>
  verifyCode(email: string, code: string): Promise<void>
  signInPassword(email: string, password: string, captchaToken?: string): Promise<void>
  signUp(email: string, password: string, redirectTo: string, captchaToken?: string): Promise<{ needsConfirmation: boolean }>
  resendConfirmation(email: string, redirectTo: string, captchaToken?: string): Promise<void>
  sendReset(email: string, redirectTo: string, captchaToken?: string): Promise<void>
  setPassword(password: string): Promise<void>
  /** Leaves the page for Google. */
  signInGoogle(redirectTo: string): Promise<void>
  linkGoogle(redirectTo: string): Promise<void>
  unlink(provider: Provider): Promise<void>
  signOut(scope: 'local' | 'global'): Promise<void>
  deleteAccount(): Promise<void>
}
