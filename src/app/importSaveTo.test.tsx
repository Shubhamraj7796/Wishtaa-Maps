// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unpackFile } from '@/core/drive/format'
import { basicShapes, simple } from '@/core/import/emmx/testkit'
import { installMemoryLocalStorage } from '../test/memoryStorage'

const picked = vi.hoisted(() => ({ folder: null as { id: string; name: string } | null }))

vi.mock('@/core/drive/picker', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/core/drive/picker')>()),
  pickDriveFolder: async () => picked.folder,
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

import { attachmentStore } from '@/editor/attachments'
import { imageStore } from '@/editor/images'
import { AppRoutes } from './App'
import { driveAuth, driveClient } from './drive'
import { FilesProvider } from './FilesContext'
import { driveRepository, setBlobStores } from './repo'

const fake = driveClient as unknown as import('@/core/drive/fakeDrive').FakeDrive
const clicked: HTMLInputElement[] = []

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname}</output>
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

const sample = () => new File([new Uint8Array(readFileSync('tests/fixtures/IND_AS_2.emmx')) as BlobPart], 'IND_AS_2.emmx')
const tiny = () => new File([simple(basicShapes()) as BlobPart], 'tiny.emmx')

/** The browser's file chooser can't be driven in a test: catch the input and hand it files. */
function choose(...files: File[]) {
  const input = clicked.at(-1)
  expect(input).toBeTruthy()
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input?.onchange?.(new Event('change'))
}

const everything = async () => [...(await driveRepository.list({ parentId: 'any' })), ...(await driveRepository.list({ parentId: 'any', trashed: true }))]
const driveFiles = () => [...fake.files.values()].filter((f) => f.meta.name.endsWith('.wishtaa'))
const appFolderId = () => [...fake.files.values()].find((f) => f.meta.name === 'Wishtaa Maps')?.meta.id

beforeEach(async () => {
  installMemoryLocalStorage()
  setBlobStores({ images: imageStore, attachments: attachmentStore })
  picked.folder = null
  clicked.length = 0
  const realClick = HTMLInputElement.prototype.click
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    if (this.type === 'file') clicked.push(this)
    else realClick.call(this)
  })
  await driveAuth.disconnect()
  driveAuth.dismissMessage()
  fake.files.clear()
  fake.isOnline = true
  fake.failNextWith = null
  fake.calls.length = 0
  for (const f of await everything()) await driveRepository.remove(f.id)
  for (const k of await imageStore.keys()) await imageStore.delete(k)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const openImportDialog = async () => {
  fireEvent.click((await screen.findByText('Import')).closest('button') as HTMLButtonElement)
  return screen.findByRole('dialog', { name: 'Import' })
}
const connect = async () => {
  await driveAuth.connect()
  driveAuth.setAccount('me@example.com')
}

describe('Import: Save to, Drive connected', () => {
  beforeEach(connect)

  it('shows Save to with Google Drive (the account) selected, in the default Wishtaa Maps folder', async () => {
    mount()
    const dialog = await openImportDialog()
    expect((within(dialog).getByRole('radio', { name: /Google Drive \(me@example.com\)/ }) as HTMLInputElement).checked).toBe(true)
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(false)
    expect(within(dialog).getByText('Wishtaa Maps')).toBeTruthy()
    expect(within(dialog).getByText('Choose another folder')).toBeTruthy()
    expect(within(dialog).getByLabelText(/Don't ask again/)).toBeTruthy()
  })

  it('imports into Drive: the .wishtaa file is created first, with its pictures, and opens as a Drive file', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(sample())
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const [rec] = await driveRepository.list({ parentId: null })
    expect(rec).toMatchObject({ name: 'IND_AS_2', storage: 'drive', topicCount: 9 })
    expect(driveFiles()).toHaveLength(1)
    expect(driveFiles()[0]!.meta.parents).toEqual([appFolderId()])
    expect(unpackFile(driveFiles()[0]!.body).images).toHaveLength(8)
    expect(rec!.contentRef).toBe(driveFiles()[0]!.meta.id)
  })

  it('imports to this browser when that is chosen, without touching Drive', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('radio', { name: /This browser/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'local' })
    expect(driveFiles()).toHaveLength(0)
  })

  it('remembers the last choice, like the New file dialog', async () => {
    mount()
    let dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('radio', { name: /This browser/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    cleanup()
    mount('/home')
    dialog = await openImportDialog()
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(true)
    // The same remembered choice shows up in the New file dialog.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    const nf = await screen.findByRole('dialog', { name: 'New file' })
    expect((within(nf).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('uses the Drive folder chosen with the Picker, and remembers it', async () => {
    const custom = fake.seed('Client work', '', undefined)
    picked.folder = { id: custom.id, name: 'Client work' }
    mount()
    let dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByText('Choose another folder'))
    await within(dialog).findByText('Client work')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect(driveFiles()[0]!.meta.parents).toEqual([custom.id])
    cleanup()
    mount('/home')
    dialog = await openImportDialog()
    expect(within(dialog).getByText('Client work')).toBeTruthy()
  })

  it('"Don\'t ask again" skips the dialog next time: the file chooser opens straight away', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByLabelText(/Don't ask again, always use Google Drive/))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    cleanup()
    clicked.length = 0
    mount('/home')
    fireEvent.click((await screen.findByText('Import')).closest('button') as HTMLButtonElement)
    expect(screen.queryByRole('dialog', { name: 'Import' })).toBeNull()
    expect(clicked).toHaveLength(1)
    choose(tiny())
    await waitFor(async () => expect(driveFiles()).toHaveLength(2))
  })

  it('the New file dialog\'s Import uses the Save to choice made there', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    const nf = await screen.findByRole('dialog', { name: 'New file' })
    fireEvent.click(within(nf).getByText('Import'))
    expect(screen.queryByRole('dialog', { name: 'Import' })).toBeNull() // no second question
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect(driveFiles()).toHaveLength(1)
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'drive' })
  })
})

describe('Import: Save to, Drive not connected', () => {
  it('defaults to This browser and offers Connect Google Drive', async () => {
    mount()
    const dialog = await openImportDialog()
    expect((within(dialog).getByRole('radio', { name: /This browser/ }) as HTMLInputElement).checked).toBe(true)
    expect(within(dialog).getByRole('button', { name: /Connect Google Drive/ })).toBeTruthy()
    expect(within(dialog).queryByRole('radio', { name: /Google Drive/ })).toBeNull()
  })

  it('imports to this browser', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'local' })
    expect(fake.calls).toEqual([])
  })

  it('connecting in the dialog switches to Drive, and then the import goes to Drive', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: /Connect Google Drive/ }))
    const drive = await within(dialog).findByRole('radio', { name: /Google Drive/ })
    expect((drive as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'drive' })
  })
})

describe('Import: where the question is skipped', () => {
  beforeEach(connect)

  it('inside a local folder: imports there, without asking, even if Drive is the remembered choice', async () => {
    const folder = await driveRepository.create({ type: 'folder', name: 'Work' })
    mount(`/files/${folder.id}`)
    fireEvent.click((await screen.findByText('Import file')).closest('button') as HTMLButtonElement)
    expect(screen.queryByRole('dialog', { name: 'Import' })).toBeNull()
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    const maps = (await driveRepository.list({ parentId: 'any' })).filter((f) => f.type === 'map')
    expect(maps).toHaveLength(1)
    expect(maps[0]).toMatchObject({ parentId: folder.id, storage: 'local' })
    expect(fake.calls).toEqual([])
  })

  it('at the top of All files: asks', async () => {
    mount('/files')
    fireEvent.click((await screen.findByText('Import file')).closest('button') as HTMLButtonElement)
    expect(await screen.findByRole('dialog', { name: 'Import' })).toBeTruthy()
  })

  it('on the Google Drive page: imports into the Drive folder being viewed, without asking', async () => {
    mount('/drive')
    fireEvent.click(await screen.findByRole('button', { name: /Import \.emmx/ }))
    expect(screen.queryByRole('dialog', { name: 'Import' })).toBeNull()
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect(driveFiles()).toHaveLength(1)
    expect(driveFiles()[0]!.meta.parents).toEqual([appFolderId()])
    expect((await driveRepository.list({ parentId: null }))[0]).toMatchObject({ storage: 'drive' })
  })

  it('on the Google Drive page inside a Drive folder: imports into that folder', async () => {
    const root = await fake.ensureAppFolder()
    const sub = await fake.createFolder('Clients', root)
    mount(`/drive?folder=${sub.id}&name=Clients`)
    fireEvent.click(await screen.findByRole('button', { name: /Import \.emmx/ }))
    choose(tiny())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect(driveFiles()[0]!.meta.parents).toEqual([sub.id])
  })
})

describe('Import: when Drive fails', () => {
  beforeEach(connect)

  async function importWhileOffline() {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    fake.isOnline = false
    choose(sample())
    return screen.findByRole('dialog', { name: 'Could not save to Google Drive' })
  }

  it('explains why, offers both ways forward, and the imported map is safe in this browser', async () => {
    const failed = await importWhileOffline()
    expect(within(failed).getByText(/No connection to Google Drive/)).toBeTruthy()
    expect(within(failed).getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(within(failed).getByRole('button', { name: 'Import to this browser instead' })).toBeTruthy()
    const files = await driveRepository.list({ parentId: 'any' })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ storage: 'local', topicCount: 9 })
    expect(await driveRepository.loadContent(files[0]!.id)).not.toBeNull()
    expect(await imageStore.keys()).toHaveLength(8)
  })

  it('Retry saves it to Drive once the connection is back, without a duplicate', async () => {
    const failed = await importWhileOffline()
    fake.isOnline = true
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const files = await driveRepository.list({ parentId: 'any' })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ storage: 'drive' })
    expect(driveFiles()).toHaveLength(1)
    expect(unpackFile(driveFiles()[0]!.body).images).toHaveLength(8)
  })

  it('Retry that fails again stays on the message', async () => {
    const failed = await importWhileOffline()
    fireEvent.click(within(failed).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('dialog', { name: 'Could not save to Google Drive' })).toBeTruthy()
    expect(await driveRepository.list({ parentId: 'any' })).toHaveLength(1)
  })

  it('"Import to this browser instead" keeps the map here and opens it', async () => {
    const failed = await importWhileOffline()
    fireEvent.click(within(failed).getByRole('button', { name: 'Import to this browser instead' }))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const files = await driveRepository.list({ parentId: 'any' })
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ storage: 'local' })
    expect(where()).toBe(`/map/${files[0]!.id}`)
  })

  it('closing the message keeps the map in All files', async () => {
    const failed = await importWhileOffline()
    fireEvent.click(within(failed).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(await driveRepository.list({ parentId: 'any' })).toHaveLength(1)
  })

  it('shows the Drive-full message', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    const { DriveError } = await import('@/core/drive/errors')
    fake.failNextWith = new DriveError('quota', 'Your Google Drive is full. Free up space, or keep this file in this browser.')
    choose(tiny())
    const failed = await screen.findByRole('dialog', { name: 'Could not save to Google Drive' })
    expect(within(failed).getByText(/Drive is full/)).toBeTruthy()
  })

  it('a file that is not an .emmx never reaches Drive and shows the usual error', async () => {
    mount()
    const dialog = await openImportDialog()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    choose(new File(['just some words, certainly not a zip archive'], 'bad.emmx'))
    const report = await screen.findByRole('dialog', { name: 'Nothing was imported' })
    expect(within(report).getByRole('alert').textContent).toMatch(/not a valid \.emmx/)
    expect(driveFiles()).toHaveLength(0)
    expect(await driveRepository.list({ parentId: 'any' })).toEqual([])
  })
})
