import { beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend } from '../auth/fakeBackend'
import { clearRef, readRef, referralLink, refFromSearch, REF_DAYS, REF_KEY, rememberRef, searchWithoutRef } from './capture'
import { claimStoredReferral } from './claim'

const memory = (): Storage => {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size } }
}
const DAY = 86_400_000

describe('remembering a code from a link', () => {
  it('reads ?ref= in any case and ignores everything that is not a good code', () => {
    expect(refFromSearch('?ref=abcd2345')).toBe('ABCD2345')
    expect(refFromSearch('?x=1&ref=ABCD2345&y=2')).toBe('ABCD2345')
    for (const bad of ['', '?ref=', '?ref=ABCD234', '?ref=ABCD2340', '?ref=<script>', '?other=ABCD2345']) expect(refFromSearch(bad)).toBeNull()
  })
  it('takes ref out of the address and leaves the rest', () => {
    expect(searchWithoutRef('?ref=ABCD2345')).toBe('')
    expect(searchWithoutRef('?code=g1&ref=ABCD2345')).toBe('?code=g1')
    expect(searchWithoutRef('?code=g1')).toBeNull()
  })
  it('keeps the code for 30 days, then forgets it', () => {
    const s = memory()
    const t0 = 1_800_000_000_000
    rememberRef('abcd2345', s, t0)
    expect(readRef(s, t0 + 29 * DAY)).toBe('ABCD2345')
    expect(REF_DAYS).toBe(30)
    expect(readRef(s, t0 + 31 * DAY)).toBeNull()
    expect(s.getItem(REF_KEY)).toBeNull() // the expired one is removed
  })
  it('a bad link never wipes a good remembered code; the newest good link wins', () => {
    const s = memory()
    rememberRef('ABCD2345', s, 1000)
    rememberRef('nonsense', s, 2000)
    expect(readRef(s, 3000)).toBe('ABCD2345')
    rememberRef('WXYZ6789', s, 4000)
    expect(readRef(s, 5000)).toBe('WXYZ6789')
  })
  it('survives broken storage and tampered values', () => {
    expect(readRef(undefined)).toBeNull()
    expect(rememberRef('ABCD2345', undefined)).toBeNull()
    const s = memory()
    s.setItem(REF_KEY, '{not json')
    expect(readRef(s)).toBeNull()
    s.setItem(REF_KEY, JSON.stringify({ code: 'ABCD2345', savedAt: Date.now() + 40 * DAY })) // a date far in the future
    expect(readRef(s)).toBeNull()
  })
  it('builds the link with no trailing slash problems', () => {
    expect(referralLink('https://maps.wishtaa.com/', 'ABCD2345')).toBe('https://maps.wishtaa.com/?ref=ABCD2345')
  })
})

describe('attaching the code after sign-in', () => {
  let b: FakeBackend
  let storage: Storage
  beforeEach(() => {
    b = new FakeBackend()
    storage = memory()
  })
  const signUpAs = (email: string) => b.completeGoogle(email)

  it('does nothing when no code was remembered', async () => {
    signUpAs('new@example.com')
    expect(await claimStoredReferral(b.db, storage)).toBeNull()
  })

  it('attaches a good code once, then forgets it', async () => {
    signUpAs('friend@example.com')
    const code = b.codeFor('friend@example.com')
    signUpAs('new@example.com')
    rememberRef(code, storage)
    expect(await claimStoredReferral(b.db, storage)).toBe('claimed')
    expect(readRef(storage)).toBeNull()
    expect((await b.db.referralSummary())?.invitedByFriend).toBe(true)
    // asking again does nothing more
    rememberRef(code, storage)
    expect(await claimStoredReferral(b.db, storage)).toBe('ignored')
    expect(readRef(storage)).toBeNull()
  })

  it('an unknown code and the persons own code are ignored quietly and forgotten', async () => {
    signUpAs('new@example.com')
    rememberRef('ZZZZZZZZ', storage)
    expect(await claimStoredReferral(b.db, storage)).toBe('ignored')
    expect(readRef(storage)).toBeNull()
    rememberRef(b.codeFor('new@example.com'), storage)
    expect(await claimStoredReferral(b.db, storage)).toBe('ignored')
    expect((await b.db.referralSummary())?.invitedByFriend).toBe(false)
  })

  it('an expired code is never sent', async () => {
    signUpAs('friend@example.com')
    const code = b.codeFor('friend@example.com')
    signUpAs('new@example.com')
    rememberRef(code, storage, Date.now() - 31 * DAY)
    expect(await claimStoredReferral(b.db, storage)).toBeNull()
  })

  it('keeps the code when the network is down, so the next sign-in can try again', async () => {
    signUpAs('friend@example.com')
    const code = b.codeFor('friend@example.com')
    signUpAs('new@example.com')
    rememberRef(code, storage)
    b.offline = true
    expect(await claimStoredReferral(b.db, storage)).toBeNull()
    expect(readRef(storage)).toBe(code)
    b.offline = false
    expect(await claimStoredReferral(b.db, storage)).toBe('claimed')
  })

  it('clearRef is harmless with nothing stored', () => {
    expect(() => clearRef(storage)).not.toThrow()
    expect(() => clearRef(undefined)).not.toThrow()
  })
})
