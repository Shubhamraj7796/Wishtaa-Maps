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
vi.mock('@/core/auth/config', () => ({ authEnabled: true, authConfig: { url: 'https://test.supabase.co', anonKey: 'anon', turnstileSiteKey: undefined } }))
vi.mock('@/core/auth/supabaseBackend', () => ({ createSupabaseBackend: async () => holder.backend }))
vi.mock('../EditorScreen', () => ({ default: () => <div>editor</div> }))

interface GisCall {
  prompt?: string
  hint?: string
}
let gisCalls: GisCall[]
let driveAccount: string
let mods: {
  auth: typeof import('../account').auth
  driveAuth: typeof import('../drive').driveAuth
  driveClient: typeof import('../drive').driveClient
  flush: typeof import('../account').flushAccountSync
  FOLDER_KEY: string
}

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('sessionStorage', globalThis.localStorage)
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id')
  gisCalls = []
  driveAccount = 'sam@gmail.com'
  // Google's sign-in script, as far as the app uses it: every window opens at once and gives a token.
  ;(window as unknown as { google: unknown }).google = {
    accounts: {
      oauth2: {
        initTokenClient: (c: { callback: (r: unknown) => void }) => ({
          requestAccessToken: (o?: GisCall) => {
            gisCalls.push(o ?? {})
            queueMicrotask(() => c.callback({ access_token: 'tok', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file' }))
          },
        }),
        hasGrantedAllScopes: () => true,
        revoke: (_t: string, done?: () => void) => done?.(),
      },
    },
  }
  vi.resetModules()
  const { FakeBackend: Fake } = await import('@/core/auth/fakeBackend')
  holder.backend = new Fake()
  const account = await import('../account')
  const drive = await import('../drive')
  vi.spyOn(drive.driveClient, 'account').mockImplementation(async () => driveAccount)
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

describe('Sign in with Google, then Google Drive in the same flow', () => {
  it('back from Google, one clear question asks for the narrow Drive permission, already set to the same Google account', async () => {
    holder.backend.completeGoogle('sam@gmail.com', 'Sam Smith')
    sessionStorage.setItem('wishtaamaps:google-return', String(Date.now())) // what the Google button leaves behind
    await mount()
    await mods.auth.init()
    const dialog = await screen.findByRole('dialog', { name: 'Allow Google Drive?' })
    expect(within(dialog).getByText(/create and open only the files it creates or you pick/i)).toBeTruthy()
    expect(within(dialog).getAllByText(/sam@gmail\.com/).length).toBeGreaterThan(0)

    fireEvent.click(within(dialog).getByRole('button', { name: /allow google drive/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toEqual([{ prompt: 'consent', hint: 'sam@gmail.com' }]) // consent for Drive, the account suggested: no picking
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Allow Google Drive?' })).toBeNull())

    // The account records which Google account is linked (an address and a status, never a token).
    await mods.flush()
    const uid = mods.auth.state.user?.id as string
    expect(holder.backend.driveLinks.get(uid)).toMatchObject({ google_email: 'sam@gmail.com', status: 'connected' })
    expect(JSON.stringify([...holder.backend.driveLinks.values()])).not.toMatch(/tok/)
  })

  it('is asked once only: a reload does not ask again', async () => {
    holder.backend.completeGoogle('sam@gmail.com', 'Sam Smith')
    sessionStorage.setItem('wishtaamaps:google-return', String(Date.now()))
    await mount()
    await mods.auth.init()
    fireEvent.click(await screen.findByRole('button', { name: /not now/i }))
    expect(sessionStorage.getItem('wishtaamaps:google-return')).toBeNull()
  })

  it('does not ask when Drive is already linked on this device', async () => {
    holder.backend.completeGoogle('sam@gmail.com', 'Sam Smith')
    await mods.driveAuth.connect()
    sessionStorage.setItem('wishtaamaps:google-return', String(Date.now()))
    await mount()
    await mods.auth.init()
    await screen.findByRole('button', { name: /account menu/i })
    expect(screen.queryByRole('dialog', { name: 'Allow Google Drive?' })).toBeNull()
  })
})

describe('Connect Google Drive after signing in by email', () => {
  async function signInByEmail() {
    await mount('/account')
    await mods.auth.init()
    await mods.auth.sendCode('ann@example.com')
    await mods.auth.verifyCode('ann@example.com', '123456')
  }

  it('always shows Google\'s account chooser, with no address suggested', async () => {
    await signInByEmail()
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    expect(within(dialog).getByText(/different address/i)).toBeTruthy()
    driveAccount = 'ann@example.com'
    fireEvent.click(within(dialog).getByRole('button', { name: /choose a google account/i }))
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    expect(gisCalls).toEqual([{ prompt: 'select_account consent' }])
  })

  it('shows which account was linked, and warns plainly when it is not the sign-in address', async () => {
    await signInByEmail()
    driveAccount = 'ann.work@company.com'
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    fireEvent.click(within(dialog).getByRole('button', { name: /choose a google account/i }))
    expect((await within(dialog).findAllByText(/ann\.work@company\.com/)).length).toBeGreaterThan(0)
    expect(within(dialog).getByText(/different address from the one you signed in with \(ann@example\.com\)/i)).toBeTruthy()
    expect(within(dialog).getByText(/That is fine/i)).toBeTruthy()
  })

  it('no warning when the linked Google account is the sign-in address', async () => {
    await signInByEmail()
    driveAccount = 'Ann@Example.com'
    fireEvent.click(await screen.findByRole('button', { name: /connect google drive/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Connect Google Drive' })
    fireEvent.click(within(dialog).getByRole('button', { name: /choose a google account/i }))
    expect(await within(dialog).findByText(/is connected as/i)).toBeTruthy()
    expect(within(dialog).queryByText(/different address/i)).toBeNull()
  })
})

describe('someone else signs in on the same browser', () => {
  async function seed() {
    const { createLocalRepository } = await import('@/core/files/idb')
    const local = createLocalRepository()
    const doc = createMapDoc()
    ensureRoot(doc, 'Central Topic')
    const content = Y.encodeStateAsUpdate(doc.ydoc)
    const driveMap = await local.create({ type: 'map', name: 'First person\'s Drive map', content, storage: 'drive' })
    await local.update(driveMap.id, { contentRef: 'drive-file-1', driveMeta: { version: '1', modifiedTime: '2026-11-08T00:00:00.000Z' } })
    await local.saveContent(driveMap.id, content)
    const guest = await local.create({ type: 'map', name: 'Guest map', content })
    return { local, driveMap, guest }
  }

  it('sign-out removes the Drive list and the Drive access from this browser; guest files stay; the account\'s Drive link is not changed', async () => {
    holder.backend.completeGoogle('sam@gmail.com', 'Sam Smith')
    await mount()
    await mods.auth.init()
    await mods.driveAuth.connect()
    mods.driveAuth.setAccount('sam@gmail.com')
    localStorage.setItem(mods.FOLDER_KEY, 'folder-1')
    const { local, driveMap, guest } = await seed()
    await waitFor(() => expect(mods.driveAuth.state.status).toBe('connected'))
    await mods.flush()
    const uid = mods.auth.state.user?.id as string

    await mods.auth.signOut()

    expect(mods.driveAuth.state).toMatchObject({ status: 'disconnected', account: null })
    expect(mods.driveAuth.hasValidToken()).toBe(false)
    expect(localStorage.getItem(mods.FOLDER_KEY)).toBeNull()
    expect(await local.get(driveMap.id)).toBeNull()
    expect(await local.get(guest.id)).toMatchObject({ name: 'Guest map' })
    expect(holder.backend.driveLinks.get(uid)?.status).toBe('connected') // signing out is not disconnecting Drive
  })

  it('a different person signing in clears the first person\'s Drive list and access first', async () => {
    holder.backend.completeGoogle('first@gmail.com', 'First')
    await mount()
    await mods.auth.init()
    await mods.driveAuth.connect()
    const { local, driveMap, guest } = await seed()

    holder.backend.revokeSession() // the first person's sign-in lapses; they walk away
    await waitFor(() => expect(mods.auth.state.status).toBe('expired'))
    expect(await local.get(driveMap.id)).not.toBeNull() // nothing is cleared just because a sign-in expired

    await mods.auth.sendCode('second@example.com')
    await mods.auth.verifyCode('second@example.com', '123456')
    await waitFor(() => expect(mods.auth.state.user?.email).toBe('second@example.com'))
    expect(mods.driveAuth.state.status).toBe('disconnected')
    expect(await local.get(driveMap.id)).toBeNull()
    expect(await local.get(guest.id)).toMatchObject({ name: 'Guest map' })
  })

  it('the same person signing in again keeps their Drive list', async () => {
    holder.backend.completeGoogle('first@gmail.com', 'First')
    await mount()
    await mods.auth.init()
    const { local, driveMap } = await seed()
    holder.backend.revokeSession()
    await waitFor(() => expect(mods.auth.state.status).toBe('expired'))
    holder.backend.completeGoogle('first@gmail.com', 'First')
    await waitFor(() => expect(mods.auth.state.status).toBe('signed-in'))
    expect(await local.get(driveMap.id)).not.toBeNull()
  })
})
