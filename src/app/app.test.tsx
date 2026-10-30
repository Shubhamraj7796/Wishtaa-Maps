// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { buildStarterContent } from '@/core/files/templates'
import type { FileRepository } from '@/core/files/types'
import { AppRoutes } from './App'
import { FilesProvider } from './FilesContext'
import { timeAgo } from './format'

// The editor is covered elsewhere; here a stand-in shows which file the router opened.
vi.mock('./EditorScreen', () => ({ default: ({ kind }: { kind: string }) => <div data-testid="editor">editor:{kind}</div> }))

let repo: FileRepository
let t = 1_700_000_000_000

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}

function mount(path = '/home') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <FilesProvider repo={repo}>
        <AppRoutes />
        <Where />
      </FilesProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
})
afterEach(cleanup)

const where = () => screen.getByTestId('where').textContent

describe('sidebar', () => {
  it('lists the destinations in order, with Google Drive under Storage and Trash last', async () => {
    mount()
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    const labels = within(nav)
      .getAllByRole('link')
      .map((a) => a.textContent?.trim())
    expect(labels).toEqual(['Home', 'All files', 'Knowledge base', 'Gallery', 'Google Drive', 'Trash'])
    expect(within(nav).getByRole('button', { name: /new file/i })).toBeTruthy()
    expect(within(nav).getByText('Storage')).toBeTruthy()
    // Order in the page: New file button, then links, with the Storage heading before Google Drive.
    const text = nav.textContent ?? ''
    expect(text.indexOf('New file')).toBeLessThan(text.indexOf('Home'))
    expect(text.indexOf('Storage')).toBeLessThan(text.indexOf('Google Drive'))
    expect(text.indexOf('Google Drive')).toBeLessThan(text.indexOf('Trash'))
  })

  it('goes to /home from the root and shows the storage banner until dismissed', async () => {
    mount('/')
    await waitFor(() => expect(where()).toBe('/home'))
    expect(screen.getByText('Files are saved in this browser only.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Files are saved in this browser only.')).toBeNull()
    cleanup()
    mount('/home')
    await screen.findByRole('heading', { name: 'Home' })
    expect(screen.queryByText('Files are saved in this browser only.')).toBeNull()
  })

  it('opens a page for each destination', async () => {
    mount('/gallery')
    expect(await screen.findByRole('heading', { name: 'Gallery' })).toBeTruthy()
    cleanup()
    mount('/drive')
    expect(await screen.findByRole('heading', { name: 'Google Drive' })).toBeTruthy()
    cleanup()
    mount('/nowhere')
    expect(await screen.findByText('Page not found')).toBeTruthy()
  })
})

describe('New file dialog', () => {
  it('offers the file kinds, with templates marked as coming soon and import available', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    const dialog = await screen.findByRole('dialog', { name: 'New file' })
    for (const name of ['Blank mind map', 'Knowledge base', 'Folder']) expect(within(dialog).getByText(name)).toBeTruthy()
    const template = within(dialog).getByText('From template').closest('button') as HTMLButtonElement
    const imp = within(dialog).getByText('Import').closest('button') as HTMLButtonElement
    expect(template.disabled).toBe(true)
    expect(imp.disabled).toBe(false) // .emmx import is available
  })

  it('creates a blank mind map and opens it at /map/:id', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Blank mind map'))
    await waitFor(() => expect(where()).toMatch(/^\/map\/.+/))
    const [file] = await repo.list({ parentId: null })
    expect(file?.type).toBe('map')
    expect(where()).toBe(`/map/${file?.id}`)
    expect(await screen.findByTestId('editor')).toBeTruthy()
  })

  it('creates a knowledge base that opens at /kb/:id with the starting structure', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: /new file/i }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Knowledge base'))
    await waitFor(() => expect(where()).toMatch(/^\/kb\/.+/))
    const [file] = await repo.list({ parentId: null })
    expect(file?.type).toBe('kb')
    expect(where()).toBe(`/kb/${file?.id}`)
    expect(await repo.loadContent(file!.id)).not.toBeNull() // the starting structure is stored with the file
  })

  it('creates a folder by name', async () => {
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: /new folder/i }))
    const dialog = await screen.findByRole('dialog', { name: 'New folder' })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Projects' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await screen.findByRole('button', { name: 'Open Projects' })
    expect((await repo.list({ parentId: null })).map((f) => f.name)).toEqual(['Projects'])
  })
})

describe('file list', () => {
  async function seed() {
    const folder = await repo.create({ type: 'folder', name: 'Work' })
    const a = await repo.create({ type: 'map', name: 'Alpha', content: buildStarterContent('blank') })
    const b = await repo.create({ type: 'map', name: 'Beta', content: buildStarterContent('blank') })
    const inner = await repo.create({ type: 'map', name: 'Inside', parentId: folder.id, content: buildStarterContent('blank') })
    return { folder, a, b, inner }
  }

  it('shows folders first, then files by editing time, newest first', async () => {
    await seed()
    mount('/files')
    await screen.findByRole('button', { name: 'Open Beta' })
    const names = within(screen.getByRole('list', { name: 'Files' }))
      .getAllByRole('button', { name: /^Open / })
      .map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Open Work', 'Open Beta', 'Open Alpha'])
  })

  it('can sort by name and reverse the direction', async () => {
    await seed()
    mount('/files')
    await screen.findByRole('button', { name: 'Open Beta' })
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'name' } })
    fireEvent.click(screen.getByRole('button', { name: /^Descending/ }))
    const order = () =>
      within(screen.getByRole('list', { name: 'Files' }))
        .getAllByRole('button', { name: /^Open / })
        .map((b) => b.getAttribute('aria-label'))
    expect(order()).toEqual(['Open Work', 'Open Alpha', 'Open Beta'])
    fireEvent.click(screen.getByRole('button', { name: /^Ascending/ }))
    expect(order()).toEqual(['Open Work', 'Open Beta', 'Open Alpha'])
  })

  it('switches between grid and list', async () => {
    await seed()
    mount('/files')
    await screen.findByRole('button', { name: 'Open Beta' })
    expect(screen.getByRole('button', { name: 'Grid view' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'List view' }))
    expect(screen.getByRole('button', { name: 'List view' }).getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem('wishtaamaps:files:view')).toBe('list')
  })

  it('opens a folder with breadcrumbs showing where you are', async () => {
    const { folder } = await seed()
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'Open Work' }))
    await waitFor(() => expect(where()).toBe(`/files/${folder.id}`))
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    expect(within(crumbs).getByText('My files')).toBeTruthy()
    expect(within(crumbs).getByText('Work').getAttribute('aria-current')).toBe('page')
    expect(await screen.findByRole('button', { name: 'Open Inside' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open Alpha' })).toBeNull()
  })

  it('moves a file to the bin and restores it from the recycle bin', async () => {
    const { a } = await seed()
    mount('/files')
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Alpha' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Move to bin' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Alpha' })).toBeNull())
    expect((await repo.get(a.id))?.trashed).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: /Recycle bin/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Alpha' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Restore' }))
    await waitFor(async () => expect((await repo.get(a.id))?.trashed).toBe(false))
  })

  it('selects several files and moves them to a folder with the Move to dialog', async () => {
    const { folder, a, b } = await seed()
    mount('/files')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Alpha' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Beta' }))
    const bar = screen.getByRole('toolbar', { name: 'Actions for selected files' })
    expect(within(bar).getByText('2 selected')).toBeTruthy()
    fireEvent.click(within(bar).getByRole('button', { name: /Move to…/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /Work/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move here' }))
    await waitFor(async () => {
      expect((await repo.get(a.id))?.parentId).toBe(folder.id)
      expect((await repo.get(b.id))?.parentId).toBe(folder.id)
    })
  })

  it('moves a file into a folder by dragging it', async () => {
    const { folder, a } = await seed()
    mount('/files')
    await screen.findByRole('button', { name: 'Open Alpha' })
    const store = new Map<string, string>()
    const dataTransfer = {
      types: ['application/x-wishtaa-files'],
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? '',
      effectAllowed: '',
    }
    const source = document.querySelector(`[data-file-id="${a.id}"]`) as HTMLElement
    const target = document.querySelector(`[data-file-id="${folder.id}"]`) as HTMLElement
    fireEvent.dragStart(source, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    await waitFor(async () => expect((await repo.get(a.id))?.parentId).toBe(folder.id))
  })

  it('shows a friendly message when there are no files', async () => {
    mount('/files')
    expect(await screen.findByText('No files yet')).toBeTruthy()
  })
})

describe('home', () => {
  it('shows an empty state, then recent and starred files and the last opened one', async () => {
    mount('/home')
    expect(await screen.findByText('Nothing here yet')).toBeTruthy()
    cleanup()

    const a = await repo.create({ type: 'map', name: 'Plan', content: buildStarterContent('blank') })
    await repo.update(a.id, { starred: true })
    localStorage.setItem('wishtaamaps:last-open', a.id)
    mount('/home')
    expect(await screen.findByRole('region', { name: 'Recent files' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Starred' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Continue where you left off' })).toBeTruthy()
  })
})

describe('knowledge base page', () => {
  it('shows the explainer banner and opens the example knowledge base', async () => {
    mount('/kb')
    expect(await screen.findByText(/A mind map is a knowledge base/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View example' }))
    await waitFor(() => expect(where()).toMatch(/^\/kb\/.+/))
    const kbs = await repo.list({ types: ['kb'] })
    expect(kbs.map((k) => k.name)).toEqual(['Example knowledge base'])
  })

  it('lists only knowledge bases', async () => {
    await repo.create({ type: 'kb', name: 'Research', content: buildStarterContent('kb') })
    await repo.create({ type: 'map', name: 'Just a map', content: buildStarterContent('blank') })
    mount('/kb')
    expect(await screen.findByRole('button', { name: 'Open Research' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open Just a map' })).toBeNull()
  })
})

describe('time formatting', () => {
  const now = new Date('2026-03-10T12:00:00Z').getTime()
  it('uses plain words for recent times', () => {
    expect(timeAgo(now - 5_000, now)).toBe('Just now')
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago')
    expect(timeAgo(now - 30 * 3_600_000, now)).toBe('Yesterday')
    expect(timeAgo(now - 4 * 86_400_000, now)).toBe('4 days ago')
  })
})
