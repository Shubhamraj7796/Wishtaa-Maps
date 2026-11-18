import { cleanReferralCode, DEFAULT_PLAN_SETTINGS, type ClaimResult, type FirstMapResult, type MyPlan, type ReferralSummary } from '../plan'
import { AuthFailure, type AccountDb, type AuthBackend, type AuthUser, type BackendEvent, type DriveLinkRow, type PrefsRow, type Provider, type RecentRow } from './types'

interface FakeUser {
  id: string
  email: string
  providers: Set<Provider>
  password?: string
  confirmed: boolean
  name: string
  googleEmail?: string
}

/**
 * A stand-in for the sign-in service that behaves like Supabase where it matters: one account per verified email whichever way the
 * person signs in, one-time codes, sessions that can be revoked, a network that can be switched off, and an account store that only
 * answers for the signed-in person (as row-level security does). For tests.
 */
export class FakeBackend implements AuthBackend {
  users = new Map<string, FakeUser>()
  current: FakeUser | null = null
  offline = false
  codes = new Map<string, string>()
  calls: string[] = []
  private listeners = new Set<(e: BackendEvent, u: AuthUser | null, extra?: { providerToken?: string }) => void>()
  private seq = 0
  recents = new Map<string, Map<string, RecentRow>>()
  prefs = new Map<string, PrefsRow>()
  driveLinks = new Map<string, DriveLinkRow>()
  profiles = new Map<string, string>()
  /** Referral stand-in (same rules as 0004_referrals.sql, simplified): codes, who invited whom, and the clock used for the waiting time. */
  refCodes = new Map<string, string>()
  invitedBy = new Map<string, { referrer: string; status: 'joined' | 'qualified' | 'rewarded'; qualifiedAt?: number }>()
  /** Test clock for the 7 day delay. */
  now = () => Date.now()
  db: AccountDb

  constructor() {
    const need = (uid: string) => {
      this.net()
      if (!this.current || this.current.id !== uid) throw { code: 'bad_jwt', message: 'not allowed' }
    }
    this.db = {
      getProfile: async (uid) => (need(uid), this.profiles.has(uid) ? { display_name: this.profiles.get(uid) as string, avatar_url: null } : null),
      setDisplayName: async (uid, name) => (need(uid), void this.profiles.set(uid, name)),
      getPrefs: async (uid) => (need(uid), this.prefs.get(uid) ?? null),
      putPrefs: async (uid, version, data) => (need(uid), void this.prefs.set(uid, { version, data: data as Record<string, unknown>, updated_at: new Date().toISOString() })),
      upsertRecent: async (uid, rows) => {
        need(uid)
        const m = this.recents.get(uid) ?? new Map<string, RecentRow>()
        for (const r of rows) m.set(r.file_ref, r)
        this.recents.set(uid, m)
      },
      listRecent: async (uid, limit) => (need(uid), [...(this.recents.get(uid)?.values() ?? [])].sort((a, b) => b.last_opened.localeCompare(a.last_opened)).slice(0, limit)),
      deleteRecent: async (uid, refs) => (need(uid), void refs.forEach((r) => this.recents.get(uid)?.delete(r))),
      getDriveLink: async (uid) => (need(uid), this.driveLinks.get(uid) ?? null),
      putDriveLink: async (uid, link) => (need(uid), void this.driveLinks.set(uid, link)),
      myPlan: async () => (this.net(), this.current ? this.planOf(this.current.id) : null),
      referralSummary: async () => (this.net(), this.current ? this.summaryOf(this.current.id) : null),
      claimReferral: async (code) => (this.net(), this.claim(code)),
      recordFirstMap: async (topics) => (this.net(), this.firstMap(topics)),
    }
  }

  private net() {
    if (this.offline) throw { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }
  }
  private log(call: string) {
    this.calls.push(call)
  }
  private view(u: FakeUser): AuthUser {
    return { id: u.id, email: u.email, name: u.name, avatarUrl: null, providers: [...u.providers], googleEmail: u.googleEmail ?? null }
  }
  private emit(e: BackendEvent, extra?: { providerToken?: string }) {
    const v = this.current ? this.view(this.current) : null
    this.listeners.forEach((l) => l(e, v, extra))
  }
  private find(email: string) {
    return this.users.get(email.toLowerCase())
  }
  private create(email: string, provider: Provider, confirmed: boolean): FakeUser {
    const u: FakeUser = { id: `user-${++this.seq}`, email: email.toLowerCase(), providers: new Set([provider]), confirmed, name: email.split('@')[0] ?? '' }
    this.users.set(u.email, u)
    return u
  }

  // ---- referral stand-in
  private codeOf(uid: string) {
    let c = this.refCodes.get(uid)
    if (!c) {
      c = `FAKE${String(this.refCodes.size + 1000).slice(-4)}`.replace(/[01]/g, '2')
      this.refCodes.set(uid, c)
    }
    return c
  }
  private rewardsDue(uid: string) {
    for (const r of this.invitedBy.values()) if (r.referrer === uid && r.status === 'qualified' && (r.qualifiedAt ?? 0) + DEFAULT_PLAN_SETTINGS.rewardDelayDays * 86_400_000 <= this.now()) r.status = 'rewarded'
  }
  private planOf(uid: string): MyPlan {
    this.rewardsDue(uid)
    const rewarded = [...this.invitedBy.values()].filter((r) => r.referrer === uid && r.status === 'rewarded').length
    const bonus = Math.min(rewarded * DEFAULT_PLAN_SETTINGS.monthsPerReferral, DEFAULT_PLAN_SETTINGS.maxTotalMonths - DEFAULT_PLAN_SETTINGS.freeMonthsStandard)
    return { plan: 'pro', source: bonus ? 'referral' : 'signup', freeUntil: null, founding: true, monthsTotal: DEFAULT_PLAN_SETTINGS.freeMonthsStandard + bonus, bonusMonths: bonus, capReached: bonus >= 18 }
  }
  private summaryOf(uid: string): ReferralSummary {
    const plan = this.planOf(uid)
    const mine = [...this.invitedBy.values()].filter((r) => r.referrer === uid)
    const mineAsInvited = this.invitedBy.get(uid)
    return {
      ...plan,
      code: this.codeOf(uid),
      invited: mine.length,
      joined: mine.length,
      successful: mine.filter((r) => r.status !== 'joined').length,
      waiting: mine.filter((r) => r.status === 'qualified').length,
      monthsEarned: plan.bonusMonths,
      invitedByFriend: !!mineAsInvited,
      awaitingFirstMap: mineAsInvited?.status === 'joined',
      minTopics: DEFAULT_PLAN_SETTINGS.minTopicsFirstMap,
    }
  }
  private claim(code: string): ClaimResult {
    const me = this.current
    const clean = cleanReferralCode(code)
    if (!me || !clean || this.invitedBy.has(me.id)) return 'ignored'
    const referrer = [...this.refCodes.entries()].find(([, c]) => c === clean)?.[0]
    if (!referrer || referrer === me.id) return 'ignored'
    this.invitedBy.set(me.id, { referrer, status: 'joined' })
    return 'claimed'
  }
  private firstMap(topics: number): FirstMapResult {
    const me = this.current
    const r = me ? this.invitedBy.get(me.id) : undefined
    if (!me || !r || r.status !== 'joined') return 'none'
    if (!me.confirmed || topics < DEFAULT_PLAN_SETTINGS.minTopicsFirstMap) return 'waiting'
    r.status = 'qualified'
    r.qualifiedAt = this.now()
    return 'qualified'
  }
  /** Test helper: this person's own referral code (made on first ask). */
  codeFor(email: string) {
    const u = this.find(email)
    return u ? this.codeOf(u.id) : ''
  }

  // ---- helpers for tests
  /** The person clicked the link in the confirmation email. */
  confirm(email: string) {
    const u = this.find(email)
    if (u) u.confirmed = true
  }
  /** The service revoked the session (signed out elsewhere, or it expired for good). */
  revokeSession() {
    this.current = null
    this.emit('SIGNED_OUT')
  }
  /** Google finished and sent the person back. The account for that email is reused, or made. */
  completeGoogle(email: string, name = 'Google Person', providerToken?: string) {
    const u = this.find(email) ?? this.create(email, 'google', true)
    u.providers.add('google')
    u.googleEmail = email.toLowerCase()
    u.confirmed = true
    u.name = name
    this.current = u
    this.emit('SIGNED_IN', providerToken ? { providerToken } : undefined)
  }
  sessionFor(email: string) {
    this.current = this.find(email) ?? null
  }
  emitRecovery() {
    this.emit('PASSWORD_RECOVERY')
  }

  // ---- AuthBackend
  async getSession() {
    try {
      this.net()
    } catch {
      return { user: null, error: new AuthFailure('network', 'offline') }
    }
    return { user: this.current ? this.view(this.current) : null }
  }
  onChange(cb: (e: BackendEvent, u: AuthUser | null, extra?: { providerToken?: string }) => void) {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }
  async sendCode(email: string) {
    this.log('sendCode')
    this.net()
    if (!this.find(email)) this.create(email, 'email', false)
    this.codes.set(email.toLowerCase(), '123456')
  }
  async verifyCode(email: string, code: string) {
    this.log('verifyCode')
    this.net()
    const u = this.find(email)
    if (!u || this.codes.get(email.toLowerCase()) !== code) throw { code: 'otp_expired', message: 'Token has expired or is invalid' }
    this.codes.delete(email.toLowerCase())
    u.confirmed = true
    u.providers.add('email')
    this.current = u
    this.emit('SIGNED_IN')
  }
  async signInPassword(email: string, password: string) {
    this.log('signInPassword')
    this.net()
    const u = this.find(email)
    if (!u || u.password !== password) throw { code: 'invalid_credentials', message: 'Invalid login credentials' }
    if (!u.confirmed) throw { code: 'email_not_confirmed', message: 'Email not confirmed' }
    this.current = u
    this.emit('SIGNED_IN')
  }
  async signUp(email: string, password: string) {
    this.log('signUp')
    this.net()
    const existing = this.find(email)
    if (existing) return { needsConfirmation: true } // like Supabase: no hint whether the address is already registered
    this.create(email, 'email', false).password = password
    return { needsConfirmation: true }
  }
  async resendConfirmation() {
    this.log('resendConfirmation')
    this.net()
  }
  async sendReset(email: string) {
    this.log('sendReset')
    this.net()
    this.codes.set(`reset:${email.toLowerCase()}`, 'link')
  }
  async setPassword(password: string) {
    this.log('setPassword')
    this.net()
    if (!this.current) throw { code: 'session_not_found', message: 'no session' }
    if (password === this.current.password) throw { code: 'same_password', message: 'same' }
    this.current.password = password
    this.current.providers.add('email')
    this.emit('USER_UPDATED')
  }
  async signInGoogle() {
    this.log('signInGoogle')
    this.net()
  }
  async linkGoogle() {
    this.log('linkGoogle')
    this.net()
  }
  async unlink(provider: Provider) {
    this.log(`unlink:${provider}`)
    this.net()
    this.current?.providers.delete(provider)
  }
  async signOut(scope: 'local' | 'global') {
    this.log(`signOut:${scope}`)
    if (scope === 'global') this.net()
    this.current = null
    this.emit('SIGNED_OUT')
  }
  async deleteAccount() {
    this.log('deleteAccount')
    this.net()
    if (this.current) this.users.delete(this.current.email)
    this.current = null
  }
}
