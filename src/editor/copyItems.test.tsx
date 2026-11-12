// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { addNote } from '@/core/model/notes'
import { addTask } from '@/core/model/tasks'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { cmdCopy } from './actions'
import { COMMANDS } from './registry'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'

let repo: RepositoryCore
let t = 1_700_000_000_000
const settle = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

beforeEach(async () => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
  const f = await repo.create({ type: 'map', name: 'Copy', content: buildStarterContent('blank') })
  await openFile(f.id, repo)
  await settle()
})
afterEach(async () => {
  await closeFile()
})

describe('Copy as text: notes and tasks are an opt-in', () => {
  it('Copy leaves them out as it always did; "Copy with notes and tasks" adds [Note] and [Task] lines, with the time', async () => {
    const root = useEditor.getState().rootId
    const dose = addChild(mapDoc, root, 'Dose')
    setNote(mapDoc, dose, '<p>first note</p>')
    addNote(mapDoc, dose, { title: 'Storage', html: '<p>cold</p>' })
    addTask(mapDoc, { topicId: dose, title: 'Call', due: '2026-11-14', time: '17:00' })
    await settle()
    act(() => useEditor.setState({ selected: [dose] }))
    const plain = cmdCopy()
    expect(plain).toBe('Dose')
    const full = cmdCopy(true)
    expect(full).toContain('Dose')
    expect(full).toContain('[Note] first note')
    expect(full).toContain('[Note] Storage: cold')
    expect(full).toContain('[Task] [ ] Call (due 2026-11-14 17:00)')
    // The plain copy is still what the default command does.
    expect(COMMANDS.find((c) => c.id === 'copy')?.label).toBe('Copy')
    expect(COMMANDS.find((c) => c.id === 'copyItems')?.label).toBe('Copy with notes and tasks (as text)')
  })
})
