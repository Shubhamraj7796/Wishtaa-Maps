// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildStarterContent } from '@/core/files/templates'
import { installMemoryLocalStorage } from '../test/memoryStorage'

const picked = vi.hoisted(() => ({ folder: null as { id: string; name: string } | null, calls: 0 }))

vi.mock('@/core/drive/picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/drive/picker')>()),
  pickDriveFolder: async () => {
    picked.calls++
    return picked.folder
  },
}))

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
  return { driveConfig: { clientId: '123-abc', apiKey: 'key' }, driveAuth, driveClient }
})

vi.mock('./EditorScreen', () => ({ default: ({ kind }: { kind: string }) => <div data-testid="editor">editor:{kind}</div> }))

import { AppRoutes } from './App'
import { requestCreate } from './createBus'
import { driveAuth, driveClient } from './drive'
import { FilesProvider } from './FilesContext'
import { driveRepository } from './repo'

const fake = driveClient as unknown as import('@/core/drive/fakeDrive').FakeDrive

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
const where = () => screen.getByTestId('where').textContent ?? ''
const mount = (path = '/home') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FilesProvider repo={driveRepository}>
        <AppRoutes />
        <Where />
      </FilesProvider>
    </MemoryRouter>
  )

const everything = async () => [...(await driveRepository.list({ parentId: 'any' })), ...(await driveRepository.list({ parentId: 'any', trashed: true }))]
const appFolderId = () => [...fake.files.values()].find((f) => f.meta.name === 'Wishtaa Maps')?.meta.id
const driveFiles = () => [...fake.files.values()].filter((f) => f.meta.name.endsWith('.wishtaa'))

beforeEach(async () => {
  installMemoryLocalStorage()
  picked.folder = null
  picked.calls = 0
  await driveAuth.disconnect()
  driveAuth.dismissMessage()
  fake.files.clear()
  fake.isOnline = true
  fake.failNextWith = null
  fake.calls.length = 0
  for (const f of await everything()) await driveRepository.remove(f.id)
})
afterEach(cleanup)

const newFileDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
  return screen.findByRole('dialog', { name: 'New file' })
}

describe('Save to: Drive connected', () => {
  beforeEach(async () => {
    await driveAuth.connect()
    driveAuth.setAccount('me@example.com')
  })

  it('defaults to Google Drive, names the account, and shows the default Wishtaa Maps location', async () => {
    mount()
    const dialog = await newFileDialog()
    const drive = within(dialog).getByRole('radio', { name: /Google Drive \(me@example.com\)/ }) as HTMLInputElement
    expect(drive.checked).toBe(true)
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(false)
    expect(within(dialog).getByText('Wishtaa Maps')).toBeTruthy()
    expect(within(dialog).getByText('Choose another folder')).toBeTruthy()
    expect(within(dialog).queryByText('Connect Google Drive')).toBeNull()
  })

  it('creates the mind map in Drive straight away and opens it as a Drive file', async () => {
    mount()
    const dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByText('Blank mind map'))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const [rec] = await driveRepository.list({ parentId: null })
    expect(rec).toMatchObject({ type: 'map', storage: 'drive' })
    const stored = driveFiles()
    expect(stored).toHaveLength(1)
    expect(stored[0]!.meta.parents).toEqual([appFolderId()])
    expect(rec!.contentRef).toBe(stored[0]!.meta.id)
  })

  it('creates a knowledge base in Drive', async () => {
    mount()
    const dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByText('Knowledge base'))
    await waitFor(() => expect(where()).toMatch(/^\/kb\/.+/))
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ type: 'kb', storage: 'drive' })
  })

  it('creates in this browser when that is chosen, without touching Drive', async () => {
    mount()
    const dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByRole('radio', { name: /This browser/ }))
    fireEvent.click(within(dialog).getByText('Blank mind map'))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'local' })
    expect(driveFiles()).toHaveLength(0)
  })

  it('remembers the last choice as the next default', async () => {
    mount()
    let dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByRole('radio', { name: /This browser/ }))
    fireEvent.click(within(dialog).getByText('Blank mind map'))
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    cleanup()
    mount('/home')
    dialog = await newFileDialog()
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('"Choose another folder" opens the Picker in folder mode, shows the folder, remembers it, and files go there', async () => {
    const custom = fake.seed('Client work', '', undefined)
    picked.folder = { id: custom.id, name: 'Client work' }
    mount()
    let dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByText('Choose another folder'))
    await within(dialog).findByText('Client work')
    expect(picked.calls).toBe(1)
    expect(within(dialog).getByText('Use Wishtaa Maps')).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Blank mind map'))
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect(driveFiles()[0]!.meta.parents).toEqual([custom.id])

    // Next time the same folder is offered, and "Use Wishtaa Maps" goes back to the default.
    cleanup()
    mount('/home')
    dialog = await newFileDialog()
    expect(within(dialog).getByText('Client work')).toBeTruthy()
    fireEvent.click(within(dialog).getByText('Use Wishtaa Maps'))
    expect(within(dialog).queryByText('Client work')).toBeNull()
    expect(within(dialog).getByText(/\(default\)/)).toBeTruthy()
  })

  it('keeps the current location when the Picker is cancelled', async () => {
    picked.folder = null
    mount()
    const dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByText('Choose another folder'))
    await waitFor(() => expect(picked.calls).toBe(1))
    expect(within(dialog).getByText(/\(default\)/)).toBeTruthy()
  })

  it('"Don\'t ask again" skips the dialog next time, and Storage settings can reset it', async () => {
    mount()
    const dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByLabelText(/Don't ask again, always use Google Drive/))
    fireEvent.click(within(dialog).getByText('Blank mind map'))
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    cleanup()

    // From Home the new map is created straight in Drive, with no question.
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /Blank mind map/ }))
    await waitFor(async () => expect((await driveRepository.list({ parentId: 'any' })).length).toBe(2))
    expect(screen.queryByRole('dialog', { name: /Save to/ })).toBeNull()
    expect(driveFiles()).toHaveLength(2)

    // The New file dialog says so instead of asking.
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    cleanup()
    mount('/home')
    const again = await newFileDialog()
    expect(within(again).getByText(/New files are saved to/)).toBeTruthy()
    expect(within(again).queryByRole('radio')).toBeNull()
    fireEvent.click(within(again).getByRole('button', { name: 'Close' }))

    // Reset in Storage settings.
    fireEvent.click(await screen.findByRole('button', { name: 'Storage settings' }))
    const settings = await screen.findByRole('dialog', { name: 'Storage' })
    expect(within(settings).getByText(/always saved to/)).toBeTruthy()
    fireEvent.click(within(settings).getByRole('button', { name: 'Ask me each time' }))
    expect(within(settings).queryByRole('button', { name: 'Ask me each time' })).toBeNull()
    fireEvent.click(within(settings).getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement)
    const asks = await newFileDialog()
    expect(within(asks).getAllByRole('radio').length).toBe(2)
  })
})

describe('Save to: Drive not connected', () => {
  it('defaults to This browser and offers Connect Google Drive', async () => {
    mount()
    const dialog = await newFileDialog()
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(true)
    expect(within(dialog).getByRole('button', { name: /Connect Google Drive/ })).toBeTruthy()
    expect(within(dialog).queryByRole('radio', { name: /Google Drive/ })).toBeNull()
  })

  it('connecting in the dialog switches the choice to Drive', async () => {
    mount()
    const dialog = await newFileDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: /Connect Google Drive/ }))
    const drive = await within(dialog).findByRole('radio', { name: /Google Drive/ })
    expect((drive as HTMLInputElement).checked).toBe(true)
  })

  it('from a "New mind map" button: connects, then carries on and creates it in Drive', async () => {
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /Blank mind map/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New mind map' })
    expect(within(dialog).getByText('Save to')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: /Connect Google Drive/ }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    expect(driveAuth.state.status).toBe('connected')
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ type: 'map', storage: 'drive' })
    expect(driveFiles()).toHaveLength(1)
  })

  it('"This browser" creates locally and Drive is never contacted', async () => {
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /Blank mind map/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New mind map' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'local' })
    expect(fake.calls).toEqual([])
  })

  it('"Always use Drive" is ignored while disconnected, so it still asks', async () => {
    localStorage.setItem('wishtaamaps:create-prefs', JSON.stringify({ always: 'drive', last: 'drive' }))
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /Blank mind map/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New mind map' })
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(true)
  })
})

describe('where the dialog is skipped', () => {
  it('creates in the local folder being viewed, without asking', async () => {
    await driveAuth.connect()
    const folder = await driveRepository.create({ type: 'folder', name: 'Work' })
    mount(`/files/${folder.id}`)
    fireEvent.click(await screen.findByRole('button', { name: /New mind map/ }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const maps = (await driveRepository.list({ parentId: 'any' })).filter((f) => f.type === 'map')
    expect(maps).toHaveLength(1)
    expect(maps[0]).toMatchObject({ parentId: folder.id, storage: 'local' })
    expect(fake.calls).toEqual([])
  })

  it('creates a folder inside a local folder, after asking only for its name', async () => {
    await driveAuth.connect()
    const folder = await driveRepository.create({ type: 'folder', name: 'Work' })
    mount(`/files/${folder.id}`)
    fireEvent.click(await screen.findByRole('button', { name: /New folder/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    expect(within(dialog).queryByText('Save to')).toBeNull()
    expect(within(dialog).getByText(/Saved to: This browser/)).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Inner' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await waitFor(async () => expect((await driveRepository.list({ parentId: folder.id })).map((f) => f.name)).toEqual(['Inner']))
  })

  it('asks from Home, from the top of All files and from the command palette', async () => {
    await driveAuth.connect()
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: /New mind map/ }))
    expect(await screen.findByRole('dialog', { name: 'New mind map' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    act(() => requestCreate('kb'))
    expect(await screen.findByRole('dialog', { name: 'New knowledge base' })).toBeTruthy()
  })

  it('on the Google Drive page, creates directly in Drive without asking', async () => {
    await driveAuth.connect()
    mount('/drive')
    fireEvent.click(await screen.findByRole('button', { name: /New mind map/ }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    expect(driveFiles()).toHaveLength(1)
    expect(driveFiles()[0]!.meta.parents).toEqual([appFolderId()])
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'drive' })
  })

  it('on the Drive page inside a Drive folder, creates in that folder', async () => {
    await driveAuth.connect()
    const root = await fake.ensureAppFolder()
    const sub = await fake.createFolder('Clients', root)
    mount(`/drive?folder=${sub.id}&name=Clients`)
    fireEvent.click(await screen.findByRole('button', { name: /New knowledge base/ }))
    await waitFor(() => expect(where()).toMatch(/^\/kb\/.+/))
    expect(driveFiles()[0]!.meta.parents).toEqual([sub.id])
  })

  it('creates a real Drive folder from the Drive page, and shows it in the listing', async () => {
    await driveAuth.connect()
    mount('/drive')
    fireEvent.click(await screen.findByRole('button', { name: /New folder/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    expect(within(dialog).getByText(/Saved to: Google Drive/)).toBeTruthy()
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Quarterly' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    const made = await screen.findByText('Quarterly')
    expect(made).toBeTruthy()
    const folder = [...fake.files.values()].find((f) => f.meta.name === 'Quarterly')!
    expect(folder.meta.mimeType).toBe('application/vnd.google-apps.folder')
    expect(folder.meta.parents).toEqual([appFolderId()])
    expect(await driveRepository.list({ parentId: 'any' })).toEqual([]) // a Drive folder is not a local file
  })
})

describe('when creating in Drive fails', () => {
  beforeEach(async () => {
    await driveAuth.connect()
    driveAuth.setAccount('me@example.com')
  })

  async function failToCreate() {
    mount()
    const dialog = await newFileDialog()
    fake.isOnline = false
    fireEvent.click(within(dialog).getByText('Blank mind map'))
    return screen.findByRole('dialog', { name: 'Could not create it in Google Drive' })
  }

  it('explains why, offers both ways forward, and the new file is already safe in this browser', async () => {
    const failed = await failToCreate()
    expect(within(failed).getByText(/No connection to Google Drive/)).toBeTruthy()
    expect(within(failed).getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(within(failed).getByRole('button', { name: 'Create in this browser instead' })).toBeTruthy()
    const files = await driveRepository.list({ parentId: 'any' })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ type: 'map', storage: 'local' })
    expect(await driveRepository.loadContent(files[0]!.id)).not.toBeNull()
  })

  it('Retry creates it in Drive once the connection is back, without a duplicate', async () => {
    const failed = await failToCreate()
    fake.isOnline = true
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const files = await driveRepository.list({ parentId: 'any' })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ storage: 'drive' })
    expect(driveFiles()).toHaveLength(1)
  })

  it('Retry that fails again stays on the message', async () => {
    const failed = await failToCreate()
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('dialog', { name: 'Could not create it in Google Drive' })).toBeTruthy()
    expect(await driveRepository.list({ parentId: 'any' })).toHaveLength(1)
  })

  it('"Create in this browser instead" opens the local file', async () => {
    const failed = await failToCreate()
    fireEvent.click(within(failed).getByRole('button', { name: 'Create in this browser instead' }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const files = await driveRepository.list({ parentId: 'any' })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ storage: 'local' })
    expect(where()).toBe(`/map/${files[0]!.id}`)
  })

  it('closing the message keeps the file in All files', async () => {
    const failed = await failToCreate()
    fireEvent.click(within(failed).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await driveRepository.list({ parentId: 'any' })).toHaveLength(1)
  })

  it('shows the Drive-full message', async () => {
    mount()
    const dialog = await newFileDialog()
    const { DriveError } = await import('@/core/drive/errors')
    fake.failNextWith = new DriveError('quota', 'Your Google Drive is full. Free up space, or keep this file in this browser.')
    fireEvent.click(within(dialog).getByText('Knowledge base'))
    const failed = await screen.findByRole('dialog', { name: 'Could not create it in Google Drive' })
    expect(within(failed).getByText(/Drive is full/)).toBeTruthy()
  })

  it('a folder that failed in Drive can be created in this browser instead', async () => {
    mount('/drive')
    const root = await fake.ensureAppFolder()
    expect(root).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /New folder/ }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    fake.isOnline = false
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Docs' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    const failed = await screen.findByRole('dialog', { name: 'Could not create it in Google Drive' })
    expect(await driveRepository.list({ parentId: 'any' })).toEqual([])
    fireEvent.click(within(failed).getByRole('button', { name: 'Create in this browser instead' }))
    await waitFor(async () => expect((await driveRepository.list({ parentId: null })).map((f) => f.name)).toEqual(['Docs']))
  })
})

describe('moving files between Drive and this browser', () => {
  async function driveFile() {
    await driveAuth.connect()
    const f = await driveRepository.create({ type: 'map', name: 'Budget', content: buildStarterContent('blank') })
    return driveRepository.moveToDrive(f.id)
  }

  it('explains what happens, and only moves after confirming', async () => {
    const f = await driveFile()
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Budget' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to this browser' }))
    const dialog = await screen.findByRole('dialog', { name: 'Move to this browser?' })
    expect(within(dialog).getByText(/moved to the Drive bin/)).toBeTruthy()
    expect(within(dialog).getByText(/won't appear on your other devices/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect((await driveRepository.get(f.id))?.storage).toBe('drive')
    expect(fake.files.get(f.contentRef!)!.meta.trashed).toBeFalsy()
  })

  it('moves the file to this browser and the Drive copy to the Drive bin', async () => {
    const f = await driveFile()
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Budget' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to this browser' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Move to this browser?' })).getByRole('button', { name: 'Move to this browser' }))
    await waitFor(async () => expect((await driveRepository.get(f.id))?.storage).toBe('local'))
    expect(fake.files.get(f.contentRef!)!.meta.trashed).toBe(true)
    await waitFor(() => expect(screen.queryByTitle('Stored in Google Drive')).toBeNull())
  })

  it('"Move to Google Drive" is offered for local files, "Move to this browser" for Drive files', async () => {
    await driveAuth.connect()
    await driveRepository.create({ type: 'map', name: 'Local one', content: buildStarterContent('blank') })
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Local one' }))
    expect(await screen.findByRole('menuitem', { name: 'Move to Google Drive' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Move to this browser' })).toBeNull()
  })

  it('says so when Drive cannot be reached, and changes nothing', async () => {
    const f = await driveFile()
    fake.isOnline = false
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Budget' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to this browser' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Move to this browser?' })).getByRole('button', { name: 'Move to this browser' }))
    expect(await screen.findByText(/No connection to Google Drive/)).toBeTruthy()
    expect((await driveRepository.get(f.id))?.storage).toBe('drive')
  })
})
