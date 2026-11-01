// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import * as A from '../actions'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { QuickToolbar } from './QuickToolbar'

let t = 1_700_000_000_000
let child = ''
const bar = () => screen.getByRole('toolbar', { name: 'Quick format' })

beforeEach(async () => {
  installMemoryLocalStorage()
  const repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'kb', name: 'Camera', content: buildStarterContent('kb') })
  await openFile(f.id, repo)
  child = addChild(mapDoc, useEditor.getState().rootId, 'Child')
  await waitFor(() => expect(useEditor.getState().topics[child]).toBeDefined())
  A.selectOnly(child)
  act(() => useEditor.setState({ pictureMenu: null }))
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('the camera button in the quick toolbar', () => {
  it('is right after Bold, before Italic, with a camera icon', () => {
    render(<QuickToolbar />)
    const names = within(bar())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'))
    const bold = names.indexOf('Bold')
    expect(bold).toBeGreaterThan(-1)
    expect(names[bold + 1]).toBe('Add picture')
    expect(names[bold + 2]).toBe('Italic')
    const button = within(bar()).getByRole('button', { name: 'Add picture' })
    expect(button.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-camera/)
    expect(button.getAttribute('title')).toMatch(/Add a picture to this topic/)
  })

  it('opens the usual Add picture menu for the selected topic (so the Compressed or Original choice applies)', () => {
    render(<QuickToolbar />)
    fireEvent.click(within(bar()).getByRole('button', { name: 'Add picture' }))
    return waitFor(() => expect(useEditor.getState().pictureMenu).toEqual({ kind: 'topic', id: child }))
  })

  it('is still in the More menu too', () => {
    render(<QuickToolbar />)
    fireEvent.click(within(bar()).getByRole('button', { name: 'More' }))
    expect(screen.getByRole('menuitem', { name: 'Add picture…' })).toBeTruthy()
  })
})
