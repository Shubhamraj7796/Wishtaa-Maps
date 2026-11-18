import { describe, expect, it } from 'vitest'
import { addMonthsUtc, bonusRoom, cleanReferralCode, DEFAULT_PLAN_SETTINGS as S, freeUntil, hasPro, totalMonths } from './plan'

const d = (s: string) => new Date(s)
const iso = (x: Date | null) => x?.toISOString().slice(0, 10)

describe('adding calendar months', () => {
  it('cuts the day at the end of a shorter month', () => {
    expect(iso(addMonthsUtc(d('2027-01-31T10:00:00Z'), 1))).toBe('2027-02-28')
    expect(iso(addMonthsUtc(d('2028-01-31T10:00:00Z'), 1))).toBe('2028-02-29') // leap year
    expect(iso(addMonthsUtc(d('2027-03-31T00:00:00Z'), 1))).toBe('2027-04-30')
    expect(iso(addMonthsUtc(d('2027-11-30T00:00:00Z'), 3))).toBe('2028-02-29')
  })
  it('adds in one step from the start date, so no day is lost twice', () => {
    expect(iso(addMonthsUtc(d('2027-01-31T00:00:00Z'), 2))).toBe('2027-03-31')
    expect(iso(addMonthsUtc(d('2027-08-31T00:00:00Z'), 6))).toBe('2028-02-29')
  })
  it('crosses years and keeps the time of day', () => {
    expect(addMonthsUtc(d('2027-10-15T13:45:10Z'), 6).toISOString()).toBe('2028-04-15T13:45:10.000Z')
    expect(iso(addMonthsUtc(d('2027-12-01T00:00:00Z'), 24))).toBe('2029-12-01')
    expect(iso(addMonthsUtc(d('2027-12-01T00:00:00Z'), 0))).toBe('2027-12-01')
  })
  it('does not change the date it was given and refuses part months', () => {
    const from = d('2027-01-31T00:00:00Z')
    addMonthsUtc(from, 1)
    expect(from.toISOString()).toBe('2027-01-31T00:00:00.000Z')
    expect(() => addMonthsUtc(from, 1.5)).toThrow()
  })
})

describe('the cap and the free period (founding members, option 2)', () => {
  it('standard is 6 months, each referral month adds on top, 24 is the most', () => {
    expect(totalMonths(0)).toBe(6)
    expect(totalMonths(3)).toBe(9)
    expect(totalMonths(18)).toBe(24)
    expect(totalMonths(19)).toBe(24)
    expect(totalMonths(500)).toBe(24)
    expect(totalMonths(-4)).toBe(6)
  })
  it('says how many referral months still fit', () => {
    expect(bonusRoom(0)).toBe(18)
    expect(bonusRoom(17)).toBe(1)
    expect(bonusRoom(18)).toBe(0)
    expect(bonusRoom(40)).toBe(0)
  })
  it('a founding member has no end date until the launch date is set, then it counts from the launch date', () => {
    expect(freeUntil(null, 2)).toBeNull()
    expect(iso(freeUntil(null, 2, { ...S, launchDate: d('2027-03-01T00:00:00Z') }))).toBe('2027-11-01') // 6 + 2 months
  })
  it('someone who joined after launch counts from the sign-up day, and stops at the cap', () => {
    const s = { ...S, launchDate: d('2027-03-01T00:00:00Z') }
    expect(iso(freeUntil(d('2027-08-31T00:00:00Z'), 0, s))).toBe('2028-02-29')
    expect(iso(freeUntil(d('2027-08-31T00:00:00Z'), 99, s))).toBe('2029-08-31') // 24 months, not 105
  })
  it('the numbers come from the settings, nothing is fixed in the arithmetic', () => {
    const s = { ...S, freeMonthsStandard: 3, maxTotalMonths: 5, monthsPerReferral: 2 }
    expect(totalMonths(10, s)).toBe(5)
    expect(bonusRoom(1, s)).toBe(1)
  })
})

describe('hasPro: one place, nothing locked today', () => {
  const now = d('2027-06-01T00:00:00Z')
  it('is false for no plan, a free plan, and a finished free period', () => {
    expect(hasPro(null, now)).toBe(false)
    expect(hasPro({ plan: 'free', freeUntil: null }, now)).toBe(false)
    expect(hasPro({ plan: 'pro', freeUntil: '2027-05-31T23:59:59Z' }, now)).toBe(false)
  })
  it('is true for a founding member and while the free period runs', () => {
    expect(hasPro({ plan: 'pro', freeUntil: null }, now)).toBe(true)
    expect(hasPro({ plan: 'pro', freeUntil: '2027-06-02T00:00:00Z' }, now)).toBe(true)
  })
  it('a date that cannot be read is not Pro', () => {
    expect(hasPro({ plan: 'pro', freeUntil: 'nonsense' }, now)).toBe(false)
  })
})

describe('referral codes read from a link', () => {
  it('accepts 8 allowed characters in any case and refuses everything else', () => {
    expect(cleanReferralCode(' abcd2345 ')).toBe('ABCD2345')
    for (const bad of ['', 'ABCD234', 'ABCD23456', 'ABCD234O', 'ABCD234I', 'ABCD-345', null, undefined, 12345678, '<script>'])
      expect(cleanReferralCode(bad)).toBeNull()
  })
})
