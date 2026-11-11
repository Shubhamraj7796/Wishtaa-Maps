// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { COMMANDS, READ_SAFE, chordOf, commandFor, isReservedChord } from '../registry'
import { closeFile, openFile } from '../session'
import { closedPdfPanel, useEditor } from '../store'
import { collapsePdf, restorePdf, setPdfSize, togglePdfCollapse } from './actions'

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
