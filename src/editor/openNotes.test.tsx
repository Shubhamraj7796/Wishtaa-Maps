// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { addNote } from '@/core/model/notes'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { toggleNotes } from './actions'
import { ItemsHost } from './items/ItemsHost'
import { minimizeNote, openNote, useItems } from './items/state'
import { enterEditMode, enterReadMode } from './readmode'
import { COMMANDS, chordOf, commandFor, isReservedChord } from './registry'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'

const none = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
Range.prototype.getClientRects = () => none as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.getClientRects = () => none as unknown as DOMRectList

const key = (k: string, mods: Partial<KeyboardEventInit> = {}) => ({ key: k, ...mods }) as KeyboardEvent
const st = () => useEditor.getState()
let repo: RepositoryCore
let t = 1_700_000_000_000
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

describe('the shortcut for the notes', () => {
  it('"Open notes" is one palette entry on F8 and Alt+Shift+E; F8 is free and not reserved, and the keys that are taken stay as they were', () => {
    const c = COMMANDS.filter((x) => /notes/i.test(x.label) && x.id === 'notes')
    expect(c).toHaveLength(1)
    expect(c[0]?.label).toBe('Open notes')
    expect(c[0]?.keys).toEqual(['F8', 'Alt+Shift+E'])
    expect(c[0]?.palette).not.toBe(false)
    expect(COMMANDS.some((x) => x.label === 'Notes (rich text)')).toBe(false)
    expect(isReservedChord('F8')).toBe(false)
    expect(commandFor(key('F8'))?.id).toBe('notes')
    expect(commandFor(key('E', { altKey: true, shiftKey: true }))?.id).toBe('notes')
    // F4 is still the format panel, F9 the marks, F2 rename.
    expect(commandFor(key('F4'))?.id).toBe('panel')
    expect(commandFor(key('F9'))?.id).toBe('mark')
    expect(commandFor(key('F2'))?.id).toBe('rename')
  })

  it('Ctrl+N and Alt+F4 are never bound, to any command', () => {
    expect(isReservedChord('Ctrl+N')).toBe(true)
    expect(isReservedChord('Alt+F4')).toBe(true)
    expect(commandFor(key('n', { ctrlKey: true }))).toBeUndefined()
    expect(commandFor(key('F4', { altKey: true }))).toBeUndefined()
    const all = COMMANDS.flatMap((x) => x.keys ?? []).map((k) => k.toUpperCase())
    expect(all).not.toContain('CTRL+N')
    expect(all.filter((k) => k.includes('F4') && k.startsWith('ALT'))).toEqual([])
    expect(chordOf(key('n', { ctrlKey: true }))).toBe('Ctrl+N')
  })
})

describe('what Open notes does', () => {
  beforeEach(async () => {
    installMemoryLocalStorage()
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('768'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
    repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    const f = await repo.create({ type: 'map', name: 'Notes', content: buildStarterContent('blank') })
    await openFile(f.id, repo)
    await settle()
    useItems.setState({ list: null, popup: null, minimized: [] })
    act(() => useEditor.setState({ panelOpen: false, panelTab: 'style' }))
  })
  afterEach(async () => {
    cleanup()
    vi.unstubAllGlobals()
    await closeFile()
  })

  const note = (title: string) => {
    const id = addChild(mapDoc, st().rootId, title)
    return addNote(mapDoc, id, { title, html: `<p>${title}</p>` }) as string
  }

  it('opens the side panel on the Notes tab, and closes it when that tab is already showing', () => {
    act(() => toggleNotes())
    expect(st().panelOpen).toBe(true)
    expect(st().panelTab).toBe('notes')
    act(() => toggleNotes())
    expect(st().panelOpen).toBe(false)
  })

  it('with a note open it minimizes the note; with notes in the tray it brings the last one back', async () => {
    const a = note('Alpha')
    const b = note('Beta')
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: Alpha' })
    act(() => toggleNotes())
    expect(useItems.getState().popup).toBeNull()
    expect(useItems.getState().minimized).toEqual([a])
    act(() => openNote(b))
    await screen.findByRole('dialog', { name: 'Note: Beta' })
    act(() => minimizeNote(b))
    expect(useItems.getState().minimized).toEqual([a, b])
    act(() => toggleNotes()) // the last one comes back
    await screen.findByRole('dialog', { name: 'Note: Beta' })
    expect(useItems.getState().minimized).toEqual([a])
  })

  it('inside a note popup F8 minimizes it (the popup takes this key itself); other keys with F8 do not', async () => {
    const a = note('Alpha')
    await settle()
    render(<ItemsHost />)
    act(() => openNote(a))
    await screen.findByRole('dialog', { name: 'Note: Alpha' })
    fireEvent.keyDown(window, { key: 'F8', ctrlKey: true })
    expect(useItems.getState().popup?.id).toBe(a)
    fireEvent.keyDown(window, { key: 'F8' })
    expect(useItems.getState().popup).toBeNull()
    expect(useItems.getState().minimized).toEqual([a])
  })

  it('does nothing in Read mode (there is no Notes tab there)', async () => {
    await act(async () => void (await enterReadMode('user')))
    await settle()
    act(() => toggleNotes())
    expect(st().panelOpen).toBe(false)
    await act(async () => void (await enterEditMode()))
  })
})
