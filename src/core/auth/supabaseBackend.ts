import type { SupabaseClient, User } from '@supabase/supabase-js'
import { DRIVE_SCOPE } from '../drive/auth'
import { toFailure } from './errors'
import type { AccountDb, AuthBackend, AuthUser, BackendEvent, DriveLinkRow, PrefsRow, Provider, RecentRow } from './types'

/** The browser storage key for the session. */
export const SESSION_KEY = 'wishtaamaps:auth'

export function mapUser(u: User): AuthUser {
  const identities = u.identities ?? []
  const known = (p: string): p is Provider => p === 'email' || p === 'google'
  let providers = [...new Set(identities.map((i) => i.provider).filter(known))]
  if (!providers.length) providers = [...new Set(((u.app_metadata?.providers as string[] | undefined) ?? []).filter(known))]
  const google = identities.find((i) => i.provider === 'google')
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const email = u.email ?? null
  return {
    id: u.id,
    email,
    name: str(meta.full_name) ?? str(meta.name) ?? (email ? email.split('@')[0] ?? '' : ''),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
    providers,
    googleEmail: str((google?.identity_data as Record<string, unknown> | undefined)?.email),
  }
}

const EVENTS: Record<string, BackendEvent | undefined> = {
  SIGNED_IN: 'SIGNED_IN',
  SIGNED_OUT: 'SIGNED_OUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',
  USER_UPDATED: 'USER_UPDATED',
  PASSWORD_RECOVERY: 'PASSWORD_RECOVERY',
}

function accountDb(c: SupabaseClient): AccountDb {
  const check = (error: { message: string; code?: string } | null) => {
    if (error) throw toFailure(error)
  }
  return {
    async getProfile(uid) {
      const { data, error } = await c.from('profiles').select('display_name, avatar_url').eq('id', uid).maybeSingle()
      check(error)
      return data as { display_name: string; avatar_url: string | null } | null
    },
    async setDisplayName(uid, name) {
      const { error } = await c.from('profiles').update({ display_name: name }).eq('id', uid)
      check(error)
    },
    async getPrefs(uid) {
      const { data, error } = await c.from('user_preferences').select('version, data, updated_at').eq('user_id', uid).maybeSingle()
      check(error)
      return data as PrefsRow | null
    },
    async putPrefs(uid, version, data) {
      const { error } = await c.from('user_preferences').upsert({ user_id: uid, version, data }, { onConflict: 'user_id' })
      check(error)
    },
    async upsertRecent(uid, rows) {
      if (!rows.length) return
      const { error } = await c.from('recent_files').upsert(rows.map((r) => ({ ...r, user_id: uid })), { onConflict: 'user_id,file_ref' })
      check(error)
    },
    async listRecent(uid, limit) {
      const { data, error } = await c.from('recent_files').select('file_ref, title, storage_kind, drive_file_id, last_opened').eq('user_id', uid).order('last_opened', { ascending: false }).limit(limit)
      check(error)
      return (data ?? []) as RecentRow[]
    },
    async deleteRecent(uid, refs) {
      if (!refs.length) return
      const { error } = await c.from('recent_files').delete().eq('user_id', uid).in('file_ref', refs)
      check(error)
    },
    async getDriveLink(uid) {
      const { data, error } = await c.from('drive_links').select('google_email, app_folder_id, status, connected_at').eq('user_id', uid).maybeSingle()
      check(error)
      return data as DriveLinkRow | null
    },
    async putDriveLink(uid, link) {
      const { error } = await c.from('drive_links').upsert({ user_id: uid, ...link }, { onConflict: 'user_id' })
      check(error)
    },
  }
}

/**
 * The real sign-in service. Sessions use PKCE (no tokens in web addresses, and a code that only this browser can redeem), refresh by
 * themselves, and live under one storage key. This file is loaded only when accounts are set up AND someone needs them.
 */
export async function createSupabaseBackend(url: string, anonKey: string): Promise<AuthBackend> {
  const { createClient } = await import('@supabase/supabase-js')
  const storage = typeof localStorage === 'undefined' ? undefined : localStorage
  const client = createClient(url, anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: SESSION_KEY, storage },
  })
  const auth = client.auth
  const fail = (error: unknown): void => {
    if (error) throw toFailure(error)
  }

  return {
    db: accountDb(client),

    async getSession() {
      const { data, error } = await auth.getSession()
      if (data.session?.user) return { user: mapUser(data.session.user) }
      return error ? { user: null, error: toFailure(error) } : { user: null }
    },

    onChange(cb) {
      const { data } = auth.onAuthStateChange((event, session) => {
        // Returning from Google can announce itself as the first "initial session": treat it as a sign-in when it carries the Google token.
        const mapped = EVENTS[event] ?? (event === 'INITIAL_SESSION' && session?.provider_token ? 'SIGNED_IN' : undefined)
        if (mapped) cb(mapped, session?.user ? mapUser(session.user) : null, session?.provider_token ? { providerToken: session.provider_token } : undefined)
      })
      return () => data.subscription.unsubscribe()
    },

    async sendCode(email, captchaToken) {
      const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true, captchaToken, emailRedirectTo: typeof location === 'undefined' ? undefined : location.origin } })
      fail(error)
    },

    async verifyCode(email, code) {
      const { error } = await auth.verifyOtp({ email, token: code, type: 'email' })
      fail(error)
    },

    async signInPassword(email, password, captchaToken) {
      const { error } = await auth.signInWithPassword({ email, password, options: { captchaToken } })
      fail(error)
    },

    async signUp(email, password, redirectTo, captchaToken) {
      const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: redirectTo, captchaToken } })
      fail(error)
      return { needsConfirmation: !data.session }
    },

    async resendConfirmation(email, redirectTo, captchaToken) {
      const { error } = await auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo, captchaToken } })
      fail(error)
    },

    async sendReset(email, redirectTo, captchaToken) {
      const { error } = await auth.resetPasswordForEmail(email, { redirectTo, captchaToken })
      fail(error)
    },

    async setPassword(password) {
      const { error } = await auth.updateUser({ password })
      fail(error)
    },

    async signInGoogle(redirectTo) {
      // select_account: always show Google's account chooser, so on a shared computer the wrong account is never picked silently.
      // The Drive permission (only drive.file) is asked for in the SAME consent screen, so nothing more is needed afterwards.
      const { error } = await auth.signInWithOAuth({ provider: 'google', options: { redirectTo, scopes: DRIVE_SCOPE, queryParams: { prompt: 'select_account' } } })
      fail(error)
    },

    async linkGoogle(redirectTo) {
      const { error } = await auth.linkIdentity({ provider: 'google', options: { redirectTo, queryParams: { prompt: 'select_account' } } })
      fail(error)
    },

    async unlink(provider) {
      const { data, error } = await auth.getUserIdentities()
      fail(error)
      const identity = data?.identities.find((i) => i.provider === provider)
      if (!identity) return
      const res = await auth.unlinkIdentity(identity)
      fail(res.error)
    },

    async signOut(scope) {
      const { error } = await auth.signOut({ scope })
      if (!error) return
      if (scope === 'local') {
        // Could not tell the server (offline): the sign-in on THIS device must still go.
        try {
          for (const k of Object.keys(localStorage)) if (k === SESSION_KEY || k.startsWith(`${SESSION_KEY}-`)) localStorage.removeItem(k)
        } catch {
          /* ignore */
        }
        return
      }
      throw toFailure(error)
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account')
      fail(error)
    },
  }
}
