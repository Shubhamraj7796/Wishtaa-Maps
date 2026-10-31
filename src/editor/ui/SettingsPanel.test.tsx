// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LAYOUTS } from '@/core/layout/catalog'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild, setImage } from '@/core/model/commands'
import { addRelationship } from '@/core/model/objectCommands'
import { useSettings } from '@/stores/settings'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import * as A from '../actions'
import { selectObject } from '../content'
import { enterReadMode } from '../readmode'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { CanvasTab, LayoutRow } from './CanvasTab'
import { PictureFormat } from './PictureFormat'
import { PictureToolbar } from './PictureToolbar'
import { SettingsPanel } from './SettingsPanel'

let t = 1_700_000_000_000
let rootId = ''
let child = ''
let pic = ''
let pic2 = ''
const undoSteps = () => mapDoc.undo.undoStack.length
const st = () => useEditor.getState()
const panel = () => screen.queryByTestId('settings-panel')
const heading = () => panel()?.querySelector('h2')?.textContent
const select = (ids: string[], extra: Partial<ReturnType<typeof st>> = {}) => act(() => useEditor.setState({ selected: ids, selectedObject: null, imageSelected: null, ...extra }))

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
  useSettings.setState({ panelMode: 'auto', panelPinned: false })
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Panel', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  rootId = st().rootId
  child = addChild(mapDoc, rootId, 'Child')
  pic = addChild(mapDoc, rootId, 'With picture')
  pic2 = addChild(mapDoc, rootId, 'Second picture')
  setImage(mapDoc, pic, { imageId: 'img-a', width: 200, height: 100 })
  setImage(mapDoc, pic2, { imageId: 'img-b', width: 300, height: 150 })
  await act(async () => void (await new Promise((r) => setTimeout(r, 30))))
  select([])
  act(() => useEditor.setState({ panelOpen: false, panelOpener: null, panelTab: 'canvas', panelTabManual: false, panelBusy: 0, dragging: false, canvasSize: { w: 1000, h: 700 }, viewport: { x: 0, y: 0, k: 1 } }))
  mapDoc.undo.stopCapturing()
  mapDoc.undo.clear()
})
afterEach(async () => {
  vi.useRealTimers()
  cleanup()
  vi.unstubAllGlobals()
  await closeFile()
})

const openPanel = () => act(() => void A.openPanel())

describe('layout as a dropdown', () => {
  it('is one compact row showing the current layout, closed until clicked', () => {
    render(<LayoutRow />)
    const row = screen.getByTestId('layout-row')
    expect(row.textContent).toMatch(/Balanced/)
    expect(row.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a grouped list with every layout, a picture and a name for each, the current one highlighted', () => {
    render(<LayoutRow />)
    fireEvent.click(screen.getByTestId('layout-row'))
    const dialog = screen.getByRole('dialog', { name: 'Layout' })
    const groups = within(dialog).getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(groups).toEqual(expect.arrayContaining(['Mind map', 'Tree map', 'Timeline', 'Org chart', 'Fishbone', 'Tree table']))
    const options = within(dialog).getAllByRole('option')
    expect(options).toHaveLength(LAYOUTS.length)
    for (const o of options) expect(o.querySelector('svg'), o.textContent ?? '').toBeTruthy()
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(within(dialog).getByRole('option', { name: 'Mind map: Balanced (both sides)' }).getAttribute('aria-selected')).toBe('true')
  })

  it('arrow keys move, Enter applies as ONE undo step and closes the list', () => {
    render(<LayoutRow />)
    fireEvent.click(screen.getByTestId('layout-row'))
    const dialog = screen.getByRole('dialog')
    const current = within(dialog).getByRole('option', { name: 'Mind map: Balanced (both sides)' })
    current.focus()
    fireEvent.keyDown(current, { key: 'ArrowRight' })
    const next = document.activeElement as HTMLElement
    expect(next).not.toBe(current)
    expect(next.getAttribute('role')).toBe('option')
    fireEvent.click(next) // Enter on a focused button is a click
    expect(st().settings.layout).not.toBe('mindmap:both')
    expect(undoSteps()).toBe(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => A.cmdUndo())
    expect(st().settings.layout).toBe('mindmap:both')
  })

  it('Esc closes it without changing anything, and focus goes back to the row', () => {
    render(<LayoutRow />)
    const row = screen.getByTestId('layout-row')
    fireEvent.click(row)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(row)
    expect(undoSteps()).toBe(0)
  })

  it('hovering or focusing a layout shows its name', () => {
    render(<LayoutRow />)
    fireEvent.click(screen.getByTestId('layout-row'))
    const option = within(screen.getByRole('dialog')).getByRole('option', { name: 'Timeline: Horizontal timeline' })
    fireEvent.mouseEnter(option)
    expect(within(screen.getByRole('dialog')).getByText('Horizontal timeline', { selector: 'p' })).toBeTruthy()
  })
})

describe('the Canvas section: compact rows', () => {
  it('Layout, Theme and Theme colour are rows with a thumbnail; the lists are closed', () => {
    render(<CanvasTab />)
    expect(screen.getByTestId('layout-row')).toBeTruthy()
    expect(screen.getByTestId('theme-row').textContent).toMatch(/Wishtaa Classic/)
    expect(screen.getByTestId('theme-colour-row').textContent).toMatch(/Theme's own/)
    expect(screen.queryByRole('tablist', { name: 'Theme groups' })).toBeNull()
    expect(screen.getByRole('slider', { name: 'Topic spacing' })).toBeTruthy()
  })

  it('the Theme row opens the gallery, and applying a theme is one undo step and closes it', () => {
    render(<CanvasTab />)
    fireEvent.click(screen.getByTestId('theme-row'))
    const gallery = screen.getByRole('dialog', { name: 'Theme' })
    expect(within(gallery).getByRole('tablist', { name: 'Theme groups' })).toBeTruthy()
    fireEvent.click(within(gallery).getByRole('button', { name: /Orbit theme/ }))
    expect(st().settings.themeId).toBe('orbit')
    expect(undoSteps()).toBe(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the Theme colour row opens the colour schemes', () => {
    render(<CanvasTab />)
    fireEvent.click(screen.getByTestId('theme-colour-row'))
    expect(within(screen.getByRole('dialog', { name: 'Theme colour' })).getAllByRole('button').length).toBeGreaterThan(5)
  })
})

describe('each selection shows its own section', () => {
  it('nothing selected: Canvas (layout, theme, theme colour, spacing, background)', () => {
    render(<SettingsPanel />)
    openPanel()
    expect(heading()).toBe('Canvas')
    expect(screen.getByTestId('layout-row')).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Topic spacing' })).toBeTruthy()
  })

  it('a topic: Style, and NOT the map layout; its own branch layout is at the bottom', () => {
    render(<SettingsPanel />)
    openPanel()
    select([child])
    expect(heading()).toBe('Style')
    expect(screen.queryByTestId('layout-row')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Font' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Shape:/ })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Branch' })).toBeTruthy()
    const branch = screen.getByTestId('branch-layout-row')
    expect(branch.textContent).toMatch(/Same as map/)
  })

  it('the branch layout dropdown applies one direction in one undo step', () => {
    render(<SettingsPanel />)
    openPanel()
    select([child])
    fireEvent.click(screen.getByTestId('branch-layout-row'))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('option', { name: 'Down' }))
    expect(st().topics[child]?.branchDir).toBe('down')
    expect(undoSteps()).toBe(1)
  })

  it('several topics: Style, with the settings every one of them has', () => {
    render(<SettingsPanel />)
    openPanel()
    select([child, pic])
    expect(heading()).toBe('Style')
    expect(screen.getByText(/2 topics/)).toBeTruthy()
    expect(screen.queryByTestId('layout-row')).toBeNull()
    expect(screen.getByTestId('branch-layout-row')).toBeTruthy()
  })

  it('a mix that includes the central topic: no branch settings (the centre has no branch)', () => {
    render(<SettingsPanel />)
    openPanel()
    select([rootId, child])
    expect(heading()).toBe('Style')
    expect(screen.queryByRole('group', { name: 'Branch' })).toBeNull()
    expect(screen.queryByTestId('branch-layout-row')).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Font' })).toBeTruthy()
  })

  it('a picture: Picture format with size, proportions, position and replace', () => {
    render(<SettingsPanel />)
    openPanel()
    select([pic], { imageSelected: pic })
    expect(heading()).toBe('Picture format')
    expect(screen.getByRole('spinbutton', { name: 'Picture width' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep aspect ratio' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Picture position' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Replace the picture' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Reset to original size/ })).toBeTruthy()
  })

  it('a relationship line: its own style (label, colour, thickness, dash, arrows, curve)', () => {
    const r = addRelationship(mapDoc, child, pic) as string
    render(<SettingsPanel />)
    openPanel()
    act(() => selectObject({ kind: 'relationship', id: r }))
    expect(heading()).toBe('Object style')
    expect(screen.getByRole('textbox', { name: 'Label' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Line colour/ })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Thickness' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Curve' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Line style' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Arrow heads' })).toBeTruthy()
  })

  it('the tabs have text labels and tooltips', () => {
    render(<SettingsPanel />)
    openPanel()
    const tabs = within(screen.getByRole('tablist', { name: 'Settings sections' })).getAllByRole('tab')
    expect(tabs.map((x) => x.textContent)).toEqual(expect.arrayContaining(['Canvas', 'Style', 'Marks', 'Clipart', 'Details', 'Notes']))
    for (const x of tabs) expect(x.title.length, x.textContent ?? '').toBeGreaterThan(3)
  })
})

describe('the section follows the selection, unless a tab was picked by hand', () => {
  it('switches when the KIND of selection changes', () => {
    render(<SettingsPanel />)
    openPanel()
    expect(heading()).toBe('Canvas')
    select([child])
    expect(heading()).toBe('Style')
    select([pic], { imageSelected: pic })
    expect(heading()).toBe('Picture format')
    select([])
    expect(heading()).toBe('Canvas')
  })

  it('a tab chosen by hand is kept while the kind stays the same, and given up when it changes', () => {
    render(<SettingsPanel />)
    openPanel()
    select([child])
    fireEvent.click(screen.getByRole('tab', { name: 'Marks' }))
    expect(heading()).toBe('Marks')
    select([pic]) // another topic: the same kind
    expect(heading()).toBe('Marks')
    select([child, pic]) // topic -> topics is a different kind
    expect(heading()).toBe('Style')
    fireEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    select([])
    expect(heading()).toBe('Canvas')
  })

  it('says which section opened, for screen readers', () => {
    render(<SettingsPanel />)
    openPanel()
    select([child])
    expect(screen.getAllByRole('status').map((x) => x.textContent).join(' ')).toMatch(/Style settings/)
  })
})

describe('opening and closing by itself', () => {
  beforeEach(() => vi.useFakeTimers())

  it('starts as a thin handle that does not take space, and is a real button', () => {
    render(<SettingsPanel />)
    expect(panel()).toBeNull()
    const handle = screen.getByRole('button', { name: 'Open the settings panel' })
    expect(handle.getAttribute('aria-expanded')).toBe('false')
    expect(handle.getAttribute('aria-controls')).toBe('settings-panel')
  })

  it('clicking the handle opens it, and the handle says so', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByTestId('panel-handle'))
    expect(panel()).toBeTruthy()
    expect(panel()?.getAttribute('role')).toBe('complementary')
    expect(panel()?.getAttribute('aria-label')).toBe('Settings panel')
  })

  it('pointing at the right edge opens it after about 150 ms, without taking keyboard focus', () => {
    render(<SettingsPanel />)
    const zone = screen.getByTestId('panel-hot-zone')
    fireEvent.pointerOver(zone, { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(100))
    expect(panel()).toBeNull()
    act(() => void vi.advanceTimersByTime(80))
    expect(panel()).toBeTruthy()
    expect(panel()?.contains(document.activeElement)).toBe(false)
  })

  it('leaving closes it after about 400 ms; coming back in time keeps it', () => {
    render(<SettingsPanel />)
    fireEvent.pointerOver(screen.getByTestId('panel-hot-zone'), { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(200))
    const p = panel() as HTMLElement
    fireEvent.pointerOut(p, { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(300))
    expect(panel()).toBeTruthy()
    fireEvent.pointerOver(p, { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(600))
    expect(panel()).toBeTruthy()
    fireEvent.pointerOut(p, { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(450))
    expect(panel()).toBeNull()
  })

  it('does not close while a dropdown, colour picker or text field inside it is open or focused', () => {
    render(<SettingsPanel />)
    fireEvent.pointerOver(screen.getByTestId('panel-hot-zone'), { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(200))
    const p = panel() as HTMLElement
    // a dropdown open inside the panel
    fireEvent.click(within(p).getByTestId('layout-row'))
    fireEvent.pointerOut(p, { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(900))
    expect(panel()).toBeTruthy()
    expect(st().panelBusy).toBeGreaterThan(0)
    // once it is closed the panel is free to go
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(st().panelBusy).toBe(0)
  })

  it('does not close while the pointer is held on it (it counts as used), or when a field has focus', () => {
    render(<SettingsPanel />)
    fireEvent.pointerOver(screen.getByTestId('panel-hot-zone'), { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(200))
    const p = panel() as HTMLElement
    fireEvent.pointerDown(p) // used: now stays until closed
    fireEvent.pointerOut(p, { pointerType: 'mouse' })
    act(() => void vi.advanceTimersByTime(900))
    expect(panel()).toBeTruthy()
  })

  it('selecting a topic opens it after the selection settles; clearing it closes it again', () => {
    render(<SettingsPanel />)
    select([child])
    act(() => void vi.advanceTimersByTime(60))
    expect(panel()).toBeNull() // still settling: no flicker
    act(() => void vi.advanceTimersByTime(100))
    expect(panel()).toBeTruthy()
    expect(heading()).toBe('Style')
    select([])
    act(() => void vi.advanceTimersByTime(200))
    expect(panel()).toBeNull()
  })

  it('rapid selection changes settle into one decision', () => {
    render(<SettingsPanel />)
    for (const id of [child, pic, pic2, child]) {
      select([id])
      act(() => void vi.advanceTimersByTime(30))
    }
    expect(panel()).toBeNull()
    act(() => void vi.advanceTimersByTime(150))
    expect(panel()).toBeTruthy()
  })

  it('does not close while something is being dragged or resized, then closes', () => {
    render(<SettingsPanel />)
    select([child])
    act(() => void vi.advanceTimersByTime(200))
    expect(panel()).toBeTruthy()
    act(() => useEditor.setState({ dragging: true }))
    select([])
    act(() => void vi.advanceTimersByTime(500))
    expect(panel()).toBeTruthy()
    act(() => useEditor.setState({ dragging: false }))
    act(() => void vi.advanceTimersByTime(200))
    expect(panel()).toBeNull()
  })

  it('a panel opened from the handle stays when the selection is cleared', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByTestId('panel-handle'))
    select([child])
    act(() => void vi.advanceTimersByTime(200))
    select([])
    act(() => void vi.advanceTimersByTime(500))
    expect(panel()).toBeTruthy()
  })

  it('opening a file does not pop the panel up because the centre happens to be selected', () => {
    render(<SettingsPanel />)
    act(() => void vi.advanceTimersByTime(500))
    expect(panel()).toBeNull()
  })

  it('Esc closes it and puts focus back on the canvas', () => {
    const tree = document.createElement('div')
    tree.setAttribute('role', 'tree')
    tree.setAttribute('aria-label', 'Mind map canvas')
    tree.tabIndex = 0
    document.body.appendChild(tree)
    render(<SettingsPanel />)
    fireEvent.click(screen.getByTestId('panel-handle'))
    fireEvent.keyDown(panel() as HTMLElement, { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(document.activeElement).toBe(tree)
    tree.remove()
  })

  it('swiping in from the right edge opens it on a touch screen', () => {
    render(<SettingsPanel />)
    vi.stubGlobal('innerWidth', 400)
    act(() => void window.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [{ clientX: 395, clientY: 300 }] })))
    act(() => void window.dispatchEvent(Object.assign(new Event('touchend'), { changedTouches: [{ clientX: 300, clientY: 305 }] })))
    expect(panel()).toBeTruthy()
  })

  it('pointer events from a finger do not trigger the hover behaviour', () => {
    render(<SettingsPanel />)
    fireEvent.pointerOver(screen.getByTestId('panel-hot-zone'), { pointerType: 'touch' })
    act(() => void vi.advanceTimersByTime(500))
    expect(panel()).toBeNull()
  })
})

describe('pin, and the Preferences modes', () => {
  beforeEach(() => vi.useFakeTimers())

  it('pinned: docked beside the map, stays when the selection is cleared and the pointer leaves; remembered', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByTestId('panel-handle'))
    fireEvent.click(screen.getByRole('button', { name: 'Keep the settings panel open' }))
    expect(useSettings.getState().panelPinned).toBe(true)
    expect(JSON.parse(localStorage.getItem('wishtaamaps:settings') ?? '{}').panelPinned).toBe(true)
    expect(panel()?.getAttribute('data-docked')).toBe('true')
    select([child])
    act(() => void vi.advanceTimersByTime(200))
    select([])
    act(() => void vi.advanceTimersByTime(800))
    expect(panel()).toBeTruthy()
  })

  it('not pinned: it overlays the canvas instead of taking space', () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByTestId('panel-handle'))
    expect(panel()?.getAttribute('data-docked')).toBe('false')
  })

  it('Always open: the panel is open from the start and has no handle', () => {
    useSettings.setState({ panelMode: 'always' })
    render(<SettingsPanel />)
    expect(panel()).toBeTruthy()
    expect(screen.queryByTestId('panel-handle')).toBeNull()
    expect(panel()?.getAttribute('data-docked')).toBe('true')
  })

  it('Manual: no hover zone, and selecting never opens it; the handle still does', () => {
    useSettings.setState({ panelMode: 'manual' })
    render(<SettingsPanel />)
    expect(screen.queryByTestId('panel-hot-zone')).toBeNull()
    select([child])
    act(() => void vi.advanceTimersByTime(400))
    expect(panel()).toBeNull()
    fireEvent.click(screen.getByTestId('panel-handle'))
    expect(panel()).toBeTruthy()
  })

  it('the Preferences choice is remembered on this device', () => {
    useSettings.getState().setPanelMode('manual')
    expect(JSON.parse(localStorage.getItem('wishtaamaps:settings') ?? '{}').panelMode).toBe('manual')
  })
})

describe('keeping the selected topic visible', () => {
  it('glides the canvas left when the panel opens over the selected topic', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    // the topic sits at the right edge of a 1000 px canvas
    act(() => useEditor.setState({ viewport: { x: 0, y: 0, k: 1 }, canvasSize: { w: 1000, h: 700 } }))
    const box = { x: 700, y: 100, w: 200, h: 60 }
    const scene = await import('../scene')
    vi.spyOn(scene, 'getScene').mockReturnValue({ boxes: new Map([[child, box]]) } as never)
    render(<SettingsPanel />)
    select([child])
    act(() => void vi.advanceTimersByTime(200)) // opens
    act(() => void vi.advanceTimersByTime(400)) // glides
    expect(panel()).toBeTruthy()
    expect(st().viewport.x).toBeLessThan(0)
    expect(700 + 200 + st().viewport.x).toBeLessThanOrEqual(1000 - 320)
  })

  it('leaves the canvas alone when the topic is already clear of the panel', async () => {
    vi.useFakeTimers()
    act(() => useEditor.setState({ viewport: { x: 0, y: 0, k: 1 }, canvasSize: { w: 1000, h: 700 } }))
    const scene = await import('../scene')
    vi.spyOn(scene, 'getScene').mockReturnValue({ boxes: new Map([[child, { x: 100, y: 100, w: 200, h: 60 }]]) } as never)
    render(<SettingsPanel />)
    select([child])
    act(() => void vi.advanceTimersByTime(600))
    expect(st().viewport.x).toBe(0)
  })
})

describe('Read mode', () => {
  it('hides the editing panel and its handle', async () => {
    render(<SettingsPanel />)
    fireEvent.click(screen.getByTestId('panel-handle'))
    expect(panel()).toBeTruthy()
    await act(async () => void (await enterReadMode()))
    expect(panel()).toBeNull()
    expect(screen.queryByTestId('panel-handle')).toBeNull()
  })
})

describe('Picture format', () => {
  const sizeOf = (id: string) => st().topics[id]?.image
  const field = (name: string) => screen.getByRole('spinbutton', { name }) as HTMLInputElement

  beforeEach(() => select([pic], { imageSelected: pic }))

  it('shows the picture\'s size, and follows the resize handles while they are dragged', () => {
    render(<PictureFormat />)
    expect(field('Picture width').value).toBe('200')
    expect(field('Picture height').value).toBe('100')
    act(() => useEditor.setState({ imageLive: { topicId: pic, width: 320, height: 160, corner: 'se' } }))
    expect(field('Picture width').value).toBe('320')
    expect(field('Picture height').value).toBe('160')
    act(() => useEditor.setState({ imageLive: null }))
    expect(field('Picture width').value).toBe('200')
  })

  it('typing a width resizes the picture, keeping its proportions, in one undo step', () => {
    render(<PictureFormat />)
    fireEvent.change(field('Picture width'), { target: { value: '400' } })
    fireEvent.blur(field('Picture width'))
    expect(sizeOf(pic)).toMatchObject({ width: 400, height: 200 })
    expect(undoSteps()).toBe(1)
  })

  it('with proportions unlocked, width and height are independent', () => {
    render(<PictureFormat />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep aspect ratio' }))
    fireEvent.change(field('Picture width'), { target: { value: '400' } })
    fireEvent.blur(field('Picture width'))
    expect(sizeOf(pic)).toMatchObject({ width: 400, height: 100 })
  })

  it('sizes stay between 40 and 1200 px', () => {
    render(<PictureFormat />)
    fireEvent.click(screen.getByRole('button', { name: 'Keep aspect ratio' }))
    fireEvent.change(field('Picture width'), { target: { value: '5000' } })
    fireEvent.blur(field('Picture width'))
    expect(sizeOf(pic)?.width).toBe(1200)
    fireEvent.change(field('Picture width'), { target: { value: '3' } })
    fireEvent.blur(field('Picture width'))
    expect(sizeOf(pic)?.width).toBe(40)
  })

  it('"Apply this size to all pictures" asks first, then is ONE undo step', () => {
    render(<PictureFormat />)
    fireEvent.click(screen.getByRole('button', { name: /Apply this size to all pictures/ }))
    expect(screen.getByRole('alert').textContent).toMatch(/all 2 pictures/)
    expect(sizeOf(pic2)?.width).toBe(300) // nothing yet
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(sizeOf(pic2)?.width).toBe(300)
    expect(undoSteps()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: /Apply this size to all pictures/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply to all' }))
    expect(sizeOf(pic2)?.width).toBe(200)
    expect(sizeOf(pic)?.width).toBe(200)
    expect(undoSteps()).toBe(1)
  })

  it('position next to the text: five choices, one undo step', () => {
    render(<PictureFormat />)
    const group = screen.getByRole('radiogroup', { name: 'Picture position' })
    expect(within(group).getAllByRole('radio')).toHaveLength(5)
    fireEvent.click(within(group).getByRole('radio', { name: 'Behind the text' }))
    expect(sizeOf(pic)?.position).toBe('behind')
    expect(undoSteps()).toBe(1)
  })

  it('alt text is saved when you leave the field', () => {
    render(<PictureFormat />)
    const alt = screen.getByRole('textbox', { name: /Alt text/ })
    fireEvent.change(alt, { target: { value: 'A diagram of the asset cycle' } })
    expect(sizeOf(pic)?.alt).toBeUndefined()
    fireEvent.blur(alt)
    expect(sizeOf(pic)?.alt).toBe('A diagram of the asset cycle')
    expect(undoSteps()).toBe(1)
  })

  it('without a picture selected it says what to do', () => {
    select([child])
    render(<PictureFormat />)
    expect(screen.getByText(/Click a picture/)).toBeTruthy()
  })
})

describe('the floating picture toolbar', () => {
  it('appears for a selected picture with its tools, and is keyboard reachable', () => {
    select([pic], { imageSelected: pic })
    render(<PictureToolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Picture tools' })
    for (const n of ['Preview', 'Download original', 'Replace', 'Copy', 'Delete picture', 'More']) expect(within(bar).getByRole('button', { name: n }), n).toBeTruthy()
    const first = within(bar).getByRole('button', { name: 'Preview' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(within(bar).getByRole('button', { name: 'Download original' }))
  })

  it('Preview opens the full-screen viewer; Delete removes the picture (one undo step)', () => {
    select([pic], { imageSelected: pic })
    render(<PictureToolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(st().lightbox).toBe('img-a')
    fireEvent.click(screen.getByRole('button', { name: 'Delete picture' }))
    expect(st().topics[pic]?.image).toBeFalsy()
    expect(undoSteps()).toBe(1)
  })

  it('is not shown for a topic, for nothing, or in Read mode', async () => {
    const { container } = render(<PictureToolbar />)
    expect(container.firstChild).toBeNull()
    select([child])
    expect(container.firstChild).toBeNull()
    select([pic], { imageSelected: pic })
    expect(screen.getByRole('toolbar', { name: 'Picture tools' })).toBeTruthy()
    await act(async () => void (await enterReadMode()))
    expect(container.querySelector('[role=toolbar]')).toBeNull()
  })
})
