// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { basicShapes, simple, topic } from '@/core/import/emmx/testkit'
import type { FileRepository } from '@/core/files/types'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { AppRoutes } from './App'
import { FilesProvider } from './FilesContext'

vi.mock('./EditorScreen', () => ({ default: ({ kind }: { kind: string }) => <div data-testid="editor">editor:{kind}</div> }))

let repo: FileRepository
let t = 1_700_000_000_000
const clicked: HTMLInputElement[] = []
/** The file input the app most recently opened. */
const lastChooser = (): HTMLInputElement | null => clicked.at(-1) ?? null

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname}</output>
}
const where = () => screen.getByTestId('where').textContent ?? ''
const mount = (path = '/home') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FilesProvider repo={repo}>
        <AppRoutes />
        <Where />
      </FilesProvider>
    </MemoryRouter>
  )

const sample = () => new File([new Uint8Array(readFileSync('tests/fixtures/IND_AS_2.emmx')) as BlobPart], 'IND_AS_2.emmx')

/** The browser's file chooser can't be driven in a test: catch the input and hand it files. */
function choose(...files: File[]) {
  const input = lastChooser()
  expect(input).not.toBeNull()
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  input?.onchange?.(new Event('change'))
}

/** Clicks an Import card. Where the place isn't decided, the "Save to" dialog appears first: press Choose file. */
async function startImport(label: string) {
  fireEvent.click((await screen.findByText(label)).closest('button') as HTMLButtonElement)
  const dialog = screen.queryByRole('dialog', { name: 'Import' })
  if (dialog) fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
}

beforeEach(() => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  clicked.length = 0
  const realClick = HTMLInputElement.prototype.click
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    if (this.type === 'file') clicked.push(this)
    else realClick.call(this)
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Import entry points', () => {
  it('Home has an Import card that is switched on, and asks for .emmx and Wishtaa files', async () => {
    mount('/home')
    const card = (await screen.findByText('Import')).closest('button') as HTMLButtonElement
    expect(card.disabled).toBe(false)
    expect(within(card).queryByText('Soon')).toBeNull()
    fireEvent.click(card)
    const dialog = await screen.findByRole('dialog', { name: 'Import' })
    expect(within(dialog).getByText('Save to')).toBeTruthy()
    expect(lastChooser()).toBeNull() // asks where to save before choosing the file
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose file…' }))
    expect(lastChooser()?.accept).toBe('.emmx,.wishtaa,.zip')
  })

  it('All files has an Import file card', async () => {
    mount('/files')
    const card = (await screen.findByText('Import file')).closest('button') as HTMLButtonElement
    expect(card.disabled).toBe(false)
    await startImport('Import file')
    expect(lastChooser()).not.toBeNull()
  })

  it('the New file dialog has Import switched on', async () => {
    mount('/home')
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    const dialog = await screen.findByRole('dialog', { name: 'New file' })
    const imp = within(dialog).getByText('Import').closest('button') as HTMLButtonElement
    expect(imp.disabled).toBe(false)
    fireEvent.click(imp)
    expect(lastChooser()).not.toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('importing from the screen', () => {
  it('a clean import opens the new map straight away', async () => {
    mount('/home')
    await startImport('Import')
    choose(sample())
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const [rec] = await repo.list({ parentId: null })
    expect(rec).toMatchObject({ name: 'IND_AS_2', type: 'map', topicCount: 9 })
    expect(where()).toBe(`/map/${rec!.id}`)
    expect(await screen.findByTestId('editor')).toBeTruthy()
  })

  it('imports into the folder being viewed', async () => {
    const folder = await repo.create({ type: 'folder', name: 'Work' })
    mount(`/files/${folder.id}`)
    await startImport('Import file') // inside a folder: no question, straight to the file chooser
    expect(screen.queryByRole('dialog', { name: 'Import' })).toBeNull()
    choose(sample())
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
    expect((await repo.list({ parentId: folder.id })).map((f) => f.name)).toEqual(['IND_AS_2'])
  })

  it('shows what was left out, and what to send samples of, instead of opening the map', async () => {
    const shapes = basicShapes({ extra: topic({ id: 30, type: 'FloatTopic', text: 'x' }) + topic({ id: 31, type: 'FloatTopic', text: 'y' }), main1: { extra: '<Notes/>' } })
    mount('/home')
    await startImport('Import')
    choose(new File([simple(shapes) as BlobPart], 'odd.emmx'))
    const dialog = await screen.findByRole('dialog', { name: 'Imported 1 map' })
    expect(within(dialog).getByText('odd')).toBeTruthy()
    expect(within(dialog).getByText('2 floating topics skipped')).toBeTruthy()
    expect(within(dialog).getByText(/notes and comments on 1 topic not imported yet/)).toBeTruthy()
    expect(within(dialog).getByText(/shape “FloatTopic” × 2/)).toBeTruthy()
    expect(where()).toBe('/home')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(where()).toMatch(/^\/map\//))
  })

  it('says clearly when a file cannot be imported, and creates nothing', async () => {
    mount('/home')
    await startImport('Import')
    choose(new File(['definitely not a zip file, just some words in a file'], 'broken.emmx'))
    const dialog = await screen.findByRole('dialog', { name: 'Nothing was imported' })
    expect(within(dialog).getByRole('alert').textContent).toMatch(/not a valid \.emmx/)
    expect(await repo.list({ parentId: 'any' })).toEqual([])
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('imports several files at once and reports each', async () => {
    mount('/home')
    await startImport('Import')
    choose(new File([simple() as BlobPart], 'one.emmx'), new File(['nope nope nope nope nope nope nope'], 'two.emmx'))
    const dialog = await screen.findByRole('dialog', { name: 'Imported 1 map' })
    expect(within(dialog).getByRole('region', { name: 'one.emmx' })).toBeTruthy()
    expect(within(dialog).getByRole('region', { name: 'two.emmx' }).textContent).toMatch(/not a valid/)
  })
})
