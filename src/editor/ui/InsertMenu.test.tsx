// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { toggleInsert } from '../content'
import { COMMANDS } from '../registry'
import { enterReadMode } from '../readmode'
import { closeFile, openFile } from '../session'
import { useEditor } from '../store'
import { CommandPalette } from './Overlays'
import { InsertMenu } from './InsertMenu'

let t = 1_700_000_000_000
beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Insert', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('Insert menu', () => {
  it('lists PDF from this device and PDF from Google Drive beside Picture and Attachment, in a portal above everything', () => {
    render(<InsertMenu />)
    act(() => toggleInsert(true))
    const menu = screen.getByRole('menu', { name: 'Insert' })
    expect(menu.parentElement).toBe(document.body) // a portal, not clipped by the header
    const labels = screen.getAllByRole('menuitem').map((b) => b.textContent ?? '')
    const at = (s: string) => labels.findIndex((l) => l.includes(s))
    expect(at('Picture')).toBeGreaterThanOrEqual(0)
    expect(at('PDF from this device')).toBeGreaterThan(at('Attachment'))
    expect(at('PDF from Google Drive')).toBe(at('PDF from this device') + 1)
    expect(Number(getComputedStyle(menu).zIndex) || Number((menu.className.match(/z-\[(\d+)\]/) ?? [])[1])).toBeGreaterThan(70)
  })

  it('is a sheet along the bottom on a narrow window', () => {
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    render(<InsertMenu />)
    act(() => toggleInsert(true))
    expect(screen.getByRole('menu', { name: 'Insert' }).getAttribute('data-insert-menu')).toBe('sheet')
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  })

  it('has "Insert PDF" commands that the palette shows in Edit mode and hides in Read mode', async () => {
    expect(COMMANDS.filter((c) => /^Insert PDF/.test(c.label)).map((c) => c.id)).toEqual(['insertPdf', 'insertPdfDrive'])
    const search = (r: ReturnType<typeof render>) => {
      act(() => useEditor.setState({ paletteOpen: true }))
      fireEvent.change(r.container.querySelector('input') as HTMLInputElement, { target: { value: 'insert pdf' } })
    }
    const edit = render(<CommandPalette />)
    search(edit)
    expect(edit.container.textContent).toContain('Insert PDF from this device')
    expect(edit.container.textContent).toContain('Insert PDF from Google Drive')
    edit.unmount()
    act(() => useEditor.setState({ paletteOpen: false }))
    await act(async () => void (await enterReadMode()))
    const read = render(<CommandPalette />)
    search(read)
    expect(read.container.textContent).not.toContain('Insert PDF')
  })
})
