// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveError } from '@/core/drive/errors'
import { packFile, WISHTAA_MIME } from '@/core/drive/format'
import { basicShapes, simple } from '@/core/import/emmx/testkit'
import { addChild } from '@/core/model/commands'
import { createMapDoc, ensureRoot } from '@/core/model/doc'
import { installMemoryLocalStorage } from '../test/memoryStorage'

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

// The Google Picker is replaced: each test says what the person picked.
let picked: { id: string; name: string }[] = []
let folderPicked: { id: string; name: string } | null = null
const pickerCalls = vi.fn()
vi.mock('@/core/drive/picker', async (orig) => ({
  ...(await orig<typeof import('@/core/drive/picker')>()),
  pickOpenableFiles: async (o: unknown) => (pickerCalls(o), picked),
  pickDriveFolder: async () => folderPicked,
}))

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
const emmxBytes = () => simple(basicShapes())

let appFolder = ''
const seedEmmx = (name = 'IND AS 2.emmx', bytes = emmxBytes()) => fake.seedBytes(name, bytes, 'application/octet-stream')
const wishtaaFiles = () => [...fake.files.values()].filter((f) => f.meta.name.endsWith('.wishtaa'))
const openButton = async () => (await screen.findAllByRole('button', { name: /Open from Google Drive/ }))[0] as HTMLElement
/** Starts "Open from Google Drive" from Home and picks `files`. */
async function start(files: { id: string; name: string }[]) {
  picked = files
  mount('/home')
  fireEvent.click(await openButton())
}
const convertButton = () => screen.findByRole('button', { name: /Convert and open/ })

beforeEach(async () => {
  installMemoryLocalStorage()
  await driveAuth.disconnect()
  driveAuth.dismissMessage()
  fake.files.clear()
  fake.isOnline = true
  fake.isConnected = true
  fake.calls.length = 0
  picked = []
  folderPicked = null
  pickerCalls.mockClear()
  for (const f of [...(await driveRepository.list({ parentId: 'any' })), ...(await driveRepository.list({ parentId: 'any', trashed: true }))]) await driveRepository.remove(f.id)
  await driveAuth.connect()
  appFolder = await fake.ensureAppFolder()
  fake.calls.length = 0
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('one "Open from Google Drive" action', () => {
  it('is on Home, in All files, on the Google Drive page and in the New file dialog, with the same name', async () => {
    mount('/home')
    expect(await openButton()).toBeTruthy()
    cleanup()
    mount('/files')
    expect(await openButton()).toBeTruthy()
    cleanup()
    mount('/drive')
    expect(await openButton()).toBeTruthy()
    cleanup()
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    expect((await screen.findAllByRole('button', { name: /Open from Google Drive/ })).length).toBeGreaterThan(0)
  })

  it('asks the Picker with the real key, and nothing else', async () => {
    await start([])
    await waitFor(() => expect(pickerCalls).toHaveBeenCalled())
    expect(pickerCalls.mock.calls[0]?.[0]).toMatchObject({ apiKey: 'key', clientId: '123-abc' })
  })
})

describe('opening a .wishtaa', () => {
  it('opens it directly, and it is the same Drive file (autosave goes to it)', async () => {
    const text = await packFile({ type: 'map', name: 'Plan', createdAt: 1, modifiedAt: 2, content: mapBytes('A') })
    const seeded = fake.seed('Plan.wishtaa', text, appFolder, 'application/json') // an older file: plain JSON
    await start([{ id: seeded.id, name: 'Plan.wishtaa' }])
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/(map|kb)\//))
    const rec = (await driveRepository.list({ parentId: 'any' })).find((r) => r.contentRef === seeded.id)
    expect(rec?.storage).toBe('drive')
    expect(wishtaaFiles()).toHaveLength(1) // no copy was made
  })

  it('a .wishtaa that is not ours is refused with a clear message', async () => {
    const bad = fake.seed('Fake.wishtaa', '{"hello":"world"}', appFolder)
    await start([{ id: bad.id, name: 'Fake.wishtaa' }])
    expect(await screen.findByText(/not a Wishtaa Maps file/)).toBeTruthy()
    expect(screen.getAllByText(/Only \.wishtaa and \.emmx files can be opened/).length).toBeGreaterThan(0)
    expect(screen.getByTestId('open-summary').textContent).toMatch(/1 skipped/)
  })
})

describe('opening an .emmx converts it into a NEW .wishtaa copy', () => {
  it('downloads it, shows the choices, creates the copy in Wishtaa Maps with the right type, and never touches the original', async () => {
    const orig = seedEmmx()
    const before = JSON.stringify(fake.files.get(orig.id)?.meta)
    await start([{ id: orig.id, name: orig.name }])
    fireEvent.click(await convertButton())
    await screen.findByTestId('open-summary')

    // a new .wishtaa in the Wishtaa Maps folder, with the new type and the link back
    const made = wishtaaFiles()
    expect(made).toHaveLength(1)
    const copy = made[0]?.meta
    expect(copy?.name).toBe('IND AS 2.wishtaa')
    expect(copy?.mimeType).toBe(WISHTAA_MIME)
    expect(copy?.parents).toEqual([appFolder])
    expect(copy?.appProperties).toMatchObject({ sourceFileId: orig.id, sourceName: 'IND AS 2.emmx', sourceModifiedTime: orig.modifiedTime })
    expect(Date.parse(copy?.appProperties?.importedAt ?? '')).toBeGreaterThan(0)

    // the original is only ever read
    expect(JSON.stringify(fake.files.get(orig.id)?.meta)).toBe(before)
    const touching = fake.calls.filter((c) => c.endsWith(orig.id))
    expect(touching.length).toBeGreaterThan(0)
    for (const c of touching) expect(c, c).toMatch(/^(meta|downloadBytes|findBySource) /)
    expect(fake.calls.some((c) => c === `update ${orig.id}` || c === `trash ${orig.id}` || c === `setAppProperties ${orig.id}`)).toBe(false)

    // the local record carries the link too
    const rec = (await driveRepository.list({ parentId: 'any' })).find((r) => r.contentRef === made[0]?.meta.id)
    expect(rec).toMatchObject({ storage: 'drive', source: { fileId: orig.id, name: 'IND AS 2.emmx', modifiedTime: orig.modifiedTime } })
    expect(screen.getByTestId('open-summary').textContent).toMatch(/1 converted/)
  })

  it('shows the import report and offers to open the new file', async () => {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    fireEvent.click(await convertButton())
    await screen.findByTestId('open-summary')
    const open = within(screen.getByRole('dialog')).getAllByRole('button', { name: /^Open/ })[0] as HTMLElement
    fireEvent.click(open)
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/map\//))
  })

  it('offers the placeholder-text option and a folder choice (default: the Wishtaa Maps folder)', async () => {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    await convertButton()
    expect(screen.getByRole('checkbox', { name: /Clear placeholder text/ })).toBeTruthy()
    expect(screen.getByText(/Wishtaa Maps \(your Drive\)/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeTruthy()
    expect(screen.getByText(/The original is never changed/)).toBeTruthy()
  })

  it('"Choose folder" saves the new file in that folder', async () => {
    const orig = seedEmmx()
    const other = await fake.createFolder('My notes', appFolder)
    folderPicked = { id: other.id, name: 'My notes' }
    await start([{ id: orig.id, name: orig.name }])
    await convertButton()
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))
    await screen.findByText('My notes')
    fireEvent.click(screen.getByRole('button', { name: /Convert and open/ }))
    await screen.findByTestId('open-summary')
    expect(wishtaaFiles()[0]?.meta.parents).toEqual([other.id])
  })

  it('a renamed text file, a damaged zip and a wrong extension are refused and nothing is created', async () => {
    const text = seedEmmx('Notes.emmx', new TextEncoder().encode('this is just text pretending to be a map, long enough to pass'))
    const bad = (() => {
      const b = new Uint8Array(200)
      b.set([0x50, 0x4b, 3, 4])
      return seedEmmx('Broken.emmx', b)
    })()
    const wrong = fake.seed('Plan.docx', 'x', appFolder, 'application/octet-stream')
    await start([
      { id: text.id, name: text.name },
      { id: bad.id, name: bad.name },
      { id: wrong.id, name: wrong.name },
    ])
    await convertButton()
    const rejected = screen.getByRole('alert').textContent ?? ''
    expect(rejected).toMatch(/Plan\.docx/)
    fireEvent.click(screen.getByRole('button', { name: /Convert and open/ }))
    await screen.findByTestId('open-summary')
    expect(wishtaaFiles()).toHaveLength(0)
    expect(screen.getByTestId('open-summary').textContent).toMatch(/failed|skipped/)
    expect(screen.getAllByText(/not a ZIP archive|not a valid \.emmx|damaged|Only \.wishtaa and \.emmx/).length).toBeGreaterThan(0)
  })

  it('an .emmx over 50 MB is refused without being downloaded', async () => {
    const orig = seedEmmx()
    const f = fake.files.get(orig.id)
    if (f) f.meta.size = String(60 * 1024 * 1024)
    await start([{ id: orig.id, name: orig.name }])
    expect(await screen.findByText(/larger than 50 MB/)).toBeTruthy()
    expect(fake.calls.some((c) => c.startsWith('downloadBytes'))).toBe(false)
  })
})

describe('an .emmx that was converted before', () => {
  async function convertOnce() {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    fireEvent.click(await convertButton())
    await screen.findByTestId('open-summary')
    cleanup()
    fake.calls.length = 0
    return orig
  }

  it('asks: open the converted copy (the default) or import again', async () => {
    const orig = await convertOnce()
    picked = [{ id: orig.id, name: orig.name }]
    mount('/home')
    fireEvent.click(await openButton())
    const first = (await screen.findByRole('radio', { name: 'Open the converted copy' })) as HTMLInputElement
    expect(first.checked).toBe(true)
    expect((screen.getByRole('radio', { name: 'Import again as a new copy' }) as HTMLInputElement).checked).toBe(false)
    expect(screen.queryByText(/has changed since then/)).toBeNull()
  })

  it('the default opens the existing copy and makes no second one', async () => {
    const orig = await convertOnce()
    picked = [{ id: orig.id, name: orig.name }]
    mount('/home')
    fireEvent.click(await openButton())
    fireEvent.click(await screen.findByRole('button', { name: /^Open$/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/map\//))
    expect(wishtaaFiles()).toHaveLength(1)
    expect(fake.calls.some((c) => c.startsWith('downloadBytes'))).toBe(false)
  })

  it('"Import again as a new copy" makes a second file', async () => {
    const orig = await convertOnce()
    picked = [{ id: orig.id, name: orig.name }]
    mount('/home')
    fireEvent.click(await openButton())
    fireEvent.click(await screen.findByRole('radio', { name: 'Import again as a new copy' }))
    fireEvent.click(screen.getByRole('button', { name: /Convert and open/ }))
    await screen.findByTestId('open-summary')
    expect(wishtaaFiles()).toHaveLength(2)
  })

  it('says so when the original changed after it was converted', async () => {
    const orig = await convertOnce()
    const f = fake.files.get(orig.id)
    if (f) f.meta.modifiedTime = new Date(Date.parse(orig.modifiedTime) + 86_400_000).toISOString()
    picked = [{ id: orig.id, name: orig.name }]
    mount('/home')
    fireEvent.click(await openButton())
    expect(await screen.findByText(/has changed since then/)).toBeTruthy()
  })

  it('knows about a copy made on another device (only in Drive)', async () => {
    const orig = await convertOnce()
    for (const r of await driveRepository.list({ parentId: 'any' })) await driveRepository.keepLocal(r.id).then(() => driveRepository.remove(r.id))
    expect(await driveRepository.list({ parentId: 'any' })).toHaveLength(0)
    picked = [{ id: orig.id, name: orig.name }]
    mount('/home')
    fireEvent.click(await openButton())
    expect(await screen.findByRole('radio', { name: 'Open the converted copy' })).toBeTruthy()
  })
})

describe('when something goes wrong', () => {
  it('a failed download can be retried', async () => {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    const button = await convertButton()
    fake.isOnline = false
    fireEvent.click(button)
    expect(await screen.findByText(/No connection to Google Drive/)).toBeTruthy()
    expect(wishtaaFiles()).toHaveLength(0)
    fake.isOnline = true
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(wishtaaFiles()).toHaveLength(1))
    expect(await screen.findByText(/1 converted/)).toBeTruthy()
  })

  it('friendly messages for an expired sign-in and for a full Drive', async () => {
    const { friendlyReason } = await import('./driveOpen')
    expect(friendlyReason(new DriveError('auth', 'x'))).toMatch(/sign-in expired/)
    expect(friendlyReason(new DriveError('offline', 'x'))).toMatch(/No connection/)
    expect(friendlyReason(new DriveError('revoked', 'x'))).toMatch(/no longer has access/)
    expect(friendlyReason(new DriveError('quota', 'x'))).toMatch(/Drive is full/)
    expect(friendlyReason(new DriveError('notfound', 'x'))).toMatch(/no longer in Google Drive/)
  })

  it('when Drive will not take the new file, offer Retry and "Convert into this browser instead"', async () => {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    const button = await convertButton()
    const real = fake.create.bind(fake)
    let fail = true
    vi.spyOn(fake, 'create').mockImplementation(async (a) => {
      if (fail) throw new DriveError('quota', 'full')
      return real(a)
    })
    fireEvent.click(button)
    expect(await screen.findByText(/Drive is full/)).toBeTruthy()
    expect(screen.getAllByText(/saved in this browser/).length).toBeGreaterThan(0)
    const local = (await driveRepository.list({ parentId: 'any' })).filter((r) => r.source?.fileId === orig.id)
    expect(local).toHaveLength(1)
    expect(local[0]?.storage).toBe('local') // safe here, with the link recorded

    // Retry works once Drive is happy
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(wishtaaFiles()).toHaveLength(1))
  })

  it('"Convert into this browser instead" keeps the copy here, in this browser only', async () => {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    const button = await convertButton()
    vi.spyOn(fake, 'create').mockRejectedValue(new DriveError('offline', 'down'))
    fireEvent.click(button)
    fireEvent.click(await screen.findByRole('button', { name: 'Convert into this browser instead' }))
    expect(await screen.findByText(/not in Google Drive/)).toBeTruthy()
    expect(wishtaaFiles()).toHaveLength(0)
    expect(screen.getByTestId('open-summary').textContent).toMatch(/1 converted/)
  })
})

describe('several files at once', () => {
  it('converts one after another and ends with a summary: converted, opened, skipped, failed', async () => {
    const a = seedEmmx('One.emmx')
    const b = seedEmmx('Two.emmx')
    const c = seedEmmx('Three.emmx', new TextEncoder().encode('not a zip, just words that are long enough to look like a file'))
    const w = fake.seed('Plan.wishtaa', await packFile({ type: 'map', name: 'Plan', createdAt: 1, modifiedAt: 2, content: mapBytes('A') }), appFolder)
    const x = fake.seed('notes.txt', 'hi', appFolder, 'application/octet-stream')
    await start([a, b, c, w, x].map((d) => ({ id: d.id, name: d.name })))
    fireEvent.click(await convertButton())
    const summary = await screen.findByTestId('open-summary')
    expect(summary.textContent).toMatch(/2 converted/)
    expect(summary.textContent).toMatch(/1 opened/)
    expect(summary.textContent).toMatch(/1 skipped/)
    expect(summary.textContent).toMatch(/1 failed/)
    expect(wishtaaFiles().map((f) => f.meta.name).sort()).toEqual(['One.wishtaa', 'Plan.wishtaa', 'Two.wishtaa'])
    // each result can be opened from the summary
    expect(within(screen.getByRole('dialog')).getAllByRole('button', { name: /^Open/ }).length).toBeGreaterThanOrEqual(3)
    // and the originals were never written to
    for (const o of [a, b, c]) expect(fake.calls.some((cl) => cl === `update ${o.id}` || cl === `trash ${o.id}`)).toBe(false)
    expect(screen.getAllByText(/Only \.wishtaa and \.emmx files can be opened/).length).toBeGreaterThan(0)
  })

  it('shows the hint in the footer of the dialog', async () => {
    const orig = seedEmmx()
    await start([{ id: orig.id, name: orig.name }])
    await convertButton()
    expect(within(screen.getByRole('dialog')).getByText(/Only \.wishtaa and \.emmx files can be opened/)).toBeTruthy()
  })
})
