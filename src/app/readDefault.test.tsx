// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { useSettings } from '@/stores/settings'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { AppRoutes } from './App'
import { FilesProvider } from './FilesContext'
import { routeForFile } from './navigation'
import { PreferencesDialog } from './PreferencesDialog'

vi.mock('./EditorScreen', () => ({ default: ({ kind }: { kind: string }) => <div data-testid="editor">editor:{kind}</div> }))

let repo: RepositoryCore
let t = 1_700_000_000_000

function Where() {
  const l = useLocation()
  return <output data-testid="where">{l.pathname + l.search}</output>
}
const mount = (path = '/files') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FilesProvider repo={repo}>
        <AppRoutes />
        <Where />
      </FilesProvider>
    </MemoryRouter>
  )

beforeEach(() => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
})
afterEach(cleanup)

describe('opening a file in Read mode from the lists', () => {
  it('routeForFile adds read=1 only when asked, next to a topic if there is one', () => {
    const f = { id: 'a', type: 'map' as const }
    expect(routeForFile(f)).toBe('/map/a')
    expect(routeForFile(f, undefined, true)).toBe('/map/a?read=1')
    expect(routeForFile(f, 't1', true)).toBe('/map/a?topic=t1&read=1')
    expect(routeForFile({ id: 'k', type: 'kb' }, undefined, true)).toBe('/kb/k?read=1')
  })

  it('the file menu has "Open in read mode", which opens it with read=1', async () => {
    await repo.create({ type: 'map', name: 'IND AS 2', content: buildStarterContent('blank') })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for IND AS 2' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open in read mode' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toMatch(/^\/map\/.+\?read=1$/))
  })

  it('folders have neither of the read items', async () => {
    await repo.create({ type: 'folder', name: 'Notes' })
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for Notes' }))
    expect(screen.queryByRole('menuitem', { name: 'Open in read mode' })).toBeNull()
    expect(screen.queryByRole('menuitemcheckbox', { name: /by default/ })).toBeNull()
  })
})

describe('"Open in read mode by default" (the lock)', () => {
  it('turns on from the file menu, shows a lock badge, and turns off again', async () => {
    const f = await repo.create({ type: 'map', name: 'IND AS 2', content: buildStarterContent('blank') })
    mount()
    expect(screen.queryByLabelText('Opens in Read mode by default')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'More actions for IND AS 2' }))
    const item = screen.getByRole('menuitemcheckbox', { name: /Open in read mode by default/ })
    expect(item.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(item)
    await waitFor(async () => expect((await repo.get(f.id))?.readOnlyDefault).toBe(true))
    expect(await screen.findByLabelText('Opens in Read mode by default')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'More actions for IND AS 2' }))
    expect(screen.getByRole('menuitemcheckbox', { name: /Open in read mode by default/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Open in read mode by default/ }))
    await waitFor(async () => expect((await repo.get(f.id))?.readOnlyDefault).toBe(false))
    await waitFor(() => expect(screen.queryByLabelText('Opens in Read mode by default')).toBeNull())
  })

  it('is kept in the file\'s metadata, never in the map\'s content', async () => {
    const f = await repo.create({ type: 'map', name: 'Protected', content: buildStarterContent('blank') })
    const before = await repo.loadContent(f.id)
    await repo.update(f.id, { readOnlyDefault: true })
    expect(await repo.loadContent(f.id)).toEqual(before)
    expect((await repo.get(f.id))?.readOnlyDefault).toBe(true)
  })

  it('shows in the Knowledge base list too', async () => {
    const f = await repo.create({ type: 'kb', name: 'Study notes', content: buildStarterContent('kb') })
    await repo.update(f.id, { readOnlyDefault: true })
    mount('/kb')
    expect(await screen.findByLabelText('Opens in Read mode by default')).toBeTruthy()
  })
})

describe('Preferences', () => {
  it('"Open all files in Read mode" is off by default, remembered when turned on', () => {
    useSettings.setState({ openAllReadOnly: false, mouseWheel: 'move' })
    render(<PreferencesDialog onClose={() => undefined} />)
    const box = screen.getByRole('checkbox', { name: /Open all files in Read mode/ }) as HTMLInputElement
    expect(box.checked).toBe(false)
    fireEvent.click(box)
    expect(useSettings.getState().openAllReadOnly).toBe(true)
    expect(JSON.parse(localStorage.getItem('wishtaamaps:settings') ?? '{}').openAllReadOnly).toBe(true)
  })

  it('the mouse wheel choice is there too', () => {
    useSettings.setState({ mouseWheel: 'move' })
    render(<PreferencesDialog onClose={() => undefined} />)
    const group = screen.getByRole('group', { name: /Mouse wheel/ })
    expect((within(group).getByRole('radio', { name: /Move the map/ }) as HTMLInputElement).checked).toBe(true)
    act(() => void fireEvent.click(within(group).getByRole('radio', { name: 'Zoom' })))
    expect(useSettings.getState().mouseWheel).toBe('zoom')
  })
})

describe('Preferences: pictures and touch', () => {
  it('Pictures: ask each time (default), always compress, always keep original; remembered, and can be reset', () => {
    useSettings.setState({ picturesPref: 'ask' })
    render(<PreferencesDialog onClose={() => undefined} />)
    const group = screen.getByRole('group', { name: 'Pictures' })
    expect((within(group).getByRole('radio', { name: /Ask each time/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(group).getByRole('radio', { name: /Always compress/ }))
    expect(useSettings.getState().picturesPref).toBe('compress')
    expect(JSON.parse(localStorage.getItem('wishtaamaps:settings') ?? '{}').picturesPref).toBe('compress')
    fireEvent.click(within(group).getByRole('radio', { name: /Always keep original/ }))
    expect(useSettings.getState().picturesPref).toBe('original')
    fireEvent.click(within(group).getByRole('radio', { name: /Ask each time/ }))
    expect(useSettings.getState().picturesPref).toBe('ask')
  })

  it('Touch-friendly controls: Auto (default) / Always on / Off', () => {
    useSettings.setState({ touchControls: 'auto' })
    render(<PreferencesDialog onClose={() => undefined} />)
    const group = screen.getByRole('group', { name: 'Touch-friendly controls' })
    expect((within(group).getByRole('radio', { name: /Auto/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(within(group).getByRole('radio', { name: 'Always on' }))
    expect(useSettings.getState().touchControls).toBe('on')
    fireEvent.click(within(group).getByRole('radio', { name: 'Off' }))
    expect(useSettings.getState().touchControls).toBe('off')
  })
})
