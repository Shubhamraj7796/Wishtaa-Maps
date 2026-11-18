/**
 * Free access and the "Pro" check. There is NO paid plan and no payment yet: "Pro" only covers FUTURE premium features, and nothing that
 * works today may ever be locked behind it. The numbers (6 months standard, 1 month per referral, cap 24, delay 7 days, 3 topics) are SETTINGS
 * kept in the database table `app_settings` (see supabase/migrations/0004_referrals.sql); the defaults here only mirror the seed values, for
 * tests and for the fake sign-in service. The database does the real arithmetic and enforces the cap; this file mirrors it so the screen
 * and the tests agree with it.
 */

export interface PlanSettings {
  /** Free months every new account gets (referred or not). */
  freeMonthsStandard: number
  /** Months added to the REFERRER for each successful referral. */
  monthsPerReferral: number
  /** The most free months in total (standard + referral months). */
  maxTotalMonths: number
  /** Days between "the friend saved a first real map" and the month being added. */
  rewardDelayDays: number
  /** A first map counts only with at least this many topics. */
  minTopicsFirstMap: number
  /** The day the founding members' free period starts counting. null until the owner sets it. */
  launchDate: Date | null
}

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  freeMonthsStandard: 6,
  monthsPerReferral: 1,
  maxTotalMonths: 24,
  rewardDelayDays: 7,
  minTopicsFirstMap: 3,
  launchDate: null,
}

export type PlanName = 'free' | 'pro'
export type PlanSource = 'signup' | 'referral' | 'manual'

/** What the database tells the signed-in person about their own plan (my_plan()). Dates are ISO strings or null. */
export interface MyPlan {
  plan: PlanName
  source: PlanSource
  /** The end of the free period. null = founding member, the owner has not set the launch date yet. */
  freeUntil: string | null
  founding: boolean
  monthsTotal: number
  bonusMonths: number
  capReached: boolean
}

/**
 * Adds whole calendar months in UTC. When the target month is shorter the day is cut to its last day
 * (31 Jan + 1 month = 28 or 29 Feb), the same rule PostgreSQL uses for `timestamp + interval 'n month'`.
 * It is always added to the START date in one step (not month by month), so 31 Jan + 2 months = 31 Mar.
 */
export function addMonthsUtc(from: Date, months: number): Date {
  if (!Number.isInteger(months)) throw new RangeError('months must be a whole number')
  const total = from.getUTCFullYear() * 12 + from.getUTCMonth() + months
  const year = Math.floor(total / 12)
  const month = ((total % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const out = new Date(from.getTime())
  out.setUTCDate(1)
  out.setUTCFullYear(year, month, Math.min(from.getUTCDate(), lastDay))
  return out
}

/** How many referral months can still be added before the cap (never negative). */
export function bonusRoom(bonusMonths: number, s: PlanSettings = DEFAULT_PLAN_SETTINGS, standardMonths = s.freeMonthsStandard): number {
  return Math.max(0, s.maxTotalMonths - standardMonths - bonusMonths)
}

/** Free months in total for a given number of referral months, never above the cap. */
export function totalMonths(bonusMonths: number, s: PlanSettings = DEFAULT_PLAN_SETTINGS, standardMonths = s.freeMonthsStandard): number {
  return Math.min(s.maxTotalMonths, standardMonths + Math.max(0, bonusMonths))
}

/**
 * The end of the free period (OPTION 2, founding members).
 * - `clockStart` null = a founding member: the months count from the launch date. Until the owner sets it there is no end date (null).
 * - `clockStart` set = joined after launch: the months count from that day.
 */
export function freeUntil(clockStart: Date | null, bonusMonths: number, s: PlanSettings = DEFAULT_PLAN_SETTINGS, standardMonths = s.freeMonthsStandard): Date | null {
  const start = clockStart ?? s.launchDate
  if (!start) return null
  return addMonthsUtc(start, totalMonths(bonusMonths, s, standardMonths))
}

/** The one place that decides "has Pro". For now it unlocks NOTHING that exists today (future premium features only). */
export function hasPro(p: Pick<MyPlan, 'plan' | 'freeUntil'> | null | undefined, now: Date = new Date()): boolean {
  if (!p || p.plan !== 'pro') return false
  if (p.freeUntil === null) return true // founding member, free period not started yet
  const end = Date.parse(p.freeUntil)
  return Number.isFinite(end) && end > now.getTime()
}

/** Cleans a referral code typed or read from a link: upper case, the allowed letters and digits only, exactly 8 characters, or null. */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export function cleanReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.trim().toUpperCase()
  return c.length === 8 && [...c].every((ch) => REFERRAL_ALPHABET.includes(ch)) ? c : null
}
