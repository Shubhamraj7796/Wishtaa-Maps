import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { fileLink, linkedFile, normalizeLink } from '../links'
import { addChild } from '../model/commands'
import { addTag, setLink, setNote, addAttachment } from '../model/content'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import { setImage } from '../model/commands'
import { loadInto } from '../persistence'
import { encodeDoc } from '../persistence'
import { FileError, MemoryBackend, RepositoryCore } from './core'
import { IndexedDbBackend } from './idb'
import { buildFileIndex, findBacklinks, referencedIds } from './indexer'
import { buildStarterContent } from './templates'
import { breadcrumbs, childrenOfFolder, descendantsOf, folderOptions, isInside, sortFiles, trashRoots, uniqueName } from './tree'
import type { FileRecord } from './types'

function repo() {
  let t = 1000
  const backend = new MemoryBackend()
  const r = new RepositoryCore(backend, () => ++t)
  return { r, backend }
}

describe('creating and listing', () => {
  it('creates maps, knowledge bases and folders with sensible default names', async () => {
    const { r } = repo()
    const a = await r.create({ type: 'map' })
    const b = await r.create({ type: 'map' })
    const kb = await r.create({ type: 'kb' })
    const f = await r.create({ type: 'folder' })
    expect([a.name, b.name, kb.name, f.name]).toEqual(['Untitled map', 'Untitled map 2', 'Untitled knowledge base', 'New folder'])
    expect(a.storage).toBe('local')
    expect(f.contentRef).toBeNull()
    expect(a.contentRef).toBe(a.id)
  })

  it('cleans names and falls back when empty', async () => {
    const { r } = repo()
    expect((await r.create({ type: 'map', name: '  Budget\n plan  ' })).name).toBe('Budget plan')
    expect((await r.create({ type: 'map', name: 'x'.repeat(500) })).name).toHaveLength(120)
    expect((await r.update((await r.create({ type: 'map' })).id, { name: '   ' })).name).toBe('Untitled map')
  })

  it('nests files to any depth and lists one level at a time', async () => {
    const { r } = repo()
    let parent: string | null = null
    const ids: string[] = []
    for (let i = 0; i < 6; i++) {
      const f: FileRecord = await r.create({ type: 'folder', parentId: parent, name: `L${i}` })
      ids.push(f.id)
      parent = f.id
    }
    const leaf = await r.create({ type: 'map', parentId: parent, name: 'deep map' })
    expect((await r.list({ parentId: null })).map((f) => f.name)).toEqual(['L0'])
    expect((await r.list({ parentId: parent })).map((f) => f.name)).toEqual(['deep map'])
    expect((await r.list({ parentId: 'any' })).length).toBe(7)
    expect(breadcrumbs(await r.list({ parentId: 'any' }), leaf.parentId).map((f) => f.name)).toEqual(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'])
  })

  it('refuses a parent that is missing, not a folder, or in the bin', async () => {
    const { r } = repo()
    const m = await r.create({ type: 'map' })
    const f = await r.create({ type: 'folder' })
    await expect(r.create({ type: 'map', parentId: 'ghost' })).rejects.toThrow(FileError)
    await expect(r.create({ type: 'map', parentId: m.id })).rejects.toThrow(/folder/)
    await r.trash(f.id)
    await expect(r.create({ type: 'map', parentId: f.id })).rejects.toThrow(/bin/)
  })

  it('filters by type and star, and sorts by modified time, name and created time', async () => {
    const { r } = repo()
    const a = await r.create({ type: 'map', name: 'Banana' })
    const b = await r.create({ type: 'kb', name: 'apple' })
    const c = await r.create({ type: 'map', name: 'Cherry' })
    await r.update(a.id, { starred: true })
    await r.saveContent(a.id, new Uint8Array([1])) // a is now the most recently modified
    expect((await r.list({ types: ['kb'] })).map((f) => f.id)).toEqual([b.id])
    expect((await r.list({ starred: true })).map((f) => f.id)).toEqual([a.id])
    expect((await r.list()).map((f) => f.name)).toEqual(['Banana', 'Cherry', 'apple'])
    expect((await r.list({ sort: { key: 'modified', dir: 'asc' } })).map((f) => f.name)).toEqual(['apple', 'Cherry', 'Banana'])
    expect((await r.list({ sort: { key: 'name', dir: 'asc' } })).map((f) => f.name)).toEqual(['apple', 'Banana', 'Cherry'])
    expect((await r.list({ sort: { key: 'created', dir: 'desc' } })).map((f) => f.id)).toEqual([c.id, b.id, a.id])
  })

  it('always lists folders before files', async () => {
    const { r } = repo()
    await r.create({ type: 'map', name: 'a' })
    await r.create({ type: 'folder', name: 'z' })
    expect((await r.list({ sort: { key: 'name', dir: 'asc' } })).map((f) => f.type)).toEqual(['folder', 'map'])
    expect((await r.list({ sort: { key: 'name', dir: 'desc' } })).map((f) => f.type)).toEqual(['folder', 'map'])
  })
})

describe('moving', () => {
  it('moves files and whole folders', async () => {
    const { r } = repo()
    const a = await r.create({ type: 'folder', name: 'A' })
    const b = await r.create({ type: 'folder', name: 'B' })
    const m = await r.create({ type: 'map', parentId: a.id })
    expect((await r.move(m.id, b.id)).parentId).toBe(b.id)
    await r.move(b.id, a.id)
    expect((await r.get(b.id))?.parentId).toBe(a.id)
    expect((await r.move(m.id, null)).parentId).toBeNull()
  })

  it("won't move a folder into itself or its own contents", async () => {
    const { r } = repo()
    const a = await r.create({ type: 'folder' })
    const inner = await r.create({ type: 'folder', parentId: a.id })
    await expect(r.move(a.id, a.id)).rejects.toThrow(/itself/)
    await expect(r.move(a.id, inner.id)).rejects.toThrow(/itself/)
  })

  it("won't move into a file, a missing folder, or move something in the bin", async () => {
    const { r } = repo()
    const m = await r.create({ type: 'map' })
    const m2 = await r.create({ type: 'map' })
    await expect(r.move(m.id, m2.id)).rejects.toThrow(/folder/)
    await expect(r.move(m.id, 'ghost')).rejects.toThrow(FileError)
    await r.trash(m.id)
    await expect(r.move(m.id, null)).rejects.toThrow(/bin/)
  })
})

describe('trash, restore and delete', () => {
  it('trashing a folder takes its contents; restoring brings them back together', async () => {
    const { r } = repo()
    const f = await r.create({ type: 'folder' })
    const sub = await r.create({ type: 'folder', parentId: f.id })
    const m = await r.create({ type: 'map', parentId: sub.id })
    await r.trash(f.id)
    expect(await r.list()).toEqual([])
    const bin = await r.list({ trashed: true })
    expect(bin).toHaveLength(3)
    expect(trashRoots(bin).map((x) => x.id)).toEqual([f.id]) // only the folder is shown in the bin
    await r.restore(f.id)
    expect((await r.list({ parentId: 'any' })).map((x) => x.id).sort()).toEqual([f.id, m.id, sub.id].sort())
    expect((await r.get(m.id))?.parentId).toBe(sub.id)
  })

  it('restores to the top level when its folder is still in the bin', async () => {
    const { r } = repo()
    const f = await r.create({ type: 'folder' })
    const m = await r.create({ type: 'map', parentId: f.id })
    await r.trash(m.id)
    await r.trash(f.id)
    await r.restore(m.id)
    expect((await r.get(m.id))?.parentId).toBeNull()
    expect((await r.get(f.id))?.trashed).toBe(true)
  })

  it('deletes forever, with contents and index, and can empty the bin', async () => {
    const { r, backend } = repo()
    const f = await r.create({ type: 'folder' })
    const m = await r.create({ type: 'map', parentId: f.id, content: new Uint8Array([1, 2]) })
    await r.saveContent(m.id, new Uint8Array([3]), { index: { fileId: m.id, topics: [], resources: [] } })
    await r.trash(f.id)
    await r.remove(f.id)
    expect(await r.get(f.id)).toBeNull()
    expect(await r.get(m.id)).toBeNull()
    expect(backend.content.size).toBe(0)
    expect(backend.indexes.size).toBe(0)
    const a = await r.create({ type: 'map' })
    const b = await r.create({ type: 'map' })
    await r.trash(a.id)
    await r.emptyTrash()
    expect((await r.list({ trashed: true })).length).toBe(0)
    expect(await r.get(b.id)).not.toBeNull()
  })

  it('hides trashed items from search', async () => {
    const { r } = repo()
    const m = await r.create({ type: 'map', name: 'Secret plan' })
    expect((await r.search({ text: 'secret' })).length).toBe(1)
    await r.trash(m.id)
    expect(await r.search({ text: 'secret' })).toEqual([])
  })
})

describe('duplicate and star', () => {
  it('copies a map with its content and a fresh id', async () => {
    const { r } = repo()
    const m = await r.create({ type: 'map', name: 'Plan', content: new Uint8Array([9, 9]) })
    await r.update(m.id, { starred: true })
    const copy = await r.duplicate(m.id)
    expect(copy.id).not.toBe(m.id)
    expect(copy.name).toBe('Copy of Plan')
    expect(copy.starred).toBe(false)
    expect([...((await r.loadContent(copy.id)) as Uint8Array)]).toEqual([9, 9])
    expect((await r.duplicate(m.id)).name).toBe('Copy of Plan 2')
  })

  it('copies a folder with everything inside it', async () => {
    const { r } = repo()
    const f = await r.create({ type: 'folder', name: 'F' })
    const sub = await r.create({ type: 'folder', parentId: f.id, name: 'S' })
    await r.create({ type: 'map', parentId: sub.id, name: 'deep', content: new Uint8Array([1]) })
    const copy = await r.duplicate(f.id)
    const inside = descendantsOf(await r.list({ parentId: 'any' }), copy.id)
    expect(inside.map((x) => x.name).sort()).toEqual(['S', 'deep'])
    expect(inside.find((x) => x.name === 'deep')?.parentId).not.toBeNull()
    expect((await r.list({ parentId: 'any' })).length).toBe(6)
  })

  it('stars and renames', async () => {
    const { r } = repo()
    const m = await r.create({ type: 'map' })
    expect((await r.update(m.id, { starred: true })).starred).toBe(true)
    const before = (await r.get(m.id))!.modifiedAt
    expect((await r.update(m.id, { name: 'New name' })).modifiedAt).toBeGreaterThan(before)
    await expect(r.update('ghost', { name: 'x' })).rejects.toThrow(FileError)
  })
})

describe('saving content keeps the file record up to date', () => {
  it('updates the modified time, thumbnail, counts and index on every save', async () => {
    const { r } = repo()
    const m = await r.create({ type: 'map' })
    const before = m.modifiedAt
    const saved = await r.saveContent(m.id, new Uint8Array([1, 2, 3]), {
      thumbnail: 'data:image/svg+xml,thumb',
      imageIds: ['i1'],
      attachmentIds: ['a1'],
      topicCount: 7,
      index: { fileId: 'ignored', topics: [{ id: 't', text: 'hello', note: '', tags: [], links: [] }], resources: [] },
    })
    expect(saved.modifiedAt).toBeGreaterThan(before)
    expect(saved).toMatchObject({ thumbnail: 'data:image/svg+xml,thumb', imageIds: ['i1'], attachmentIds: ['a1'], topicCount: 7 })
    expect([...((await r.loadContent(m.id)) as Uint8Array)]).toEqual([1, 2, 3])
    expect((await r.getIndex(m.id))?.fileId).toBe(m.id)
    const again = await r.saveContent(m.id, new Uint8Array([4]), { thumbnail: 'data:image/svg+xml,thumb2' })
    expect(again.modifiedAt).toBeGreaterThan(saved.modifiedAt)
    expect(again.thumbnail).toBe('data:image/svg+xml,thumb2')
    expect(again.imageIds).toEqual(['i1']) // untouched when not provided
    await expect(r.saveContent('ghost', new Uint8Array())).rejects.toThrow(FileError)
  })

  it('tells which pictures any file still uses (including the bin)', async () => {
    const { r } = repo()
    const a = await r.create({ type: 'map' })
    const b = await r.create({ type: 'map' })
    await r.saveContent(a.id, new Uint8Array(), { imageIds: ['x', 'y'], attachmentIds: ['f1'] })
    await r.saveContent(b.id, new Uint8Array(), { imageIds: ['y', 'z'] })
    await r.trash(b.id)
    expect([...(await r.referencedImageIds())].sort()).toEqual(['x', 'y', 'z'])
    expect([...(await r.referencedAttachmentIds())]).toEqual(['f1'])
    await r.remove(b.id)
    expect([...(await r.referencedImageIds())].sort()).toEqual(['x', 'y'])
  })

  it('notifies listeners after a change and stops after unsubscribe', async () => {
    const { r } = repo()
    let n = 0
    const off = r.subscribe(() => n++)
    await r.create({ type: 'map' })
    expect(n).toBe(1)
    off()
    await r.create({ type: 'map' })
    expect(n).toBe(1)
  })
})

describe('search', () => {
  async function seeded() {
    const { r } = repo()
    const doc = createMapDoc()
    const root = ensureRoot(doc, 'Ind AS 109')
    const a = addChild(doc, root, 'Amortised cost')
    const b = addChild(doc, root, 'Impairment')
    setNote(doc, b, '<p>Expected credit loss model</p>')
    addTag(doc, [a], 'measurement')
    const kb = await r.create({ type: 'kb', name: 'Accounting notes' })
    await r.saveContent(kb.id, new Uint8Array(), { index: buildFileIndex(kb.id, snapshotTopics(doc)) })
    const map = await r.create({ type: 'map', name: 'Holiday plan' })
    const d2 = createMapDoc()
    const r2 = ensureRoot(d2, 'Trip')
    addTag(d2, [addChild(d2, r2, 'Flights')], 'measurement')
    await r.saveContent(map.id, new Uint8Array(), { index: buildFileIndex(map.id, snapshotTopics(d2)) })
    return { r, kb, map, ids: { a, b } }
  }

  it('finds topic text, notes, tags and file names', async () => {
    const { r, kb, ids } = await seeded()
    const topic = await r.search({ text: 'amortised' })
    expect(topic).toHaveLength(1)
    expect(topic[0]).toMatchObject({ matched: 'topic', topicId: ids.a })
    expect(topic[0]?.file.id).toBe(kb.id)
    const note = await r.search({ text: 'credit loss' })
    expect(note[0]).toMatchObject({ matched: 'note', topicId: ids.b })
    expect(note[0]?.snippet).toContain('Expected credit loss')
    expect((await r.search({ text: 'holiday' }))[0]?.matched).toBe('name')
    expect((await r.search({ text: 'MEASUREMENT' }))[0]?.matched).toBe('tag')
  })

  it('requires every word and ignores empty queries', async () => {
    const { r } = await seeded()
    expect(await r.search({ text: 'amortised nonsense' })).toEqual([])
    expect(await r.search({ text: '   ' })).toEqual([])
  })

  it('filters by file type and by tag', async () => {
    const { r, kb, map } = await seeded()
    expect((await r.search({ text: '', tag: 'measurement' })).map((h) => h.file.id).sort()).toEqual([kb.id, map.id].sort())
    expect((await r.search({ text: '', tag: 'measurement', types: ['kb'] })).map((h) => h.file.id)).toEqual([kb.id])
    expect((await r.search({ text: 'flights', tag: 'measurement' })).map((h) => h.file.id)).toEqual([map.id])
    expect(await r.search({ text: '', tag: 'nope' })).toEqual([])
  })

  it('limits the number of results', async () => {
    const { r } = repo()
    for (let i = 0; i < 12; i++) await r.create({ type: 'map', name: `plan ${i}` })
    expect((await r.search({ text: 'plan', limit: 5 })).length).toBe(5)
  })
})

describe('folder tree helpers', () => {
  const rec = (id: string, parentId: string | null, type: FileRecord['type'] = 'folder', name = id): FileRecord => ({
    id, name, type, parentId, createdAt: 0, modifiedAt: 0, starred: false, trashed: false, storage: 'local', contentRef: null,
  })
  const files = [rec('a', null), rec('b', 'a'), rec('c', 'b'), rec('m', 'c', 'map'), rec('z', null, 'map')]

  it('finds children, descendants and ancestry', () => {
    expect(childrenOfFolder(files, null).map((f) => f.id)).toEqual(['a', 'z'])
    expect(descendantsOf(files, 'a').map((f) => f.id).sort()).toEqual(['b', 'c', 'm'])
    expect(isInside(files, 'm', 'a')).toBe(true)
    expect(isInside(files, 'a', 'a')).toBe(true)
    expect(isInside(files, 'a', 'm')).toBe(false)
  })

  it('builds breadcrumbs from the top down', () => {
    expect(breadcrumbs(files, 'c').map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(breadcrumbs(files, null)).toEqual([])
    expect(breadcrumbs(files, 'ghost')).toEqual([])
  })

  it('survives a corrupt loop', () => {
    const loop = [rec('x', 'y'), rec('y', 'x')]
    expect(isInside(loop, 'x', 'ghost')).toBe(false)
    expect(breadcrumbs(loop, 'x').length).toBeLessThan(20000)
  })

  it('lists folders for "Move to", leaving some out', () => {
    expect(folderOptions(files).map((o) => `${o.depth}:${o.folder.id}`)).toEqual(['0:a', '1:b', '2:c'])
    expect(folderOptions(files, ['b']).map((o) => o.folder.id)).toEqual(['a'])
  })

  it('makes unique names and sorts', () => {
    expect(uniqueName([rec('1', null, 'map', 'Plan'), rec('2', null, 'map', 'plan 2')], 'Plan')).toBe('Plan 3')
    expect(uniqueName([], 'Plan')).toBe('Plan')
    expect(sortFiles(files, { key: 'name', dir: 'asc' }).map((f) => f.id)).toEqual(['a', 'b', 'c', 'm', 'z'])
  })
})

describe('links between files and the search index', () => {
  it('writes and reads file links, and accepts them as typed links', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    const t = '223e4567-e89b-12d3-a456-426614174000'
    expect(linkedFile(fileLink(id))).toEqual({ fileId: id })
    expect(linkedFile(fileLink(id, t))).toEqual({ fileId: id, topicId: t })
    expect(linkedFile('https://x.com')).toBeNull()
    expect(linkedFile('#map:<script>')).toBeNull()
    expect(normalizeLink(fileLink(id, t))).toBe(fileLink(id, t))
  })

  it('indexes text, notes, tags, links and resources, and finds backlinks', () => {
    const target = '123e4567-e89b-12d3-a456-426614174000'
    const doc = createMapDoc()
    const root = ensureRoot(doc, 'Root')
    const a = addChild(doc, root, 'Linking topic')
    setLink(doc, a, fileLink(target))
    setNote(doc, a, '<p>hello <strong>world</strong></p>')
    addTag(doc, [a], 'x')
    setImage(doc, a, { imageId: 'img-1', width: 100, height: 50 })
    addAttachment(doc, a, { id: 'att-1', name: 'a.pdf', size: 5, type: 'application/pdf' })
    const idx = buildFileIndex('me', snapshotTopics(doc))
    const t = idx.topics.find((x) => x.id === a)
    expect(t).toMatchObject({ text: 'Linking topic', note: 'hello world', tags: ['x'], links: [{ file: target }] })
    expect(idx.resources.map((r) => r.kind).sort()).toEqual(['file', 'image'])
    expect(referencedIds(snapshotTopics(doc))).toEqual({ imageIds: ['img-1'], attachmentIds: ['att-1'] })
    expect(findBacklinks([idx], target)).toEqual([{ fileId: 'me', topicId: a, topicText: 'Linking topic' }])
    expect(findBacklinks([idx], 'me')).toEqual([]) // a file does not link to itself
    expect(findBacklinks([idx], target, 'some-other-topic')).toHaveLength(1) // file-level link counts for any topic
  })
})

describe('starter content', () => {
  const load = (bytes: Uint8Array) => {
    const doc = createMapDoc()
    Y.applyUpdate(doc.ydoc, bytes, 'load')
    return snapshotTopics(doc)
  }
  const texts = (bytes: Uint8Array) => Object.values(load(bytes)).map((t) => t.text)

  it('blank map has only a central topic', () => {
    expect(texts(buildStarterContent('blank'))).toEqual(['Central Topic'])
  })
  it('a knowledge base starts with Concepts, Resources, Projects and Notes', () => {
    expect(texts(buildStarterContent('kb')).sort()).toEqual(['Concepts', 'Knowledge base', 'Notes', 'Projects', 'Resources'])
  })
  it('the example knowledge base is richer, with notes and tags', () => {
    const topics = Object.values(load(buildStarterContent('sample-kb')))
    expect(topics.length).toBeGreaterThan(10)
    expect(topics.some((t) => t.note.includes('knowledge base'))).toBe(true)
    expect(topics.some((t) => t.tags.includes('concept'))).toBe(true)
  })
  it('round-trips through the saved format', () => {
    const doc = createMapDoc()
    loadInto(doc, encodeDoc(createMapDoc()))
    expect(doc.topics.size).toBe(0)
  })
})

describe('IndexedDB backend', () => {
  let n = 0
  const make = () => new RepositoryCore(new IndexedDbBackend(`files-test-${n++}`))

  it('stores files, content and index, and survives a "reload"', async () => {
    const name = `files-reload-${Date.now()}`
    const first = new RepositoryCore(new IndexedDbBackend(name))
    const f = await first.create({ type: 'folder', name: 'Folder' })
    const m = await first.create({ type: 'map', parentId: f.id, content: new Uint8Array([5, 6, 7]) })
    await first.saveContent(m.id, new Uint8Array([8, 9]), { index: { fileId: m.id, topics: [], resources: [] }, thumbnail: 't' })
    const second = new RepositoryCore(new IndexedDbBackend(name))
    expect((await second.list({ parentId: 'any' })).map((x) => x.id).sort()).toEqual([f.id, m.id].sort())
    expect([...((await second.loadContent(m.id)) as Uint8Array)]).toEqual([8, 9])
    expect((await second.getIndex(m.id))?.fileId).toBe(m.id)
    expect((await second.get(m.id))?.thumbnail).toBe('t')
  })

  it('behaves like the memory backend for nesting, trash and delete', async () => {
    const r = make()
    const f = await r.create({ type: 'folder' })
    const m = await r.create({ type: 'map', parentId: f.id, content: new Uint8Array([1]) })
    await r.trash(f.id)
    expect(await r.list()).toEqual([])
    await r.restore(f.id)
    expect((await r.get(m.id))?.trashed).toBe(false)
    await r.remove(f.id)
    expect(await r.loadContent(m.id)).toBeNull()
    expect(await r.list({ parentId: 'any' })).toEqual([])
  })
})
