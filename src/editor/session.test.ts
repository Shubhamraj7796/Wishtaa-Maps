// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { installMemoryLocalStorage } from '../test/memoryStorage'
import { buildStarterContent } from '@/core/files/templates'
import type { FileRepository } from '@/core/files/types'
import { addChild } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { buildSaveMeta, closeFile, openFile, renameOpenFile, mapDoc } from './session'
import { useEditor } from './store'

let repo: FileRepository
let t = 1_700_000_000_000

beforeEach(() => {
  installMemoryLocalStorage()
  repo = new RepositoryCore(new MemoryBackend(), () => (t += 1000))
})
afterEach(async () => {
  await closeFile()
})

const topicCount = () => Object.keys(useEditor.getState().topics).length

describe('opening a file', () => {
  it('loads the content into the editor and records it as the last opened file', async () => {
    const f = await repo.create({ type: 'kb', name: 'Notes', content: buildStarterContent('kb') })
    const opened = await openFile(f.id, repo)
    expect(opened?.id).toBe(f.id)
    const s = useEditor.getState()
    expect(s.fileId).toBe(f.id)
    expect(s.fileType).toBe('kb')
    expect(s.title).toBe('Notes')
    expect(Object.values(s.topics).map((x) => x.text)).toEqual(expect.arrayContaining(['Concepts', 'Resources', 'Projects', 'Notes']))
    expect(localStorage.getItem('wishtaamaps:last-open')).toBe(f.id)
  })

  it('returns null for a missing file, a folder, or a file in the bin', async () => {
    const folder = await repo.create({ type: 'folder', name: 'F' })
    const gone = await repo.create({ type: 'map', content: buildStarterContent('blank') })
    await repo.trash(gone.id)
    expect(await openFile('nope', repo)).toBeNull()
    expect(await openFile(folder.id, repo)).toBeNull()
    expect(await openFile(gone.id, repo)).toBeNull()
  })

  it('does not mix up two files when switching', async () => {
    const a = await repo.create({ type: 'map', name: 'A', content: buildStarterContent('blank') })
    const b = await repo.create({ type: 'kb', name: 'B', content: buildStarterContent('kb') })
    await openFile(a.id, repo)
    const rootA = useEditor.getState().rootId
    addChild(mapDoc, rootA, 'Only in A')
    await openFile(b.id, repo)
    const texts = Object.values(useEditor.getState().topics).map((x) => x.text)
    expect(texts).not.toContain('Only in A')
    expect(useEditor.getState().fileId).toBe(b.id)
    // A was saved before B opened.
    const saved = await repo.getIndex(a.id)
    expect(saved?.topics.map((x) => x.text)).toContain('Only in A')
  })
})

describe('autosave with file metadata', () => {
  it('updates modified time, thumbnail, topic count and search index when the map changes', async () => {
    const f = await repo.create({ type: 'map', name: 'Plan', content: buildStarterContent('blank') })
    await openFile(f.id, repo)
    const before = (await repo.get(f.id))!
    expect(before.thumbnail).toBeFalsy()

    const rootId = useEditor.getState().rootId
    const id = addChild(mapDoc, rootId, 'Budget review')
    setNote(mapDoc, id, '<p>Check the <strong>quarterly</strong> numbers</p>')
    await closeFile() // flushes the pending save

    const after = (await repo.get(f.id))!
    expect(after.modifiedAt).toBeGreaterThan(before.modifiedAt)
    expect(after.topicCount).toBe(2)
    expect(after.thumbnail?.startsWith('data:image/svg+xml')).toBe(true)
    const hits = await repo.search({ text: 'quarterly' })
    expect(hits.map((h) => h.file.id)).toEqual([f.id])
    expect(hits[0]?.matched).toBe('note')
  })

  it('keeps editing live after React mounts the screen twice (open, close, open)', async () => {
    const f = await repo.create({ type: 'map', name: 'Twice', content: buildStarterContent('blank') })
    // What StrictMode does in development: open, clean up, open again.
    const first = openFile(f.id, repo)
    const closing = closeFile()
    const second = openFile(f.id, repo)
    await Promise.all([first, closing, second])

    expect(useEditor.getState().fileId).toBe(f.id)
    const before = topicCount()
    addChild(mapDoc, useEditor.getState().rootId, 'After remount')
    expect(topicCount()).toBe(before + 1) // the store still follows the document
    await closeFile()
    const saved = await repo.get(f.id)
    expect(saved?.topicCount).toBe(before + 1)
  })

  it('saves nothing when nothing changed', async () => {
    const f = await repo.create({ type: 'map', content: buildStarterContent('blank') })
    const created = (await repo.get(f.id))!
    await openFile(f.id, repo)
    await closeFile()
    expect((await repo.get(f.id))!.modifiedAt).toBe(created.modifiedAt)
  })

  it('builds metadata for the open map: counts and an index of its topics', async () => {
    const f = await repo.create({ type: 'kb', content: buildStarterContent('kb') })
    await openFile(f.id, repo)
    const meta = buildSaveMeta(f.id)
    expect(meta.topicCount).toBe(5)
    expect(meta.index?.fileId).toBe(f.id)
    expect(meta.index?.topics.map((x) => x.text)).toContain('Concepts')
    expect(meta.thumbnail).toMatch(/^data:image\/svg\+xml/)
  })

  it('renames the file from the header', async () => {
    const f = await repo.create({ type: 'map', name: 'Old', content: buildStarterContent('blank') })
    await openFile(f.id, repo)
    await renameOpenFile('New name', repo)
    expect((await repo.get(f.id))?.name).toBe('New name')
    expect(useEditor.getState().title).toBe('New name')
  })
})
