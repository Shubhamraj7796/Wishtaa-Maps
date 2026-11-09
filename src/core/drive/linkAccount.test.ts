import { describe, expect, it } from 'vitest'
import { DriveAuth, type Gis } from './auth'
import { DriveAccountError, DriveError } from './errors'
import { expectedDriveEmail, googleKey, linkDriveAccount, sameGoogleAccount } from './linkAccount'

describe('which Google account Drive must use', () => {
  it('recognises the same Google account however it is written', () => {
    expect(sameGoogleAccount('Sam@Gmail.com', 'sam@gmail.com')).toBe(true)
    expect(sameGoogleAccount('s.a.m@gmail.com', 'sam@googlemail.com')).toBe(true)
    expect(sameGoogleAccount('sam+work@gmail.com', 'sam@gmail.com')).toBe(true)
    expect(sameGoogleAccount('sam@gmail.com', 'other@gmail.com')).toBe(false)
    expect(sameGoogleAccount('sam@company.com', 'sam@gmail.com')).toBe(false)
    expect(sameGoogleAccount('a.b@company.com', 'ab@company.com')).toBe(false) // dots only count for Gmail
    expect(sameGoogleAccount(null, 'sam@gmail.com')).toBe(false)
    expect(googleKey(' Sam.Smith+x@GoogleMail.com ')).toBe('samsmith@gmail.com')
  })

  it('requires the Google address for a Google sign-in, a Gmail address for an email sign-in, and nothing for any other address', () => {
    expect(expectedDriveEmail({ email: 'sam@company.com', googleEmail: 'sam@gmail.com' })).toBe('sam@gmail.com')
    expect(expectedDriveEmail({ email: 'ann@gmail.com', googleEmail: null })).toBe('ann@gmail.com')
    expect(expectedDriveEmail({ email: 'ann@googlemail.com', googleEmail: null })).toBe('ann@googlemail.com')
    expect(expectedDriveEmail({ email: 'ann@company.com', googleEmail: null })).toBeNull()
    expect(expectedDriveEmail({ email: 'ann@notgmail.com', googleEmail: null })).toBeNull()
    expect(expectedDriveEmail(null)).toBeNull()
  })
})

describe('checking the account a Drive token belongs to', () => {
  function setup(driveEmail: string | null, displayName: string | null = 'Some Name') {
    const log: string[] = []
    let account: string | null | undefined
    const auth = {
      discard: async () => void log.push('discard'),
      setAccount: (a: string | null) => void (account = a),
    }
    const client = { accountEmail: async () => driveEmail, account: async () => driveEmail ?? displayName }
    return { auth, client, log, account: () => account }
  }

  it('keeps the token and records the account when it is the required one', async () => {
    const t = setup('Sam@gmail.com')
    expect(await linkDriveAccount(t, 'sam@gmail.com')).toBe('Sam@gmail.com')
    expect(t.log).toEqual([])
    expect(t.account()).toBe('Sam@gmail.com')
  })

  it('throws the token away and links nothing when it belongs to another account', async () => {
    const t = setup('other@gmail.com')
    const err = await linkDriveAccount(t, 'sam@gmail.com').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(DriveAccountError)
    expect(err).toMatchObject({ reason: 'mismatch', actual: 'other@gmail.com', expected: 'sam@gmail.com' })
    expect((err as Error).message).toBe('This Drive belongs to other@gmail.com. Please use the same Google account you signed in with (sam@gmail.com).')
    expect(t.log).toEqual(['discard'])
    expect(t.account()).toBeUndefined()
  })

  it('does not trust a display name: if the address cannot be read the token is not kept either', async () => {
    const t = setup(null, 'Sam Smith')
    await expect(linkDriveAccount(t, 'sam@gmail.com')).rejects.toMatchObject({ reason: 'unreadable', actual: null })
    expect(t.log).toEqual(['discard'])
  })

  it('with no required account, any Google account is accepted and recorded', async () => {
    const t = setup('anyone@company.com')
    expect(await linkDriveAccount(t, null)).toBe('anyone@company.com')
    expect(t.log).toEqual([])
    expect(t.account()).toBe('anyone@company.com')
  })
})

describe('the Drive token itself', () => {
  function gisWith(requests: { prompt?: string; hint?: string }[], revoked: string[] = []): Gis {
    return {
      initTokenClient: (c) => ({ requestAccessToken: (o) => (requests.push(o ?? {}), queueMicrotask(() => c.callback({ access_token: 'fresh', expires_in: 3600 }))) }),
      hasGrantedAllScopes: () => true,
      revoke: (t, done) => (revoked.push(t), done?.()),
    }
  }

  it('a token handed over at sign-in is used from memory only, and renewal later suggests the same account with no prompt', async () => {
    const requests: { prompt?: string; hint?: string }[] = []
    const store = new Map<string, string>()
    const auth = new DriveAuth({ clientId: 'cid', loadGis: async () => gisWith(requests), storage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) } })
    auth.setLoginHint('sam@gmail.com')
    auth.adoptToken('from-sign-in')
    expect(auth.ready()).toBe(true)
    expect(await auth.getToken()).toBe('from-sign-in')
    expect(requests).toEqual([]) // no window was needed
    expect([...store.values()].join()).not.toContain('from-sign-in') // never written down

    expect(await auth.renewQuietly()).toBe('ok')
    expect(requests).toEqual([{ prompt: 'none', hint: 'sam@gmail.com' }]) // same account, no prompt, no chooser
  })

  it('discard forgets a wrong-account token and revokes it with Google', async () => {
    const revoked: string[] = []
    const auth = new DriveAuth({ clientId: 'cid', loadGis: async () => gisWith([], revoked) })
    auth.adoptToken('wrong-one')
    await auth.discard()
    expect(revoked).toEqual(['wrong-one'])
    expect(auth.hasValidToken()).toBe(false)
    expect(auth.state).toMatchObject({ status: 'disconnected', account: null })
    await expect(auth.getToken()).rejects.toBeInstanceOf(DriveError)
  })

  it('Google refusing, the window closing and the browser blocking it are told apart (with the raw reason kept for Copy details)', async () => {
    const make = (fire: (c: { callback: (r: unknown) => void; error_callback?: (e: { type: string }) => void }) => void) =>
      new DriveAuth({ clientId: 'cid', loadGis: async () => ({ initTokenClient: (c: never) => ({ requestAccessToken: () => queueMicrotask(() => fire(c)) }), hasGrantedAllScopes: () => true, revoke: () => undefined }) as unknown as Gis })
    await expect(make((c) => c.error_callback?.({ type: 'popup_failed_to_open' })).connect()).rejects.toMatchObject({ kind: 'popup', detail: 'popup_failed_to_open' })
    await expect(make((c) => c.error_callback?.({ type: 'popup_closed' })).connect()).rejects.toMatchObject({ kind: 'auth', detail: 'popup_closed' })
    await expect(make((c) => c.callback({ error: 'access_denied', error_description: 'blocked' })).connect()).rejects.toMatchObject({ kind: 'revoked', detail: 'access_denied: blocked' })
  })
})
