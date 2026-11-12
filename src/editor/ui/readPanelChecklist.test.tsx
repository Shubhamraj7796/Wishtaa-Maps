// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { closeFile, mapDoc, openFile } from '../session'
import { useEditor } from '../store'
import { ReadPanel } from './ReadPanel'

let repo: RepositoryCore
let t = 1_700_000_000_000
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Read', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
})
afterEach(async () => {
  cleanup()
  await closeFile()
})

describe('a checklist in the Read mode side panel', () => {
  it('is drawn from the stored text (no live input), with the state in data-checked, inside the .note-read box that styles it', async () => {
    const id = addChild(mapDoc, useEditor.getState().rootId, 'Dose')
    setNote(mapDoc, id, '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><p>Order stock</p></li><li data-checked="true" data-type="taskItem"><p>Call supplier</p></li></ul>')
    await settle()
    act(() => useEditor.setState({ selected: [id] }))
    const { container } = render(<ReadPanel />)
    const box = container.querySelector('.note-read') as HTMLElement
    expect(box).toBeTruthy()
    expect(box.querySelectorAll('ul[data-type="taskList"] > li')).toHaveLength(2)
    expect([...box.querySelectorAll('li')].map((li) => li.getAttribute('data-checked'))).toEqual(['false', 'true'])
    expect(box.querySelector('input')).toBeNull() // nothing in Read mode can be pressed
    expect(box.textContent).toContain('Call supplier')
  })

  it('has its CSS: a brand-green box, a tick, strike-through and grey for a ticked item, and a name for a screen reader', () => {
    const css = readFileSync('src/styles/tailwind.css', 'utf8')
    expect(css).toMatch(/\.note-read ul\[data-type='taskList'\] > li::before/)
    expect(css).toMatch(/li\[data-checked='true'\] > p \{ text-decoration: line-through/)
    expect(css).toContain("/ 'Done'")
    expect(css).toContain("/ 'Not done'")
    expect(css).toMatch(/\.note-editor ul\[data-type='taskList'\] > li\[data-checked='true'\] > div > p \{ text-decoration: line-through/)
  })
})
