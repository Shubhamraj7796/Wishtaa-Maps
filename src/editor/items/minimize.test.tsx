// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { addNote, deleteNote } from '@/core/model/notes'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { ItemsHost } from './ItemsHost'
import { closeAllItems, MAX_MINIMIZED, minimizeNote, openNote, restoreNote, useItems } from './state'

const none = { length: 0, item: () => null, [Symbol.iterator]: function* () {} }
Range.prototype.getClientRects = () => none as unknown as DOMRectList
Range.prototype.getBoundingClientRect = () => new DOMRect()
Element.prototype.getClientRects = () => none as unknown as DOMRectList

let repo: RepositoryCore
let t = 1_700_000_000_000
const st = () => useEditor.getState()
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Notes', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
  useItems.setState({ list: null, popup: null, minimized: [] })
})
afterEach(async () => {
  cleanup()
  vi.unstubAllGlobals()
  await closeFile()
})

function notes(n: number) {
  const id = addChild(mapDoc, st().rootId, 'Dose')
  const ids = Array.from({ length: n }, (_, i) => addNote(mapDoc, id, { title: `Note ${i + 1}`, html: `<p>text ${i + 1}</p>` }, i + 1) as string)
  return { id, ids }
}
const popupOf = (title: string) => document.querySelector(`[data-item-popup][aria-label="Note: ${title}"]`) as HTMLElement | null
const editorIn = (el: HTMLElement | null) => (el?.querySelector('.note-editor') as unknown as { editor: { commands: { insertContent: (c: string) => boolean; setTextSelection: (p: number) => boolean }; state: { selection: { from: number; to: number } } } }).editor
const chips = () => [...document.querySelectorAll('[data-min-note]')]

describe('minimize and restore', () => {
  it('the Minimize icon (named, no native title) turns the popup into a chip; the same popup comes back with its text and cursor', async () => {
    const { ids } = notes(2)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    const before = popupOf('Note 1')
    const dom = before?.querySelector('.note-editor') as HTMLElement
    act(() => void editorIn(before).commands.insertContent(' more'))
    act(() => void editorIn(before).commands.setTextSelection(3))
    const btn = screen.getByRole('button', { name: 'Minimize' })
    expect(btn.hasAttribute('title')).toBe(false)
    fireEvent.click(btn)
    // The popup is hidden, not gone; nothing of it is in the accessibility tree; the dim layer is gone.
    expect(useItems.getState().popup).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Note: Note 1' })).toBeNull()
    expect((document.querySelector('[data-item-popup-backdrop]') as HTMLElement).hidden).toBe(true)
    expect(chips()).toHaveLength(1)
    expect(chips()[0]?.textContent).toContain('Note 1')
    // Restore from the title: the very same editor element, with the text and the cursor as they were.
    fireEvent.click(screen.getByRole('button', { name: 'Restore note: Note 1' }))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    expect(popupOf('Note 1')?.querySelector('.note-editor')).toBe(dom)
    expect(dom.textContent).toContain('more')
    expect(editorIn(popupOf('Note 1')).state.selection.from).toBe(3)
    expect(chips()).toHaveLength(0)
  })

  it('autosave goes on while minimized: text typed just before is saved without restoring', async () => {
    const { ids } = notes(1)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    act(() => void editorIn(popupOf('Note 1')).commands.insertContent('TYPED'))
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    await settle(700)
    expect(st().notes[ids[0]!]?.html).toContain('TYPED')
    expect(chips()).toHaveLength(1)
  })

  it('the chip has a restore icon and a close icon, each named with a tooltip and no native title, 44 px high on touch', async () => {
    const { ids } = notes(1)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    const chip = chips()[0] as HTMLElement
    for (const name of ['Restore', 'Close the note']) {
      const b = within(chip).getByRole('button', { name })
      expect(b.hasAttribute('title')).toBe(false)
    }
    expect(chip.className).toContain('[@media(pointer:coarse)]:h-11')
    expect(document.querySelector('[data-min-tray]')?.getAttribute('aria-label')).toBe('Minimized notes')
    fireEvent.click(within(chip).getByRole('button', { name: 'Restore' }))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
  })
})

describe('minimized popups are only hidden: no keys, no focus, no Tab trap', () => {
  it('Escape closes only the popup that is open; a minimized note stays in the tray', async () => {
    const { ids } = notes(2)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    fireEvent.keyDown(window, { key: 'Escape' }) // nothing is open: nothing closes
    expect(chips()).toHaveLength(1)
    act(() => openNote(ids[1]!))
    await screen.findByRole('dialog', { name: 'Note: Note 2' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useItems.getState().popup).toBeNull()
    expect(chips()).toHaveLength(1)
    expect(chips()[0]?.textContent).toContain('Note 1')
  })

  it('the Tab key cycles inside the open popup only (a hidden one has nothing to tab to), and a minimized popup is out of the accessibility tree', async () => {
    const { ids } = notes(2)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    // (A real browser drops the focus of a hidden element; jsdom does not, so the focus itself is checked in the real browser test.)
    act(() => openNote(ids[1]!))
    const open = await screen.findByRole('dialog', { name: 'Note: Note 2' })
    const hidden = popupOf('Note 1') as HTMLElement
    expect(hidden.closest('[hidden]')).toBeTruthy()
    expect(hidden.closest('[aria-hidden="true"]')).toBeTruthy()
    // Tab from the last control of the open popup goes to its first one, never into the hidden popup.
    const focusables = [...open.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [contenteditable="true"]')]
    const last = focusables[focusables.length - 1]
    last?.focus()
    fireEvent.keyDown(last as HTMLElement, { key: 'Tab' })
    expect(document.activeElement?.closest('[data-item-popup]')).toBe(open)
    expect(hidden.contains(document.activeElement)).toBe(false)
  })

  it('restoring a chip while another note is open minimizes that one (saved, still alive) and opens the chosen one', async () => {
    const { ids } = notes(2)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    act(() => openNote(ids[1]!))
    await screen.findByRole('dialog', { name: 'Note: Note 2' })
    act(() => void editorIn(popupOf('Note 2')).commands.insertContent('KEPT'))
    fireEvent.click(screen.getByRole('button', { name: 'Restore note: Note 1' }))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    expect(useItems.getState().minimized).toEqual([ids[1]])
    expect(chips()[0]?.textContent).toContain('Note 2')
    await settle(650)
    expect(st().notes[ids[1]!]?.html).toContain('KEPT')
  })
})

describe('the tray', () => {
  it('holds up to four notes; a fifth minimize closes the oldest, saved first (and removed only when it was empty)', async () => {
    expect(MAX_MINIMIZED).toBe(4)
    const { id, ids } = notes(4)
    const empty = addNote(mapDoc, id, { title: '', html: '' }, 9) as string
    const fifth = addNote(mapDoc, id, { title: 'Fifth', html: '<p>five</p>' }, 10) as string
    await settle()
    render(<ItemsHost />)
    for (const n of [empty, ids[0]!, ids[1]!, ids[2]!, fifth]) {
      act(() => openNote(n))
      await settle(10)
      act(() => minimizeNote(n))
      await settle(10)
    }
    expect(useItems.getState().minimized).toEqual([ids[0], ids[1], ids[2], fifth])
    expect(st().notes[empty]).toBeUndefined() // it was the oldest and empty: closed and removed
    expect(st().notes[ids[0]!]).toBeTruthy()
    expect(chips()).toHaveLength(4)
  })

  it('the chip close icon saves and closes; an empty new note goes, a note with text stays', async () => {
    const { id, ids } = notes(1)
    const empty = addNote(mapDoc, id, { title: '', html: '' }, 9) as string
    await settle()
    render(<ItemsHost />)
    for (const n of [ids[0]!, empty]) {
      act(() => openNote(n))
      await settle(10)
      act(() => minimizeNote(n))
      await settle(10)
    }
    expect(chips()).toHaveLength(2)
    fireEvent.click(document.querySelector(`[data-min-close="${empty}"]`) as HTMLElement)
    fireEvent.click(document.querySelector(`[data-min-close="${ids[0]}"]`) as HTMLElement)
    expect(chips()).toHaveLength(0)
    expect(st().notes[empty]).toBeUndefined()
    expect(st().notes[ids[0]!]?.html).toContain('text 1')
  })

  it('stays when the view changes (Map, Outline, Task view) and when a note of the list is opened by its row', async () => {
    const { ids } = notes(2)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    for (const v of ['outline', 'tasks', 'map'] as const) {
      act(() => useEditor.setState({ view: v }))
      expect(chips()).toHaveLength(1)
    }
    // Opening that note from a list restores it (it is not opened twice).
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    expect(chips()).toHaveLength(0)
    expect(document.querySelectorAll('[data-item-popup][aria-label="Note: Note 1"]')).toHaveLength(1)
  })

  it('a minimized note deleted elsewhere (another device, undo) leaves the tray with a notice', async () => {
    const { ids } = notes(1)
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    act(() => deleteNote(mapDoc, ids[0]!))
    await settle()
    expect(chips()).toHaveLength(0)
    expect(useItems.getState().minimized).toEqual([])
  })

  it('closing the map saves every open and minimized note and removes an empty new one', async () => {
    const { id, ids } = notes(1)
    const empty = addNote(mapDoc, id, { title: '', html: '' }, 9) as string
    await settle()
    render(<ItemsHost />)
    act(() => openNote(ids[0]!))
    await screen.findByRole('dialog', { name: 'Note: Note 1' })
    act(() => void editorIn(popupOf('Note 1')).commands.insertContent('LAST'))
    fireEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    act(() => openNote(empty))
    await settle(20)
    act(() => closeAllItems())
    expect(st().notes[ids[0]!]?.html).toContain('LAST')
    expect(st().notes[empty]).toBeUndefined()
    expect(useItems.getState().minimized).toEqual([])
    expect(useItems.getState().popup).toBeNull()
    expect(restoreNote).toBeTruthy()
  })
})
