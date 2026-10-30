// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { setTopicStyle } from '@/core/model/commands'
import { exportTheme, LocalThemeRepository } from '@/core/theme/custom'
import { asResolved, resolveLook } from '@/core/theme/resolve'
import { resolveTheme } from '@/core/settings'
import { findTheme } from '@/core/theme/themes'
import { useSettings } from '@/stores/settings'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { mapDoc, openFile, closeFile } from '../session'
import { useEditor } from '../store'
import { setThemeRepository } from '../themeLibrary'
import { ThemeTab } from './ThemePanel'
import { ThemeThumb } from './ThemeThumb'

let repo: RepositoryCore
let storage: Map<string, string>
let t = 1_700_000_000_000

const settings = () => useEditor.getState().settings
const undoSteps = () => mapDoc.undo.undoStack.length
const rootChild = () => Object.values(useEditor.getState().topics).find((x) => x.parentId === useEditor.getState().rootId)!

beforeEach(async () => {
  installMemoryLocalStorage()
  storage = new Map()
  setThemeRepository(new LocalThemeRepository({ getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => void storage.set(k, v) }))
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Themes', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
  useEditor.setState({ themePreview: null })
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await closeFile()
})

const card = (name: RegExp) => screen.getByRole('button', { name })

describe('theme gallery', () => {
  it('has Light, Dark and Custom tabs showing the right themes', () => {
    render(<ThemeTab />)
    const tabs = screen.getByRole('tablist', { name: 'Theme groups' })
    expect(within(tabs).getAllByRole('tab').map((x) => x.textContent)).toEqual(['light', 'dark', 'custom'])
    const light = screen.getByRole('tabpanel', { name: 'light themes' })
    const lightNames = within(light).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    expect(lightNames.length).toBeGreaterThanOrEqual(8)
    expect(lightNames.every((n) => !n.includes('(dark)'))).toBe(true)
    expect(within(light).getByRole('button', { name: /Wishtaa Classic theme/ }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(tabs).getByRole('tab', { name: 'dark' }))
    const dark = screen.getByRole('tabpanel', { name: 'dark themes' })
    const darkNames = within(dark).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
    expect(darkNames.length).toBeGreaterThanOrEqual(6)
    expect(darkNames.every((n) => n.includes('(dark)'))).toBe(true)
  })

  it('opens on the group of the theme in use', async () => {
    mapDoc.settings.set('themeId', 'midnight')
    await waitFor(() => expect(settings().themeId).toBe('midnight'))
    render(<ThemeTab />)
    expect(screen.getByRole('tab', { name: 'dark' }).getAttribute('aria-selected')).toBe('true')
  })

  it('shows a live SVG preview of every theme, named for screen readers', () => {
    render(<ThemeTab />)
    const previews = screen.getAllByRole('img')
    expect(previews.length).toBeGreaterThanOrEqual(8)
    expect(screen.getByRole('img', { name: 'Orbit preview' }).tagName.toLowerCase()).toBe('svg')
  })

  it('draws previews only when they scroll into view', () => {
    const seen: { cb: IntersectionObserverCallback; el: Element }[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe(el: Element) {
          seen.push({ cb: this.cb, el })
        }
        disconnect() {}
        unobserve() {}
      }
    )
    render(<ThemeTab />)
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    expect(seen.length).toBeGreaterThanOrEqual(8)
    act(() => seen[0]!.cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(screen.getAllByRole('img')).toHaveLength(1)
  })

  it('previews on the canvas when hovered or focused, without changing the map, and stops on leave or blur', async () => {
    render(<ThemeTab />)
    const orbit = card(/Orbit theme/)
    const before = JSON.stringify(settings())
    fireEvent.pointerEnter(orbit)
    await waitFor(() => expect(useEditor.getState().themePreview?.theme?.id).toBe('orbit'))
    expect(JSON.stringify(settings())).toBe(before)
    expect(undoSteps()).toBe(0)
    fireEvent.pointerLeave(orbit)
    expect(useEditor.getState().themePreview).toBeNull()
    fireEvent.focus(orbit)
    expect(useEditor.getState().themePreview?.theme?.id).toBe('orbit')
    fireEvent.blur(orbit)
    expect(useEditor.getState().themePreview).toBeNull()
  })

  it('applies a theme on click as one undo step, and undo brings the old one back', () => {
    render(<ThemeTab />)
    fireEvent.click(card(/Orbit theme/))
    expect(settings().themeId).toBe('orbit')
    expect(undoSteps()).toBe(1)
    expect(useEditor.getState().themePreview).toBeNull()
    expect(card(/Orbit theme/).getAttribute('aria-pressed')).toBe('true')
    act(() => void mapDoc.undo.undo())
    expect(settings().themeId).toBe('wishtaa')
    act(() => void mapDoc.undo.redo())
    expect(settings().themeId).toBe('orbit')
  })

  it('keeps a topic’s own overrides when applying, and clears them with the reset option', () => {
    const topic = rootChild()
    setTopicStyle(mapDoc, [topic.id], { fill: '#ff0000', shape: 'pill' })
    mapDoc.undo.stopCapturing()
    render(<ThemeTab />)
    fireEvent.click(card(/Ocean theme/))
    expect(mapDoc.topics.get(topic.id)?.style).toEqual({ fill: '#ff0000', shape: 'pill' })
    fireEvent.click(screen.getByLabelText(/reset the style overrides/i))
    mapDoc.undo.stopCapturing()
    fireEvent.click(card(/Forest theme/))
    expect(mapDoc.topics.get(topic.id)?.style).toEqual({})
    expect(settings().themeId).toBe('forest')
  })

  it('the map theme and the app’s light/dark mode are independent', () => {
    const app = useSettings.getState().theme
    render(<ThemeTab />)
    fireEvent.click(screen.getByRole('tab', { name: 'dark' }))
    fireEvent.click(card(/Midnight theme/))
    expect(settings().themeId).toBe('midnight')
    expect(useSettings.getState().theme).toBe(app)
    expect(findTheme('midnight').dark).toBe(true)
  })
})

describe('colour scheme', () => {
  it('lists at least 12 schemes plus "Theme\'s own"', () => {
    render(<ThemeTab />)
    const buttons = screen.getAllByRole('button', { name: /colour scheme$/ })
    expect(buttons.length).toBeGreaterThanOrEqual(13)
    expect(card(/Theme's own colour scheme/).getAttribute('aria-pressed')).toBe('true')
  })

  it('recolours the branches without changing shapes, as one undo step', () => {
    render(<ThemeTab />)
    fireEvent.click(card(/Orbit theme/))
    mapDoc.undo.stopCapturing()
    const before = resolveLook(resolveTheme(settings()), { depth: 1, branch: 1, isRoot: false })
    const steps = undoSteps()
    fireEvent.click(card(/Colour-blind safe colour scheme/))
    expect(settings().colorSchemeId).toBe('cb-okabe')
    expect(undoSteps()).toBe(steps + 1)
    const after = resolveLook(resolveTheme(settings()), { depth: 1, branch: 1, isRoot: false })
    expect(after.shape).toBe(before.shape)
    expect(after.fontSize).toBe(before.fontSize)
    expect(after.border).not.toBe(before.border)
    expect(settings().themeId).toBe('orbit')
    fireEvent.click(card(/Theme's own colour scheme/))
    expect(settings().colorSchemeId).toBeNull()
  })

  it('previews a scheme on hover', async () => {
    render(<ThemeTab />)
    fireEvent.pointerEnter(card(/Pastel colour scheme/))
    await waitFor(() => expect(useEditor.getState().themePreview?.schemeId).toBe('pastel'))
    expect(settings().colorSchemeId).toBeNull()
    fireEvent.pointerLeave(card(/Pastel colour scheme/))
    expect(useEditor.getState().themePreview).toBeNull()
  })
})

describe('branch thickness and taper', () => {
  it('dragging the slider previews live and saves ONE undo step when released', () => {
    render(<ThemeTab />)
    const slider = screen.getByLabelText('Branch thickness') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '6' } })
    fireEvent.change(slider, { target: { value: '8' } })
    fireEvent.change(slider, { target: { value: '10' } })
    expect(useEditor.getState().themePreview?.branchThickness).toBe(10)
    expect(settings().branchThickness).toBeNull() // nothing saved while dragging
    expect(undoSteps()).toBe(0)
    expect(screen.getByText(/Thickness: 10 px/)).toBeTruthy()
    fireEvent.pointerUp(slider)
    expect(settings().branchThickness).toBe(10)
    expect(undoSteps()).toBe(1)
    expect(useEditor.getState().themePreview).toBeNull()
    act(() => void mapDoc.undo.undo())
    expect(settings().branchThickness).toBeNull()
  })

  it('works from the keyboard (arrow keys, then key up)', () => {
    render(<ThemeTab />)
    const slider = screen.getByLabelText('Branch thickness')
    fireEvent.change(slider, { target: { value: '5' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })
    expect(settings().branchThickness).toBe(5)
    expect(undoSteps()).toBe(1)
  })

  it('goes from 1 to 20 px and can go back to the theme’s own thickness', () => {
    render(<ThemeTab />)
    const slider = screen.getByLabelText('Branch thickness') as HTMLInputElement
    expect(slider.min).toBe('1')
    expect(slider.max).toBe('20')
    fireEvent.change(slider, { target: { value: '12' } })
    fireEvent.pointerUp(slider)
    fireEvent.click(screen.getByRole('button', { name: /Use the theme's thickness/ }))
    expect(settings().branchThickness).toBeNull()
  })

  it('a committed thickness changes how the branches are resolved', () => {
    render(<ThemeTab />)
    fireEvent.change(screen.getByLabelText('Branch thickness'), { target: { value: '14' } })
    fireEvent.pointerUp(screen.getByLabelText('Branch thickness'))
    const r = resolveTheme(settings())
    expect(r.branchThickness).toBe(14)
  })

  it('taper can follow the theme, or be forced on or off, one undo step each', () => {
    render(<ThemeTab />)
    const taper = screen.getByLabelText('Taper') as HTMLSelectElement
    expect(taper.value).toBe('theme')
    fireEvent.change(taper, { target: { value: 'on' } })
    expect(settings().taper).toBe(true)
    fireEvent.change(taper, { target: { value: 'off' } })
    expect(settings().taper).toBe(false)
    fireEvent.change(taper, { target: { value: 'theme' } })
    expect(settings().taper).toBeNull()
  })

  it('applying a theme clears the map-wide thickness and taper', () => {
    render(<ThemeTab />)
    fireEvent.change(screen.getByLabelText('Branch thickness'), { target: { value: '9' } })
    fireEvent.pointerUp(screen.getByLabelText('Branch thickness'))
    fireEvent.change(screen.getByLabelText('Taper'), { target: { value: 'on' } })
    fireEvent.click(card(/Ocean theme/))
    expect(settings()).toMatchObject({ branchThickness: null, taper: null })
  })
})

describe('custom themes', () => {
  const openCustom = () => {
    render(<ThemeTab />)
    fireEvent.click(screen.getByRole('tab', { name: 'custom' }))
    return screen.getByRole('tabpanel', { name: 'Custom themes' })
  }
  const saveAs = async (panel: HTMLElement, name: string) => {
    fireEvent.change(within(panel).getByLabelText('Theme name'), { target: { value: name } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save' }))
    await within(panel).findByRole('button', { name: new RegExp(`${name} theme`) })
  }

  it('starts empty with a hint', () => {
    const panel = openCustom()
    expect(within(panel).getByText(/Nothing saved yet/)).toBeTruthy()
  })

  it('saves the map’s current look as a theme: in My themes, applied, and stored inside the map', async () => {
    const panel = openCustom()
    await saveAs(panel, 'Team look')
    expect(settings().customThemes.map((x) => x.name)).toEqual(['Team look'])
    expect(settings().themeId).toBe(settings().customThemes[0]!.id)
    expect(JSON.parse(storage.get('wishtaamaps:themes')!)).toHaveLength(1)
    expect(within(panel).getByRole('button', { name: /Team look theme/ }).getAttribute('aria-pressed')).toBe('true')
  })

  it('the saved theme includes the map’s colour scheme, thickness and taper', async () => {
    mapDoc.settings.set('colorSchemeId', 'candy')
    mapDoc.settings.set('taper', true)
    mapDoc.settings.set('branchThickness', 10)
    await waitFor(() => expect(settings().taper).toBe(true))
    const panel = openCustom()
    await saveAs(panel, 'Baked')
    const saved = settings().customThemes[0]!
    expect(saved.levels.main.branch).toMatchObject({ thickness: 10, taper: true })
    expect(saved.palette[0]).toBe('#f472b6')
    expect(settings()).toMatchObject({ colorSchemeId: null, branchThickness: null, taper: null }) // now part of the theme
  })

  it('renames, duplicates and deletes a saved theme', async () => {
    const panel = openCustom()
    await saveAs(panel, 'First')
    fireEvent.click(within(panel).getByRole('button', { name: 'Rename First' }))
    const input = within(panel).getByLabelText('New name for First')
    fireEvent.change(input, { target: { value: 'Second' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await within(panel).findByRole('button', { name: /Second theme/ })
    fireEvent.click(within(panel).getByRole('button', { name: 'Duplicate Second' }))
    await within(panel).findByRole('button', { name: /Second copy theme/ })
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete Second copy' }))
    await waitFor(() => expect(within(panel).queryByRole('button', { name: /Second copy theme/ })).toBeNull())
    expect(JSON.parse(storage.get('wishtaamaps:themes')!).map((x: { name: string }) => x.name)).toEqual(['Second'])
  })

  it('a deleted theme stays in the maps that use it ("Only in this map")', async () => {
    const panel = openCustom()
    await saveAs(panel, 'Keepsake')
    fireEvent.click(within(panel).getByRole('button', { name: 'Delete Keepsake' }))
    await within(panel).findByText('Only in this map')
    expect(settings().customThemes.map((x) => x.name)).toEqual(['Keepsake'])
    fireEvent.click(within(panel).getByRole('button', { name: 'Add Keepsake to My themes' }))
    await waitFor(() => expect(JSON.parse(storage.get('wishtaamaps:themes')!)).toHaveLength(1))
  })

  it('exports a theme as a JSON file', async () => {
    const urls: Blob[] = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: (b: Blob) => (urls.push(b), 'blob:x'), revokeObjectURL: () => undefined })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const panel = openCustom()
    await saveAs(panel, 'Exported')
    fireEvent.click(within(panel).getByRole('button', { name: 'Export Exported' }))
    expect(click).toHaveBeenCalled()
    const text = await urls[0]!.text()
    expect(JSON.parse(text)).toMatchObject({ kind: 'wishtaa-theme', theme: { name: 'Exported', version: 2 } })
  })

  it('imports a theme file into My themes, and refuses a file that is not a theme', async () => {
    const panel = openCustom()
    const input = within(panel).getByLabelText('Import theme file') as HTMLInputElement
    const file = new File([exportTheme({ ...findTheme('ocean'), id: 'custom-from-file', name: 'From a friend' })], 'x.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    await within(panel).findByRole('button', { name: /From a friend theme/ })
    fireEvent.change(input, { target: { files: [new File(['nonsense'], 'bad.json')] } })
    await waitFor(() => expect(JSON.stringify(useEditor.getState().notice)).toMatch(/not a theme file/))
    expect(JSON.parse(storage.get('wishtaamaps:themes')!)).toHaveLength(1)
  })

  it('the customise form builds a theme from the current look and saves it', async () => {
    const panel = openCustom()
    fireEvent.click(within(panel).getByRole('button', { name: /Customise/ }))
    fireEvent.change(within(panel).getByLabelText('Central shape'), { target: { value: 'doubleCircle' } })
    fireEvent.click(within(panel).getByRole('button', { name: 'Save as new theme' }))
    await waitFor(() => expect(settings().customThemes).toHaveLength(1))
    const t = settings().customThemes[0]!
    expect(t.levels.central.shape).toBe('doubleCircle')
    expect(t.name).toMatch(/\(mine\)/)
  })
})

describe('theme preview pictures (snapshots)', () => {
  it.each(['wishtaa', 'orbit', 'halo', 'brush', 'underline', 'clear', 'soft-pastel'])('%s', (id) => {
    const html = renderToStaticMarkup(<ThemeThumb theme={asResolved(findTheme(id))} />)
    expect(html).toMatchSnapshot()
  })

  it('draws a double circle for the central topic of a theme that has one, and a tapered branch where a theme tapers', () => {
    const orbit = renderToStaticMarkup(<ThemeThumb theme={asResolved(findTheme('orbit'))} />)
    expect(orbit).toContain('data-node="central"')
    expect(orbit.match(/<circle/g)?.length).toBe(2) // outer ring and inner disc
    const plain = renderToStaticMarkup(<ThemeThumb theme={asResolved(findTheme('wishtaa'))} />)
    expect(plain).not.toContain('<circle')
    expect(orbit).toMatch(/<path d="M[^"]*Z" fill="#[0-9a-f]{6}"><\/path>/) // tapered branches are filled outlines
    expect(plain).toMatch(/fill="none" stroke=/) // plain branches are strokes
  })
})
