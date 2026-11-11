// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { COMMANDS, READ_SAFE, chordOf, commandFor, isReservedChord } from '../registry'
import { closeFile, mapDoc, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { closePdfPanel, collapsePdf, restoreCollapsedPanel, restorePdf, setPdfSize, togglePdfCollapse, togglePdfPanel } from './actions'
import { loadWorkspace, saveWorkspace, type Workspace } from './workspace'

let t = 1_700_000_000_000
const st = () => useEditor.getState()

beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Collapse', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), open: true } }))
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('Collapse PDF: the shortcut and the command', () => {
  it('Alt+Shift+F is the shortcut, it is not reserved by the browser, and no other command uses it', () => {
    const cmd = COMMANDS.find((c) => c.id === 'pdfCollapse')
    expect(cmd?.keys).toEqual(['Alt+Shift+F'])
    expect(isReservedChord('Alt+Shift+F')).toBe(false)
    const users = COMMANDS.filter((c) => (c.keys ?? []).some((k) => k.toUpperCase() === 'ALT+SHIFT+F'))
    expect(users.map((c) => c.id)).toEqual(['pdfCollapse'])
  })

  it('a key press of Alt+Shift+F finds the command (also on a layout where the letter changes with Alt held)', () => {
    const press = (init: KeyboardEventInit) => commandFor(new KeyboardEvent('keydown', init))?.id
    expect(press({ key: 'F', code: 'KeyF', altKey: true, shiftKey: true })).toBe('pdfCollapse')
    expect(press({ key: 'ƒ', code: 'KeyF', altKey: true, shiftKey: true })).toBe('pdfCollapse')
    expect(chordOf(new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', altKey: true, shiftKey: true }))).toBe('Alt+Shift+F')
  })

  it('it only changes the view, so Read mode may use it', () => {
    expect(READ_SAFE.has('pdfCollapse')).toBe(true)
  })

  it('is in the command palette and the shortcut sheet by its label', () => {
    const cmd = COMMANDS.find((c) => c.id === 'pdfCollapse')
    expect(cmd?.label).toMatch(/Collapse the PDF/)
    expect(cmd?.group).toBe('View')
  })
})

describe('Collapse PDF: the actions', () => {
  it('collapse and restore swap the collapsed flag and change nothing else of the panel', () => {
    act(() => useEditor.setState({ pdfPanel: { ...st().pdfPanel, page: 7, zoom: 1.5, size: 'wide', tool: 'pen', markupBar: true, tabs: ['a', 'b'], sourceId: 'a', views: { a: { page: 7, zoom: 1.5, two: true, cover: true, anchor: { n: 7, frac: 0.4 } } } } }))
    const before = { ...st().pdfPanel }
    expect(collapsePdf()).toBe(true)
    expect(st().pdfPanel.collapsed).toBe(true)
    expect({ ...st().pdfPanel, collapsed: false, drawer: before.drawer }).toEqual(before)
    expect(restorePdf()).toBe(true)
    expect(st().pdfPanel).toEqual(before)
  })

  it('does nothing when there is no PDF panel, or when it is already in that state', () => {
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    expect(collapsePdf()).toBe(false)
    togglePdfCollapse()
    expect(st().pdfPanel.collapsed).toBe(false)
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), open: true } }))
    expect(restorePdf()).toBe(false)
  })

  it('toggle: collapse, then open, then collapse', () => {
    togglePdfCollapse()
    expect(st().pdfPanel.collapsed).toBe(true)
    togglePdfCollapse()
    expect(st().pdfPanel.collapsed).toBe(false)
    togglePdfCollapse()
    expect(st().pdfPanel.collapsed).toBe(true)
  })

  it('Full screen: collapse and restore return to Full (a size is never touched by collapsing)', () => {
    setPdfSize('full')
    collapsePdf()
    expect(st().pdfPanel.size).toBe('full')
    restorePdf()
    expect(st().pdfPanel.size).toBe('full')
  })

  it('choosing a size by hand while collapsed brings the panel back (the size button always works)', () => {
    collapsePdf()
    setPdfSize('wide')
    expect(st().pdfPanel.collapsed).toBe(false)
    expect(st().pdfPanel.size).toBe('wide')
  })
})

describe('Collapse PDF: remembered across a reload', () => {
  const base: Workspace = { sourceId: 'a', other: null, activeSide: 'left', tabs: ['a', 'b'], views: { a: { page: 7, zoom: 1.5, two: true, cover: true, anchor: { n: 7, frac: 0.4 } }, b: { page: 1, zoom: null } }, ratio: 0.5, sync: false, page: 7, zoom: 1.5 }
  const store = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), raw: m }
  }

  it('saves collapsed and the size only while collapsed; an open panel saves neither (old saves are unchanged)', () => {
    const s = store()
    saveWorkspace('f', { ...base, collapsed: true, size: 'full' }, s)
    expect(JSON.parse([...s.raw.values()][0] as string)).toMatchObject({ collapsed: true, size: 'full' })
    const open = store()
    saveWorkspace('f', { ...base, collapsed: false, size: 'wide' }, open)
    const saved = JSON.parse([...open.raw.values()][0] as string)
    expect(saved.collapsed).toBeUndefined()
    expect(saved.size).toBeUndefined()
  })

  it('loads them back; a damaged size becomes Normal; a save from before loads as it did', () => {
    const s = store()
    saveWorkspace('f', { ...base, collapsed: true, size: 'wide' }, s)
    const back = loadWorkspace('f', new Set(['a', 'b']), s)
    expect(back).toMatchObject({ collapsed: true, size: 'wide' })
    expect(back?.views?.a).toMatchObject({ page: 7, zoom: 1.5, two: true, cover: true, anchor: { n: 7, frac: 0.4 } })
    s.setItem('wishtaamaps:pdf-workspace:g', JSON.stringify({ v: 1, tabs: ['a'], active: 'a', other: null, side: 'left', ratio: 0.5, sync: false, views: {}, collapsed: true, size: 'huge' }))
    expect(loadWorkspace('g', new Set(['a']), s)?.size).toBe('normal')
    s.setItem('wishtaamaps:pdf-workspace:h', JSON.stringify({ v: 1, tabs: ['a'], active: 'a', other: null, side: 'left', ratio: 0.5, sync: false, views: {} }))
    const old = loadWorkspace('h', new Set(['a']), s)
    expect(old?.collapsed).toBeUndefined()
    expect(old?.size).toBeUndefined()
  })

  async function twoSources() {
    for (const [id, name] of [['a', 'A.pdf'], ['b', 'B.pdf']] as const) mapDoc.pdfSources.set(id, { id, name, size: 10, hash: `h${id}`, pages: 20, addedAt: id === 'a' ? 1 : 2 })
    await act(async () => void (await Promise.resolve()))
  }
  const panelState = () => ({ ...base, open: true, tool: 'pen' as const, markupBar: true, size: 'full' as const })

  it('a collapsed panel comes back collapsed after a reload: same tabs, pages, zoom, layout and size (Full included)', async () => {
    await twoSources()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    // The reload: a new session has a closed panel and the map opens again.
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    expect(st().pdfPanel.open).toBe(false)
    expect(restoreCollapsedPanel()).toBe(true)
    const p = st().pdfPanel
    expect(p.open).toBe(true)
    expect(p.collapsed).toBe(true)
    expect(p.size).toBe('full')
    expect(p.tabs).toEqual(['a', 'b'])
    expect(p.sourceId).toBe('a')
    expect(p.views['a']).toMatchObject({ page: 7, zoom: 1.5, two: true, cover: true, anchor: { n: 7, frac: 0.4 } })
    // And opening it again lands on the same page.
    restorePdf()
    expect(st().pdfPanel.page).toBe(7)
    expect(st().pdfPanel.zoom).toBe(1.5)
  })

  it('a panel that was closed stays closed; so does one that was open (not collapsed)', async () => {
    await twoSources()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    act(() => void restorePdf())
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    expect(restoreCollapsedPanel()).toBe(false) // it was open when last used
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    act(() => closePdfPanel()) // closing saves "not collapsed"
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    expect(restoreCollapsedPanel()).toBe(false)
    expect(st().pdfPanel.open).toBe(false)
  })

  it('choosing a size while collapsed opens it and saves that it is no longer collapsed', async () => {
    await twoSources()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    act(() => setPdfSize('wide'))
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    expect(restoreCollapsedPanel()).toBe(false)
  })

  it('nothing is restored when the PDFs are no longer in the map', async () => {
    await twoSources()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    mapDoc.pdfSources.delete('a')
    mapDoc.pdfSources.delete('b')
    await act(async () => void (await Promise.resolve()))
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    expect(restoreCollapsedPanel()).toBe(false)
  })

  it('the PDF button of the editor still opens the panel normally, never collapsed, even when a collapsed state was saved', async () => {
    await twoSources()
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    act(() => useEditor.setState({ pdfPanel: closedPdfPanel() }))
    act(() => togglePdfPanel())
    expect(st().pdfPanel.open).toBe(true)
    expect(st().pdfPanel.collapsed).toBe(false)
    expect(st().pdfPanel.tabs).toEqual(['a', 'b']) // the tabs and places come back
  })

  it('does nothing without PDFs, without a saved state, or when the panel is already open', async () => {
    expect(restoreCollapsedPanel()).toBe(false)
    await twoSources()
    expect(restoreCollapsedPanel()).toBe(false)
    act(() => useEditor.setState({ pdfPanel: { ...closedPdfPanel(), ...panelState() } }))
    act(() => void collapsePdf())
    expect(restoreCollapsedPanel()).toBe(false) // already open
  })
})
