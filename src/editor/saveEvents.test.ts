// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { buildStarterContent } from '@/core/files/templates'
import { addChild } from '@/core/model/commands'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { enterEditMode, enterReadMode } from './readmode'
import { emitMapSaved, onMapSaved } from './saveEvents'
import { closeFile, mapDoc, openFile } from './session'
import { useEditor } from './store'

const settle = (ms = 700) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

describe('the "map saved" announcement', () => {
  let repo: RepositoryCore
  let t = 1_700_000_000_000
  beforeEach(async () => {
    installMemoryLocalStorage()
    repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
    const f = await repo.create({ type: 'map', name: 'Saved', content: buildStarterContent('blank') })
    await openFile(f.id, repo)
    await settle(50)
  })
  afterEach(async () => {
    await closeFile()
  })

  it('announces the number of topics after the person edits, and only then', async () => {
    const seen: number[] = []
    const off = onMapSaved((n) => seen.push(n))
    await settle() // opening a map is not an edit
    expect(seen).toEqual([])
    const root = useEditor.getState().rootId
    act(() => {
      addChild(mapDoc, root, 'One')
      addChild(mapDoc, root, 'Two')
    })
    await settle()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBe(Object.keys(useEditor.getState().topics).length)
    expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(3)
    off()
  })

  it('says nothing in Read mode', async () => {
    const seen: number[] = []
    const off = onMapSaved((n) => seen.push(n))
    await act(async () => void (await enterReadMode('user')))
    await settle()
    expect(seen).toEqual([])
    await act(async () => void (await enterEditMode()))
    off()
  })

  it('a listener that throws never breaks the others', () => {
    const ok = vi.fn()
    const off1 = onMapSaved(() => {
      throw new Error('boom')
    })
    const off2 = onMapSaved(ok)
    expect(() => emitMapSaved(7)).not.toThrow()
    expect(ok).toHaveBeenCalledWith(7)
    off1()
    off2()
  })
})
