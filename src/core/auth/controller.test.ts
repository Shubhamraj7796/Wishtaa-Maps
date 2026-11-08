// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthController, HINT_KEY, OWNER_KEY, type AccountHooks } from './controller'
import { FakeBackend } from './fakeBackend'
import { AuthFailure } from './types'

function memory() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    keys: () => [...m.keys()],
  }
}

let backend: FakeBackend
let storage: ReturnType<typeof memory>
let hookLog: string[]
let clock: number
const hooks: AccountHooks = {
  clearAccountData: async (reason) => void hookLog.push(`clear:${reason}`),
  signedIn: (u, info) => void hookLog.push(`in:${u.email}:${info.newBrowserUser ? 'new' : 'again'}`),
}
const make = (over: { returning?: boolean; load?: boolean } = {}) =>
  new AuthController(over.load === false ? null : async () => backend, { storage, sessionStorage: memory(), hooks, now: () => clock, siteUrl: () => 'https://maps.wishtaa.com', returning: over.returning })

beforeEach(() => {
  backend = new FakeBackend()
  storage = memory()
  hookLog = []
  clock = 1_000_000
})

describe('sign in with an emailed code', () => {
  it('sends a code, accepts it, and the person is signed in on every screen', async () => {
    const a = make()
    await a.init()
    expect(a.state.status).toBe('signed-out')
    await a.sendCode('  Alice@Example.com ')
    expect(backend.codes.get('alice@example.com')).toBe('123456')
    await a.verifyCode('alice@example.com', '123 456')
    expect(a.state).toMatchObject({ status: 'signed-in', user: { email: 'alice@example.com' } })
    expect(hookLog).toEqual(['in:alice@example.com:new'])
    expect(JSON.parse(storage.getItem(HINT_KEY) as string).email).toBe('alice@example.com')
    expect(storage.getItem(OWNER_KEY)).toBe(a.state.user?.id)
  })

  it('says plainly when the code is wrong, short, or not a number, and stays signed out', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await expect(a.verifyCode('a@example.com', '000000')).rejects.toMatchObject({ kind: 'invalid', message: expect.stringMatching(/expired|not valid/i) })
    await expect(a.verifyCode('a@example.com', '12ab')).rejects.toMatchObject({ kind: 'invalid', message: expect.stringMatching(/6-digit/) })
    expect(a.state.status).toBe('signed-out')
  })

  it('rejects an address that is not an email before asking the service', async () => {
    const a = make()
    await expect(a.sendCode('not-an-email')).rejects.toMatchObject({ kind: 'invalid' })
    expect(backend.calls).toEqual([])
  })

  it('makes the person wait before a new code, per address, and the wait survives a reload of the page', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await expect(a.sendCode('a@example.com')).rejects.toMatchObject({ kind: 'cooldown', retryAfter: 30 })
    expect(a.resendIn('A@example.com')).toBe(30)
    await a.sendCode('b@example.com') // another address is not held up
    clock += 12_000
    expect(a.resendIn('a@example.com')).toBe(18)
    clock += 18_000
    await expect(a.sendCode('a@example.com')).resolves.toBeUndefined()
    expect(backend.calls.filter((c) => c === 'sendCode')).toHaveLength(3)
  })

  it('a failed request does not start the wait', async () => {
    const a = make()
    backend.offline = true
    await expect(a.sendCode('a@example.com')).rejects.toMatchObject({ kind: 'network' })
    expect(a.resendIn('a@example.com')).toBe(0)
  })
})

describe('email and password', () => {
  it('creating an account asks for confirmation first, then signing in works', async () => {
    const a = make()
    expect(await a.signUp('p@example.com', 'Correct-horse-1')).toBe('confirm')
    expect(a.state.status).toBe('signed-out')
    await expect(a.signInPassword('p@example.com', 'Correct-horse-1')).rejects.toMatchObject({ kind: 'unconfirmed' })
    backend.confirm('p@example.com')
    await a.signInPassword('p@example.com', 'Correct-horse-1')
    expect(a.state.status).toBe('signed-in')
  })

  it('a wrong password gets one clear message that does not reveal whether the email exists', async () => {
    const a = make()
    await a.signUp('p@example.com', 'Correct-horse-1')
    backend.confirm('p@example.com')
    const wrong = await a.signInPassword('p@example.com', 'nope').catch((e: AuthFailure) => e)
    const unknown = await a.signInPassword('nobody@example.com', 'nope').catch((e: AuthFailure) => e)
    expect((wrong as AuthFailure).message).toBe((unknown as AuthFailure).message)
    expect((wrong as AuthFailure).kind).toBe('invalid')
  })

  it('reset: the link opens a recovery state, a new password ends it', async () => {
    const a = make()
    await a.signUp('p@example.com', 'Correct-horse-1')
    backend.confirm('p@example.com')
    await a.forgotPassword('p@example.com')
    expect(backend.codes.has('reset:p@example.com')).toBe(true)
    await a.init()
    backend.sessionFor('p@example.com')
    backend.emitRecovery()
    await vi.waitFor(() => expect(a.state.recovery).toBe(true))
    await a.setPassword('Another-horse-2')
    expect(a.state.recovery).toBe(false)
    expect(backend.users.get('p@example.com')?.password).toBe('Another-horse-2')
  })

  it('the new password may not be the same as the old one', async () => {
    const a = make()
    await a.signUp('p@example.com', 'Correct-horse-1')
    backend.confirm('p@example.com')
    await a.signInPassword('p@example.com', 'Correct-horse-1')
    await expect(a.setPassword('Correct-horse-1')).rejects.toMatchObject({ kind: 'weak-password' })
  })
})

describe('one account per email, whichever way the person signs in', () => {
  it('code, then password, then Google: always the same account and the methods add up', async () => {
    const a = make()
    await a.sendCode('same@example.com')
    await a.verifyCode('same@example.com', '123456')
    const id = a.state.user?.id
    await a.setPassword('Correct-horse-1')
    expect(a.state.user?.providers).toEqual(['email'])
    await a.signOut()

    backend.completeGoogle('Same@Example.com')
    await a.init()
    await vi.waitFor(() => expect(a.state.status).toBe('signed-in'))
    expect(a.state.user?.id).toBe(id)
    expect(a.state.user?.providers.sort()).toEqual(['email', 'google'])
    expect(backend.users.size).toBe(1)
  })

  it('Google first, then an emailed code for the same address, signs into the same account', async () => {
    const a = make()
    backend.completeGoogle('g@example.com')
    await a.init()
    const id = backend.current?.id
    await a.signOut()
    await a.sendCode('g@example.com')
    await a.verifyCode('g@example.com', '123456')
    expect(a.state.user?.id).toBe(id)
    expect(backend.users.size).toBe(1)
  })

  it('a password sign-up for an address that already has an account makes no second account', async () => {
    const a = make()
    backend.completeGoogle('dup@example.com')
    await a.signUp('dup@example.com', 'Correct-horse-1')
    expect(backend.users.size).toBe(1)
  })

  it('never removes the last way to sign in', async () => {
    const a = make()
    await a.sendCode('m@example.com')
    await a.verifyCode('m@example.com', '123456')
    await expect(a.unlink('email')).rejects.toMatchObject({ kind: 'last-method' })
    expect(backend.calls).not.toContain('unlink:email')

    backend.completeGoogle('m@example.com')
    await a.refreshUser()
    expect(a.state.user?.providers.sort()).toEqual(['email', 'google'])
    await a.unlink('google')
    expect(a.state.user?.providers).toEqual(['email'])
    await expect(a.unlink('email')).rejects.toBeInstanceOf(AuthFailure)
  })
})

describe('sign out and the next person on the same browser', () => {
  it('signing out clears the account data in this browser but keeps guest files, and forgets who was here', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await a.verifyCode('a@example.com', '123456')
    await a.signOut()
    expect(a.state.status).toBe('signed-out')
    expect(hookLog).toContain('clear:sign-out')
    expect(storage.getItem(HINT_KEY)).toBeNull()
    expect(storage.getItem(OWNER_KEY)).toBeNull()
    expect(backend.calls).toContain('signOut:local')
  })

  it('still signs out on this device when the service cannot be reached', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await a.verifyCode('a@example.com', '123456')
    backend.signOut = async () => {
      throw { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }
    }
    await a.signOut()
    expect(a.state.status).toBe('signed-out')
    expect(hookLog).toContain('clear:sign-out')
  })

  it('"all devices" needs a connection and says so instead of pretending', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await a.verifyCode('a@example.com', '123456')
    backend.offline = true
    await expect(a.signOut({ everywhere: true })).rejects.toMatchObject({ kind: 'network' })
    expect(a.state.status).toBe('signed-in')
    backend.offline = false
    await a.signOut({ everywhere: true })
    expect(backend.calls).toContain('signOut:global')
    expect(a.state.status).toBe('signed-out')
  })

  it('a different person signing in on the same browser first clears the previous person\'s caches', async () => {
    const a = make()
    await a.sendCode('first@example.com')
    await a.verifyCode('first@example.com', '123456')
    // The first person left without signing out (their sign-in expired); someone else signs in.
    backend.revokeSession()
    await vi.waitFor(() => expect(a.state.status).toBe('expired'))
    hookLog.length = 0
    await a.sendCode('second@example.com')
    await a.verifyCode('second@example.com', '123456')
    expect(hookLog).toEqual(['clear:other-user', 'in:second@example.com:new'])
    expect(storage.getItem(OWNER_KEY)).toBe(a.state.user?.id)
  })

  it('the same person signing in again keeps their caches', async () => {
    const a = make()
    await a.sendCode('first@example.com')
    await a.verifyCode('first@example.com', '123456')
    backend.revokeSession()
    await vi.waitFor(() => expect(a.state.status).toBe('expired'))
    hookLog.length = 0
    clock += 31_000
    await a.sendCode('first@example.com')
    await a.verifyCode('first@example.com', '123456')
    expect(hookLog).toEqual(['in:first@example.com:again'])
  })
})

describe('sessions: expiry, offline, restart', () => {
  it('a sign-in that stops working becomes "sign in again", with the email ready and nothing cleared', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await a.verifyCode('a@example.com', '123456')
    hookLog.length = 0
    backend.revokeSession()
    await vi.waitFor(() => expect(a.state.status).toBe('expired'))
    expect(a.state).toMatchObject({ user: null, expiredEmail: 'a@example.com' })
    expect(hookLog).toEqual([]) // local files and caches are untouched
    a.dismissExpired()
    expect(a.state.status).toBe('signed-out')
  })

  it('opens signed in from what was remembered, and stays signed in while offline', async () => {
    const first = make()
    await first.sendCode('a@example.com')
    await first.verifyCode('a@example.com', '123456')
    backend.offline = true
    const again = make()
    expect(again.state).toMatchObject({ status: 'signed-in', user: { email: 'a@example.com' } })
    await again.init()
    expect(again.state).toMatchObject({ status: 'signed-in', offline: true })
  })

  it('checks again when the connection returns, and learns the sign-in is gone', async () => {
    const first = make()
    await first.sendCode('a@example.com')
    await first.verifyCode('a@example.com', '123456')
    backend.offline = true
    const again = make()
    await again.init()
    expect(again.state.offline).toBe(true)
    backend.offline = false
    backend.current = null // revoked while we were away
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(again.state.status).toBe('expired'))
    expect(again.state.offline).toBe(false)
  })

  it('opens still signed in when the saved sign-in is good', async () => {
    const first = make()
    await first.sendCode('a@example.com')
    await first.verifyCode('a@example.com', '123456')
    const again = make()
    await again.init()
    expect(again.state).toMatchObject({ status: 'signed-in', offline: false })
  })

  it('shows "checking" while a return from Google or an email link is processed, then settles', async () => {
    const a = make({ returning: true })
    expect(a.state.status).toBe('loading')
    await a.init()
    expect(a.state.status).toBe('signed-out')
  })
})

describe('accounts not set up / profile / delete', () => {
  it('without Supabase settings everything is guest mode and nothing is attempted', async () => {
    const a = make({ load: false })
    expect(a.state.status).toBe('disabled')
    await a.init()
    await expect(a.sendCode('a@example.com')).rejects.toMatchObject({ kind: 'config' })
  })

  it('changing the display name saves it and updates the screen', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await a.verifyCode('a@example.com', '123456')
    await a.updateDisplayName('  Alice A  ')
    expect(a.state.user?.name).toBe('Alice A')
    expect(backend.profiles.get(a.state.user?.id as string)).toBe('Alice A')
    await expect(a.updateDisplayName('   ')).rejects.toMatchObject({ kind: 'invalid' })
  })

  it('deleting the account removes it and signs out here', async () => {
    const a = make()
    await a.sendCode('a@example.com')
    await a.verifyCode('a@example.com', '123456')
    await a.deleteAccount()
    expect(backend.users.size).toBe(0)
    expect(a.state.status).toBe('signed-out')
    expect(hookLog).toContain('clear:sign-out')
  })
})
