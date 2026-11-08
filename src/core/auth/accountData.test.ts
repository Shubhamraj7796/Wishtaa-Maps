// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSync } from './accountSync'
import { ResendGate } from './cooldown'
import { toFailure } from './errors'
import { FakeBackend } from './fakeBackend'
import { checkPassword, normalizeEmail, passwordOk, validEmail } from './passwords'
import { PREFS_VERSION, pickPrefs, samePrefs, sanitizePrefs } from './prefs'
import type { RecentRow } from './types'

function memory() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), has: (k: string) => m.has(k), size: () => m.size }
}
const row = (ref: string, title = ref): RecentRow => ({ file_ref: ref, title, storage_kind: 'local', drive_file_id: null, last_opened: '2026-11-08T10:00:00.000Z' })

let backend: FakeBackend
beforeEach(async () => {
  backend = new FakeBackend()
  backend.sessionFor('x')
  await backend.sendCode('a@example.com')
  await backend.verifyCode('a@example.com', '123456')
})
const uid = () => backend.current?.id as string

describe('the account queue (recent files, preferences, Drive link)', () => {
  it('sends changes after a short wait, one request for a burst, newest title wins', async () => {
    const spy = vi.spyOn(backend.db, 'upsertRecent')
    const s = new AccountSync(backend.db, uid(), { delayMs: 10 })
    s.recent(row('f1', 'Old title'))
    s.recent(row('f1', 'New title'))
    s.recent(row('f2'))
    await new Promise((r) => setTimeout(r, 40))
    expect(spy).toHaveBeenCalledTimes(1)
    expect([...(backend.recents.get(uid())?.values() ?? [])].map((r) => r.title).sort()).toEqual(['New title', 'f2'])
    expect(s.pending()).toBe(0)
  })

  it('keeps changes made offline, across a reload, and sends them when the connection is back', async () => {
    const store = memory()
    backend.offline = true
    const first = new AccountSync(backend.db, uid(), { storage: store, delayMs: 5 })
    first.recent(row('f1'))
    first.prefs(PREFS_VERSION, { theme: 'dark' })
    await first.flush()
    expect(first.pending()).toBe(2)
    first.stop()

    const reloaded = new AccountSync(backend.db, uid(), { storage: store, delayMs: 5 }) // a new page load
    expect(reloaded.pending()).toBe(2)
    backend.offline = false
    await reloaded.flush()
    expect(reloaded.pending()).toBe(0)
    expect(backend.prefs.get(uid())?.data).toEqual({ theme: 'dark' })
    expect(backend.recents.get(uid())?.has('f1')).toBe(true)
    expect(store.has(`wishtaamaps:acct-queue:${uid()}`)).toBe(false)
  })

  it('goes out by itself when the browser says it is online again', async () => {
    backend.offline = true
    const s = new AccountSync(backend.db, uid(), { delayMs: 5 })
    s.start()
    s.recent(row('f1'))
    await new Promise((r) => setTimeout(r, 30))
    expect(s.pending()).toBe(1)
    backend.offline = false
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(s.pending()).toBe(0))
    s.stop()
  })

  it('a change the service refuses is dropped (and reported), not retried forever', async () => {
    const onRejected = vi.fn()
    backend.db.upsertRecent = async () => {
      throw { code: 'validation_failed', message: 'check constraint' }
    }
    const s = new AccountSync(backend.db, uid(), { delayMs: 5, onRejected })
    s.recent(row('f1'))
    await s.flush()
    expect(s.pending()).toBe(0)
    expect(onRejected).toHaveBeenCalledWith('recent files', expect.any(String))
  })

  it('queues are per account, and sign-out forgets this account\'s queue', async () => {
    const store = memory()
    backend.offline = true
    const a = new AccountSync(backend.db, 'user-a', { storage: store })
    a.recent(row('secret-title'))
    const b = new AccountSync(backend.db, 'user-b', { storage: store })
    expect(b.pending()).toBe(0)
    a.clear()
    expect(store.size()).toBe(0)
    expect(new AccountSync(backend.db, 'user-a', { storage: store }).pending()).toBe(0)
  })

  it('the account store only answers for the signed-in person (as row-level security does)', async () => {
    await backend.db.upsertRecent(uid(), [row('mine')])
    await expect(backend.db.listRecent('someone-else', 10)).rejects.toBeTruthy()
    await expect(backend.db.upsertRecent('someone-else', [row('x')])).rejects.toBeTruthy()
  })
})

describe('preferences that follow the account', () => {
  it('keeps only known keys with allowed values', () => {
    expect(sanitizePrefs({ theme: 'dark', mouseWheel: 'sideways', openAllReadOnly: true, pauseOnDataSaver: 'yes', evil: '<script>', panelMode: 'manual' })).toEqual({ theme: 'dark', openAllReadOnly: true, panelMode: 'manual' })
    expect(sanitizePrefs(null)).toEqual({})
    expect(sanitizePrefs('x')).toEqual({})
  })
  it('picks the synced ones out of the whole store and compares them', () => {
    const state = { theme: 'light', mouseWheel: 'move', wheelHintSeen: true, panelPinned: true, toggleTheme: () => undefined }
    expect(pickPrefs(state)).toEqual({ theme: 'light', mouseWheel: 'move' })
    expect(samePrefs({ theme: 'dark', mouseWheel: 'zoom' }, { mouseWheel: 'zoom', theme: 'dark' })).toBe(true)
    expect(samePrefs({ theme: 'dark' }, { theme: 'light' })).toBe(false)
  })
})

describe('passwords, emails, cooldown, error messages', () => {
  it('shows each password rule and accepts a strong password', () => {
    expect(checkPassword('short', '').map((r) => r.ok)).toEqual([false, false, false, true])
    expect(passwordOk('Correct-horse-1')).toBe(true)
    expect(passwordOk('alllowercase123')).toBe(false)
    expect(passwordOk('Password12345')).toBe(false) // a common password
    expect(passwordOk('Alicewonder-123', 'alicewonder@example.com')).toBe(false) // contains the email
  })
  it('recognises emails and tidies them', () => {
    expect(['a@b.co', 'first.last+tag@sub.example.org'].every(validEmail)).toBe(true)
    expect(['a@b', 'a b@c.com', '@x.com', ''].some(validEmail)).toBe(false)
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com')
  })
  it('the resend wait counts down from the moment of sending', () => {
    let t = 1000
    const gate = new ResendGate(memory(), () => t, 30)
    expect(gate.remaining('a@b.co')).toBe(0)
    gate.mark('a@b.co')
    expect(gate.remaining('a@b.co')).toBe(30)
    t += 29_500
    expect(gate.remaining('a@b.co')).toBe(1)
    t += 1000
    expect(gate.remaining('a@b.co')).toBe(0)
  })
  it('turns service errors into plain sentences that never include server text', () => {
    expect(toFailure({ code: 'invalid_credentials', message: 'Invalid login credentials' }).kind).toBe('invalid')
    expect(toFailure({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }).kind).toBe('rate')
    expect(toFailure({ code: 'captcha_failed', message: 'captcha verification process failed' }).kind).toBe('captcha')
    expect(toFailure({ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }).kind).toBe('network')
    expect(toFailure({ code: 'refresh_token_not_found', message: 'x' }).kind).toBe('session')
    const odd = toFailure({ code: 'something_new', message: 'secret internal detail eyJhbGciOi...' })
    expect(odd.message).not.toMatch(/eyJ|internal/)
  })
})
