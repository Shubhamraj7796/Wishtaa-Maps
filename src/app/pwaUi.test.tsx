// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { saveMetaFromContent } from '@/core/files/content'
import { buildStarterContent } from '@/core/files/templates'
import { SHARE_CACHE, takePendingShare } from '@/pwa/share'
import { setPwa } from '@/pwa/state'
import { installMemoryLocalStorage } from '../test/memoryStorage'

const promptInstall = vi.hoisted(() => vi.fn(async () => 'accepted' as const))
const applyUpdate = vi.hoisted(() => vi.fn())
const flushOpenFile = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/pwa/install', () => ({ promptInstall, listenForInstall: () => () => undefined, isStandalone: () => false }))
vi.mock('@/pwa/register', () => ({ applyUpdate, registerServiceWorker: () => undefined, watchRegistration: () => undefined }))
vi.mock('@/editor/session', () => ({ flushOpenFile }))

import { FilesProvider } from './FilesContext'
import { InstallApp, UpdateBar } from './PwaUi'
import { SharedPictures } from './SharedPictures'

beforeEach(() => {
  installMemoryLocalStorage()
  setPwa({ updateReady: false, canInstall: false, installed: false, standalone: false, offlineReady: false })
  promptInstall.mockClear()
  applyUpdate.mockClear()
  flushOpenFile.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Update available - reload', () => {
  it('is not shown until a new version is waiting', () => {
    render(<UpdateBar />)
    expect(screen.queryByTestId('update-bar')).toBeNull()
  })

  it('shows the bar; Reload saves what is open first, then takes the update; Later hides it', async () => {
    setPwa({ updateReady: true })
    render(<UpdateBar />)
    expect(screen.getByTestId('update-bar').textContent).toMatch(/Update available - reload/)
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(applyUpdate).toHaveBeenCalledTimes(1))
    expect(flushOpenFile).toHaveBeenCalledTimes(1)
    expect(flushOpenFile.mock.invocationCallOrder[0]).toBeLessThan(applyUpdate.mock.invocationCallOrder[0] as number)
    cleanup()
    render(<UpdateBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByTestId('update-bar')).toBeNull()
  })
})

describe('Install app (Preferences)', () => {
  it('offers a button where the browser allows it, and says what happened', async () => {
    setPwa({ canInstall: true })
    render(<InstallApp />)
    fireEvent.click(screen.getByRole('button', { name: 'Install Wishtaa Maps' }))
    await waitFor(() => expect(promptInstall).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Installing…')).toBeTruthy()
  })

  it('says it is installed when it is', () => {
    setPwa({ standalone: true })
    render(<InstallApp />)
    expect(screen.getByTestId('install-state').textContent).toMatch(/is installed on this device/)
    expect(screen.queryByRole('button', { name: /Install/ })).toBeNull()
  })

  it('where there is no one-tap install it explains how (address bar icon; Share, then Add to Home Screen on an iPhone or iPad)', () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: {} })
    render(<InstallApp />)
    const text = screen.getByTestId('install-state').textContent ?? ''
    expect(text).toMatch(/install icon in the address bar/)
    expect(text).toMatch(/Add to Home Screen/)
  })

  it('says whether the app is ready to open with no connection', () => {
    setPwa({ offlineReady: true })
    render(<InstallApp />)
    expect(screen.getByText(/Ready to open with no connection/)).toBeTruthy()
  })
})

describe('Share > Wishtaa Maps (Android)', () => {
  let repo: RepositoryCore
  let mapId = ''
  let t = 1_700_000_000_000

  function Where() {
    const l = useLocation()
    return <output data-testid="where">{l.pathname + l.search}</output>
  }
  const mount = (search: string) =>
    render(
      <MemoryRouter initialEntries={[`/home${search}`]}>
        <FilesProvider repo={repo}>
          <SharedPictures />
          <Where />
        </FilesProvider>
      </MemoryRouter>
    )

  /** A fake cache holding the pictures the service worker kept. */
  function shared(id: string, pictures: [string, string][]) {
    const store = new Map<string, Response>()
    pictures.forEach(([name, type], i) => store.set(`/__shared/${id}/${i}`, new Response(`bytes-${i}`, { headers: { 'Content-Type': type, 'X-Name': encodeURIComponent(name) } })))
    vi.stubGlobal('caches', { open: async (n: string) => (n === SHARE_CACHE ? { match: async (k: string) => store.get(k)?.clone(), delete: async (k: string) => store.delete(k) } : { match: async () => undefined, delete: async () => false }) })
    URL.createObjectURL = vi.fn(() => 'blob:preview') as never
    URL.revokeObjectURL = vi.fn()
    return store
  }

  beforeEach(async () => {
    repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    const content = buildStarterContent('blank')
    const file = await repo.create({ type: 'map', name: 'Lease notes', content })
    await repo.saveContent(file.id, content, saveMetaFromContent(file.id, content))
    mapId = file.id
  })

  it('asks which map and which topic, then opens that map with the picture waiting for the crop step', async () => {
    const store = shared('abc123', [['screenshot.png', 'image/png']])
    mount('?shared=abc123')
    const dialog = await screen.findByRole('dialog', { name: 'Add this picture' })
    expect(within(dialog).getByRole('option', { name: 'Lease notes' })).toBeTruthy()
    await waitFor(() => expect((within(dialog).getByLabelText('Which topic?') as HTMLSelectElement).options.length).toBeGreaterThan(0))
    expect(within(dialog).getAllByRole('option').some((o) => /central topic/.test(o.textContent ?? ''))).toBe(true)
    expect(store.size).toBe(0) // taken out of the cache
    expect(screen.getByTestId('where').textContent).toBe('/home') // the ?shared= part is gone from the address

    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe(`/map/${mapId}`))
    const pending = takePendingShare(mapId)
    expect(pending?.files.map((f) => f.name)).toEqual(['screenshot.png'])
    expect(pending?.target.kind).toBe('child') // by default, as a new subtopic under the chosen topic
  })

  it('"On that topic itself" puts it on the topic; several pictures can only become subtopics', async () => {
    shared('one', [['a.png', 'image/png']])
    mount('?shared=one')
    const dialog = await screen.findByRole('dialog', { name: 'Add this picture' })
    await waitFor(() => expect((within(dialog).getByLabelText('Which topic?') as HTMLSelectElement).options.length).toBeGreaterThan(0))
    fireEvent.click(within(dialog).getByLabelText('On that topic itself'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(takePendingShare(mapId)?.target.kind).toBe('topic'))
    cleanup()

    shared('many', [['a.png', 'image/png'], ['b.jpg', 'image/jpeg'], ['c.webp', 'image/webp']])
    mount('?shared=many')
    const dlg = await screen.findByRole('dialog', { name: 'Add these 3 pictures' })
    expect((within(dlg).getByLabelText('On that topic itself') as HTMLInputElement).disabled).toBe(true)
  })

  it('a new map can be made for the picture', async () => {
    shared('new1', [['a.png', 'image/png']])
    mount('?shared=new1')
    const dialog = await screen.findByRole('dialog', { name: 'Add this picture' })
    fireEvent.change(within(dialog).getByLabelText('Which map?'), { target: { value: '__new__' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/map\/(?!.*undefined)/))
    const id = screen.getByTestId('where').textContent?.replace('/map/', '') as string
    expect(id).not.toBe(mapId)
    expect(takePendingShare(id)?.target).toEqual({ kind: 'root' })
  })

  it('a share with nothing usable shows no dialog and leaves the app as it was', async () => {
    shared('none', [])
    mount('?shared=none')
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/home'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('an ordinary visit to the app shows nothing', () => {
    mount('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
