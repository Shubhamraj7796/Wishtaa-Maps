// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeBackend } from '@/core/auth/fakeBackend'
import { createMapDoc, ensureRoot } from '@/core/model/doc'
import { installMemoryLocalStorage } from '../../test/memoryStorage'

const holder = vi.hoisted(() => ({ backend: null as unknown as FakeBackend }))
vi.mock('@/core/auth/config', () => ({ authEnabled: true, authConfig: { url: 'https://test.supabase.co', anonKey: 'anon', turnstileSiteKey: undefined, supportEmail: 'help@wishtaa.com' } }))
vi.mock('@/core/auth/supabaseBackend', () => ({ createSupabaseBackend: async () => holder.backend }))
vi.mock('../EditorScreen', () => ({ default: () => <div>editor</div> }))

interface GisCall {
  prompt?: string
  hint?: string
}
type Step = 'ok' | 'popup-blocked' | 'closed' | 'denied'
let gisCalls: GisCall[]
let gisScript: Step[]
let revoked: string[]
/** The Google account the Drive token belongs to (what Drive's "about" says). */
let driveAccount: string | null
let mods: {
  auth: typeof import('../account').auth
  driveAuth: typeof import('../drive').driveAuth
  driveClient: typeof import('../drive').driveClient
  flush: typeof import('../account').flushAccountSync
  FOLDER_KEY: string
}
const copied: string[] = []

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('sessionStorage', globalThis.localStorage)
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-1234567890')
  gisCalls = []
  gisScript = []
  revoked = []
  copied.length = 0
  driveAccount = 'sam@gmail.com'
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } })
  // Google's sign-in script, as far as the app uses it. Each window request follows the script (default: gives a token at once).
  let n = 0
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (c: { callback: (r: unknown) => void; error_callback?: (e: { type: string }) => void }) => ({
          requestAccessToken: (o?: GisCall) => {
            gisCalls.push(o ?? {})
            const step = gisScript.shift() ?? 'ok'
            queueMicrotask(() => {
              if (step === 'popup-blocked') c.error_callback?.({ type: 'popup_failed_to_open' })
              else if (step === 'closed') c.error_callback?.({ type: 'popup_closed' })
              else if (step === 'denied') c.callback({ error: 'access_denied' })
              else c.callback({ access_token: `tok${++n}`, expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' })
            })
          },
        }),
        hasGrantedAllScopes: () => true,
        revoke: (t: string, done?: () => void) => {
          revoked.push(t)
          done?.()
        },
      },
    },
  }
  vi.resetModules()
  const { FakeBackend: Fake } = await import('@/core/auth/fakeBackend')
  holder.backend = new Fake()
  const account = await import('../account')
  const drive = await import('../drive')
  vi.spyOn(drive.driveClient, 'account').mockImplementation(async () => driveAccount)
  vi.spyOn(drive.driveClient, 'accountEmail').mockImplementation(async () => driveAccount)
  vi.spyOn(drive.driveClient, 'ensureAppFolder').mockResolvedValue('folder-1')
  mods = { auth: account.auth, driveAuth: drive.driveAuth, driveClient: drive.driveClient, flush: account.flushAccountSync, FOLDER_KEY: drive.FOLDER_KEY }
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

async function mount(path = '/home') {
  const { AppRoutes } = await import('../App')
  const { FilesProvider } = await import('../FilesContext')
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FilesProvider>
        <AppRoutes />
      </FilesProvider>
    </MemoryRouter>
  )
}

/** "Sign in with Google" was pressed (it leaves a note for the return trip) and Google then sent the person back, with a Drive token or without one. */
async function googleReturn(email: string, providerToken?: string, name = 'Sam Smith') {
  sessionStorage.setItem('wishtaamaps:google-return', String(Date.now()))
  await mount()
  await mods.auth.init()
  holder.backend.completeGoogle(email, name, providerToken)
}

describe('Sign in with Google connects Drive by itself', () => {
  it('uses the Drive permission Google gave during sign-in: no second window, no click, and says which account', async () => {
    await googleReturn('sam@gmail.com', 'google-drive-token')
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(await screen.findByText('Google Drive connected as sam@gmail.com.')).toBeTruthy()
    expect(gisCalls).toEqual([]) // no extra window
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mods.driveAuth.hasValidToken()).toBe(true)
    expect(mods.driveAuth.state.account).toBe('sam@gmail.com')

    // The account records which Google account is linked (an address and a status, never a token).
    await mods.flush()
    const uid = mods.auth.state.user?.id as string
    expect(holder.backend.driveLinks.get(uid)).toMatchObject({ google_email: 'sam@gmail.com', status: 'connected' })
    expect(JSON.stringify([...holder.backend.driveLinks.values()])).not.toMatch(/google-drive-token/)
  })

  it('refuses a Drive that belongs to another Google account: the token is thrown away and the right account is asked for', async () => {
    driveAccount = 'other@gmail.com'
    await googleReturn('sam@gmail.com', 'wrong-account-token')
    const dialog = await screen.findByRole('dialog', { name: 'Use the same Google account' })
    expect(dialog.textContent).toContain('This Drive belongs to other@gmail.com. Please use the same Google account you signed in with (sam@gmail.com).')
    expect(mods.driveAuth.state).toMatchObject({ status: 'disconnected', account: null })
    expect(mods.driveAuth.hasValidToken()).toBe(false) // not kept
    expect(revoked).toEqual(['wrong-account-token']) // and not left active with Google
    await mods.flush()
    expect([...holder.backend.driveLinks.values()]).toEqual([]) // nothing was linked

    // Try again asks Google for the right account, with no account chooser.
    driveAccount = 'sam@gmail.com'
    fireEvent.click(within(dialog).getByRole('button', { name: /try again with sam@gmail\.com/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toEqual([{ prompt: 'consent', hint: 'sam@gmail.com' }])
    expect(mods.driveAuth.state.account).toBe('sam@gmail.com')
  })

  it('without a Drive token (the box was unticked) one clear button asks for it, already set to the same account', async () => {
    await googleReturn('sam@gmail.com')
    const dialog = await screen.findByRole('dialog', { name: 'Allow Google Drive?' })
    expect(within(dialog).getByText(/create and open only the files it creates or you pick/i)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /allow google drive/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toEqual([{ prompt: 'consent', hint: 'sam@gmail.com' }])
    expect(await screen.findByText('Google Drive connected as sam@gmail.com.')).toBeTruthy()
  })

  it('a token Google did not really give for Drive (Drive will not say who it is) is not kept: the one-click question follows', async () => {
    driveAccount = null
    await googleReturn('sam@gmail.com', 'no-drive-scope')
    expect(await screen.findByRole('dialog', { name: 'Allow Google Drive?' })).toBeTruthy()
    expect(mods.driveAuth.hasValidToken()).toBe(false)
    expect(mods.driveAuth.state.status).toBe('disconnected')
  })

  it('does not take the same token twice, and does not ask when Drive is already live', async () => {
    await googleReturn('sam@gmail.com', 'tok-a')
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    const about = vi.mocked(mods.driveClient.accountEmail)
    const calls = about.mock.calls.length
    holder.backend.completeGoogle('sam@gmail.com', 'Sam Smith', 'tok-a') // the tab came back into view: the same sign-in event again
    holder.backend.completeGoogle('sam@gmail.com', 'Sam Smith')
    await new Promise((r) => setTimeout(r, 50))
    expect(about.mock.calls.length).toBe(calls)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says before leaving that Drive is connected too', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }))
    expect(await screen.findByText(/also connects your Google Drive/i)).toBeTruthy()
    expect(screen.getByText(/create and open only the files it creates or you pick/i)).toBeTruthy()
  })
})

describe('Connect Google Drive after signing in by email or password', () => {
  async function signInByEmail(email: string) {
    await mount('/account')
    await mods.auth.init()
    await mods.auth.sendCode(email)
    await mods.auth.verifyCode(email, '123456')
  }

  it('a Gmail address must use that same Google account: no chooser, the address is suggested', async () => {
    driveAccount = 'ann@gmail.com'
    await signInByEmail('ann@gmail.com')
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Allow Google Drive?' })
    fireEvent.click(within(dialog).getByRole('button', { name: /allow google drive/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toEqual([{ prompt: 'consent', hint: 'ann@gmail.com' }])
  })

  it('a Gmail address with dots or a +tag still counts as the same account', async () => {
    driveAccount = 'a.n.n@googlemail.com'
    await signInByEmail('ann+work@gmail.com')
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    fireEvent.click(await screen.findByRole('button', { name: /allow google drive/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
  })

  it('a different Google account is refused with the exact message, and Try again asks for the right one', async () => {
    driveAccount = 'someone.else@gmail.com'
    await signInByEmail('ann@gmail.com')
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    fireEvent.click(await screen.findByRole('button', { name: /allow google drive/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Use the same Google account' })
    expect(dialog.textContent).toContain('This Drive belongs to someone.else@gmail.com. Please use the same Google account you signed in with (ann@gmail.com).')
    expect(mods.driveAuth.state.status).toBe('disconnected')
    expect(revoked).toHaveLength(1)
    driveAccount = 'ann@gmail.com'
    fireEvent.click(within(dialog).getByRole('button', { name: /try again with ann@gmail\.com/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls[1]).toEqual({ prompt: 'consent', hint: 'ann@gmail.com' })
  })

  it('an address that is not Gmail may connect any Google account: the chooser is shown and the choice is saved in the account', async () => {
    driveAccount = 'ann.work@company.com'
    await signInByEmail('ann@example.com')
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    fireEvent.click(within(dialog).getByRole('button', { name: /choose a google account/i }))
    expect((await within(dialog).findAllByText(/ann\.work@company\.com/)).length).toBeGreaterThan(0)
    expect(gisCalls).toEqual([{ prompt: 'select_account consent' }])
    expect(within(dialog).getByText(/different address from the one you signed in with \(ann@example\.com\)/i)).toBeTruthy()
    await mods.flush()
    const uid = mods.auth.state.user?.id as string
    expect(holder.backend.driveLinks.get(uid)).toMatchObject({ google_email: 'ann.work@company.com', status: 'connected' })
  })
})

describe('keeping Drive connected', () => {
  it('Reconnect needs no account choice: it asks for the same account, and is checked again', async () => {
    driveAccount = 'sam@gmail.com'
    await googleReturn('sam@gmail.com', 'tok-1')
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    mods.driveAuth.markReconnect('Google Drive needs you to sign in again to keep syncing. Your changes are safe in this browser.')
    expect(mods.driveAuth.state.status).toBe('reconnect')
    fireEvent.click(await screen.findByRole('button', { name: /^reconnect$/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toEqual([{ prompt: '', hint: 'sam@gmail.com' }]) // no chooser, no consent screen
  })
})

describe('Google refusing or the browser blocking the window', () => {
  async function signedInWithoutDrive() {
    await mount('/account')
    await mods.auth.init()
    await mods.auth.sendCode('ann@gmail.com')
    await mods.auth.verifyCode('ann@gmail.com', '123456')
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    return screen.findByRole('button', { name: /allow google drive/i })
  }

  it('"Access blocked / app not verified / not a test user": explains, says who to contact, and copies details without any secret', async () => {
    gisScript.push('closed') // Google showed its error page and the window was closed
    fireEvent.click(await signedInWithoutDrive())
    const dialog = await screen.findByRole('dialog', { name: 'Google did not finish connecting Drive' })
    expect(within(dialog).getByText(/still being approved by Google/i)).toBeTruthy()
    expect(within(dialog).getByRole('link', { name: 'help@wishtaa.com' })).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /copy details/i }))
    await waitFor(() => expect(copied).toHaveLength(1))
    const text = copied[0] as string
    expect(text).toContain('Google Drive connection problem')
    expect(text).toContain('popup_closed')
    expect(text).toContain('Signed in as: ann@gmail.com')
    expect(text).toContain('https://www.googleapis.com/auth/drive.file')
    expect(text).not.toMatch(/tok\d|access_token|Bearer/i)
    expect(await within(dialog).findByRole('button', { name: /copied/i })).toBeTruthy()
  })

  it('access_denied from Google gets the same help, and Try again can succeed', async () => {
    driveAccount = 'ann@gmail.com'
    gisScript.push('denied')
    fireEvent.click(await signedInWithoutDrive())
    const dialog = await screen.findByRole('dialog', { name: 'Google did not finish connecting Drive' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^try again$/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
  })

  it('popup blocked: a button opens Google as a direct click', async () => {
    driveAccount = 'ann@gmail.com'
    gisScript.push('popup-blocked')
    fireEvent.click(await signedInWithoutDrive())
    const dialog = await screen.findByRole('dialog', { name: "Your browser blocked Google's window" })
    expect(mods.driveAuth.state.status).toBe('disconnected')
    fireEvent.click(within(dialog).getByRole('button', { name: /open google sign-in/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toHaveLength(2)
  })
})

describe('someone else signs in on the same browser', () => {
  async function seed() {
    const { createLocalRepository } = await import('@/core/files/idb')
    const local = createLocalRepository()
    const doc = createMapDoc()
    ensureRoot(doc, 'Central Topic')
    const content = Y.encodeStateAsUpdate(doc.ydoc)
    const driveMap = await local.create({ type: 'map', name: "First person's Drive map", content, storage: 'drive' })
    await local.update(driveMap.id, { contentRef: 'drive-file-1', driveMeta: { version: '1', modifiedTime: '2026-11-08T00:00:00.000Z' } })
    await local.saveContent(driveMap.id, content)
    const guest = await local.create({ type: 'map', name: 'Guest map', content })
    return { local, driveMap, guest }
  }

  it('sign-out removes the Drive token, the Drive list and the folder note from this browser; guest files stay; the account keeps its Drive link record', async () => {
    await googleReturn('sam@gmail.com', 'tok-sam')
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    localStorage.setItem(mods.FOLDER_KEY, 'folder-1')
    const { local, driveMap, guest } = await seed()
    await mods.flush()
    const uid = mods.auth.state.user?.id as string

    await mods.auth.signOut()

    expect(mods.driveAuth.state).toMatchObject({ status: 'disconnected', account: null })
    expect(mods.driveAuth.hasValidToken()).toBe(false)
    await expect(mods.driveAuth.getToken()).rejects.toMatchObject({ kind: 'auth' })
    expect(localStorage.getItem(mods.FOLDER_KEY)).toBeNull()
    expect(localStorage.getItem('wishtaamaps:drive-account')).toBeNull()
    expect(await local.get(driveMap.id)).toBeNull()
    expect(await local.get(guest.id)).toMatchObject({ name: 'Guest map' })
    expect(holder.backend.driveLinks.get(uid)?.status).toBe('connected') // signing out is not disconnecting Drive
  })

  it('a different person never inherits the previous person\'s Drive token or list', async () => {
    await googleReturn('first@gmail.com', 'tok-first')
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    const { local, driveMap, guest } = await seed()

    holder.backend.revokeSession() // the first person's sign-in lapses; they walk away
    await waitFor(() => expect(mods.auth.state.status).toBe('expired'))
    expect(await local.get(driveMap.id)).not.toBeNull() // nothing is cleared just because a sign-in expired

    await mods.auth.sendCode('second@example.com')
    await mods.auth.verifyCode('second@example.com', '123456')
    await waitFor(() => expect(mods.auth.state.user?.email).toBe('second@example.com'))
    expect(mods.driveAuth.state).toMatchObject({ status: 'disconnected', account: null })
    expect(mods.driveAuth.hasValidToken()).toBe(false)
    await expect(mods.driveAuth.getToken()).rejects.toMatchObject({ kind: 'auth' }) // no token to hand out
    expect(await local.get(driveMap.id)).toBeNull()
    expect(await local.get(guest.id)).toMatchObject({ name: 'Guest map' })
  })

  it('the same person signing in again keeps their Drive list', async () => {
    await googleReturn('first@gmail.com', 'tok-first')
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    const { local, driveMap } = await seed()
    holder.backend.revokeSession()
    await waitFor(() => expect(mods.auth.state.status).toBe('expired'))
    holder.backend.completeGoogle('first@gmail.com', 'First')
    await waitFor(() => expect(mods.auth.state.status).toBe('signed-in'))
    expect(await local.get(driveMap.id)).not.toBeNull()
  })
})
