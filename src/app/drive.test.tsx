// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { packFile } from '@/core/drive/format'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { createMapDoc, ensureRoot } from '@/core/model/doc'
import { installMemoryLocalStorage } from '../test/memoryStorage'

// A fake Google sign-in and a fake Drive replace the real services.
vi.mock('./drive', async () => {
  const { DriveAuth, DRIVE_SCOPE } = await import('@/core/drive/auth')
  const { FakeDrive } = await import('@/core/drive/fakeDrive')
  const gis = {
    initTokenClient: (c: { callback: (r: object) => void }) => ({
      requestAccessToken: () => queueMicrotask(() => c.callback({ access_token: 'tok', expires_in: 3600, scope: DRIVE_SCOPE })),
    }),
    hasGrantedAllScopes: () => true,
    revoke: (_t: string, done?: () => void) => done?.(),
  }
  const store = new Map<string, string>()
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
  const driveAuth = new DriveAuth({ clientId: '123-abc', loadGis: async () => gis, storage })
  const fake = new FakeDrive()
  const driveClient = Object.assign(fake, { account: async () => 'me@example.com', available: () => driveAuth.ready() })
  return { driveConfig: { clientId: '123-abc', apiKey: 'key' }, driveAuth, driveClient, __store: store }
})

import { AppRoutes } from './App'
import { driveAuth, driveClient } from './drive'
import { FilesProvider } from './FilesContext'
import { driveRepository } from './repo'

vi.mock('./EditorScreen', () => ({ default: ({ kind }: { kind: string }) => <div data-testid="editor">editor:{kind}</div> }))

const fake = driveClient as unknown as import('@/core/drive/fakeDrive').FakeDrive

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname}</output>
}
const mount = (path = '/home') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FilesProvider repo={driveRepository}>
        <AppRoutes />
        <Where />
      </FilesProvider>
    </MemoryRouter>
  )

const mapBytes = (...extra: string[]) => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central Topic')
  for (const t of extra) addChild(doc, root, t)
  return Y.encodeStateAsUpdate(doc.ydoc)
}

beforeEach(async () => {
  installMemoryLocalStorage()
  await driveAuth.disconnect()
  driveAuth.dismissMessage()
  fake.files.clear()
  fake.isOnline = true
  fake.calls.length = 0
  for (const f of [...(await driveRepository.list({ parentId: 'any' })), ...(await driveRepository.list({ parentId: 'any', trashed: true }))]) await driveRepository.remove(f.id)
})
afterEach(cleanup)

describe('Google Drive page', () => {
  it('invites the user to connect, and explains what the app can see', async () => {
    mount('/drive')
    expect(await screen.findByRole('heading', { name: 'Connect Google Drive' })).toBeTruthy()
    expect(screen.getByText(/never sees the rest of your Drive/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open from Google Drive/ })).toBeNull()
  })

  it('connects, creates the Wishtaa Maps folder, and shows the account', async () => {
    mount('/drive')
    fireEvent.click(await screen.findByRole('button', { name: /Connect Google Drive/ }))
    expect(await screen.findByText(/Connected as me@example.com/)).toBeTruthy()
    expect([...fake.files.values()].some((f) => f.meta.name === 'Wishtaa Maps')).toBe(true)
    expect(screen.getByRole('button', { name: /Open from Google Drive/ })).toBeTruthy()
    expect(driveAuth.state.status).toBe('connected')
  })

  it('lists the Drive folder and opens a file from it as a linked local file', async () => {
    const folderId = await fake.ensureAppFolder()
    const body = await packFile({ type: 'map', name: 'From Drive', createdAt: 1, modifiedAt: 2, content: mapBytes('A') })
    fake.seed('From Drive.wishtaa', body, folderId)
    await driveAuth.connect()
    mount('/drive')
    fireEvent.click(await screen.findByRole('button', { name: 'Open From Drive' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/map\/.+/))
    const [rec] = await driveRepository.list({ parentId: null })
    expect(rec).toMatchObject({ name: 'From Drive', storage: 'drive' })
  })

  it('disconnecting returns to the connect screen and keeps local files', async () => {
    const f = await driveRepository.create({ type: 'map', name: 'Keep me', content: buildStarterContent('blank') })
    await driveAuth.connect()
    mount('/drive')
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }))
    expect(await screen.findByRole('heading', { name: 'Connect Google Drive' })).toBeTruthy()
    expect(await driveRepository.get(f.id)).not.toBeNull()
  })

  it('asks to sign in again (no popup by itself) when a reload left no live token', async () => {
    await driveAuth.connect()
    ;(driveAuth as unknown as { token: null }).token = null // as after a page reload: linked, but no token in memory
    mount('/drive')
    expect(await screen.findByText('Sign in to see your Drive files')).toBeTruthy()
    expect(fake.calls).toEqual([])
  })
})

describe('Drive in the file screens', () => {
  it('offers Connect in the New file dialog, and Open from Google Drive once connected', async () => {
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    const dialog = await screen.findByRole('dialog', { name: 'New file' })
    expect(within(dialog).queryByText('Open from Google Drive')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: /Connect Google Drive/ }))
    await waitFor(() => expect(driveAuth.state.status).toBe('connected'))
    expect(await within(dialog).findByText('Open from Google Drive')).toBeTruthy()
  })

  it('moves a file to Drive from its menu and marks it with a Drive badge', async () => {
    await driveAuth.connect()
    await driveRepository.create({ type: 'map', name: 'Budget', content: buildStarterContent('blank') })
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Budget' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to Google Drive' }))
    await waitFor(async () => expect((await driveRepository.list({ parentId: null }))[0]?.storage).toBe('drive'))
    const card = (await screen.findByRole('button', { name: 'Open Budget' })).closest('li') as HTMLElement
    await waitFor(() => expect(within(card).getByTitle('Stored in Google Drive')).toBeTruthy())
    fireEvent.click(within(card).getByRole('button', { name: 'More actions for Budget' }))
    expect(await screen.findByRole('menuitem', { name: 'Move to this browser' })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Stop syncing with Drive' })).toBeTruthy()
  })

  it('connects first when a file is moved to Drive while disconnected', async () => {
    await driveRepository.create({ type: 'map', name: 'Plan', content: buildStarterContent('blank') })
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Plan' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to Google Drive' }))
    await waitFor(async () => expect((await driveRepository.list({ parentId: null }))[0]?.storage).toBe('drive'))
    expect(driveAuth.state.status).toBe('connected')
  })

  it('hides local-only files from the Drive badge', async () => {
    await driveRepository.create({ type: 'map', name: 'Plain', content: buildStarterContent('blank') })
    mount('/files')
    await screen.findByRole('button', { name: 'Open Plain' })
    expect(screen.queryByTitle('Stored in Google Drive')).toBeNull()
  })
})

describe('conflicts and sign-in problems', () => {
  async function conflictedFile() {
    await driveAuth.connect()
    const f = await driveRepository.create({ type: 'map', name: 'Shared', content: mapBytes('Base') })
    const moved = await driveRepository.moveToDrive(f.id)
    fake.editElsewhere(moved.contentRef!, await packFile({ type: 'map', name: 'Shared', createdAt: 1, modifiedAt: 2, content: mapBytes('Theirs') }))
    await driveRepository.saveContent(f.id, mapBytes('Mine')).catch(() => undefined)
    return moved
  }

  it('asks which version to keep, and "Keep mine" updates Drive', async () => {
    const moved = await conflictedFile()
    mount('/home')
    const dialog = await screen.findByRole('dialog', { name: 'Two versions of this file' })
    expect(within(dialog).getByText('Shared')).toBeTruthy()
    for (const label of ['Keep mine', "Keep Drive's", 'Save a copy']) expect(within(dialog).getByText(label)).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Keep mine'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Two versions of this file' })).toBeNull())
    expect(JSON.parse(fake.files.get(moved.contentRef!)!.body).content).toBeTruthy()
    expect(driveRepository.conflicts()).toEqual([])
  })

  it('can be put off: a bar stays until the user chooses', async () => {
    await conflictedFile()
    mount('/home')
    const dialog = await screen.findByRole('dialog', { name: 'Two versions of this file' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    const bar = await screen.findByRole('alert')
    expect(bar.textContent).toMatch(/not syncing until you choose/)
    fireEvent.click(within(bar).getByRole('button', { name: 'Choose' }))
    expect(await screen.findByRole('dialog', { name: 'Two versions of this file' })).toBeTruthy()
  })

  it('shows a reconnect bar when the sign-in lapsed', async () => {
    await driveAuth.connect()
    ;(driveAuth as unknown as { set(p: object): void }).set({ status: 'reconnect' })
    mount('/home')
    const bar = await screen.findByRole('alert')
    expect(bar.textContent).toMatch(/sign in again/)
    fireEvent.click(within(bar).getByRole('button', { name: 'Reconnect' }))
    await waitFor(() => expect(driveAuth.state.status).toBe('connected'))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('says so when access was removed, and lets the user dismiss it', async () => {
    await driveAuth.connect()
    const f = await driveRepository.create({ type: 'map', name: 'Was synced', content: buildStarterContent('blank') })
    await driveRepository.moveToDrive(f.id)
    await driveAuth.disconnect()
    ;(driveAuth as unknown as { set(p: object): void }).set({ message: 'Google Drive access was not allowed. You can try connecting again.' })
    mount('/home')
    const bar = await screen.findByRole('alert')
    expect(bar.textContent).toMatch(/not allowed/)
    fireEvent.click(within(bar).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('storage settings', () => {
  it('connects and disconnects from the Storage settings dialog', async () => {
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: 'Storage settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Storage' })
    fireEvent.click(within(dialog).getByRole('button', { name: /Connect Google Drive/ }))
    expect(await within(dialog).findByText(/Connected as me@example.com/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }))
    expect(await within(dialog).findByRole('button', { name: /Connect Google Drive/ })).toBeTruthy()
  })
})
