import { newId } from '../model/ids'
import { descendantsOf, isInside, sortFiles, uniqueName } from './tree'
import {
  DEFAULT_SORT,
  type CreateInput,
  type FileIndex,
  type FilePatch,
  type FileRecord,
  type FileRepository,
  type ListQuery,
  type SaveMeta,
  type SearchHit,
  type SearchQuery,
} from './types'

/** Where records physically live. Implemented for IndexedDB and for memory (tests). */
export interface Backend {
  all(): Promise<FileRecord[]>
  put(record: FileRecord): Promise<void>
  delete(id: string): Promise<void>
  getContent(id: string): Promise<Uint8Array | null>
  putContent(id: string, data: Uint8Array): Promise<void>
  deleteContent(id: string): Promise<void>
  getIndex(id: string): Promise<FileIndex | null>
  putIndex(index: FileIndex): Promise<void>
  deleteIndex(id: string): Promise<void>
  allIndexes(): Promise<FileIndex[]>
}

export const MAX_NAME_LENGTH = 120

export class FileError extends Error {}

const cleanName = (name: string | undefined, fallback: string) => {
  const spaced = Array.from(name ?? '', (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('')
  const n = spaced.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH)
  return n || fallback
}

const DEFAULT_NAMES = { folder: 'New folder', map: 'Untitled map', kb: 'Untitled knowledge base' } as const

/** All the rules about files and folders, independent of where they are stored. */
export class RepositoryCore implements FileRepository {
  private listeners = new Set<() => void>()

  constructor(
    private backend: Backend,
    private now: () => number = Date.now
  ) {}

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  private async require(id: string): Promise<FileRecord> {
    const f = (await this.backend.all()).find((x) => x.id === id)
    if (!f) throw new FileError('That file no longer exists.')
    return f
  }

  private async requireFolder(id: string | null | undefined, all?: FileRecord[]): Promise<void> {
    if (!id) return
    const list = all ?? (await this.backend.all())
    const f = list.find((x) => x.id === id)
    if (!f || f.type !== 'folder') throw new FileError('That folder no longer exists.')
    if (f.trashed) throw new FileError('That folder is in the bin.')
  }

  async list(query: ListQuery = {}): Promise<FileRecord[]> {
    const all = await this.backend.all()
    const trashed = query.trashed ?? false
    const out = all.filter(
      (f) =>
        f.trashed === trashed &&
        (query.parentId === undefined || query.parentId === 'any' || f.parentId === query.parentId) &&
        (!query.types || query.types.includes(f.type)) &&
        (query.starred === undefined || f.starred === query.starred)
    )
    return sortFiles(out, query.sort ?? DEFAULT_SORT)
  }

  async get(id: string): Promise<FileRecord | null> {
    return (await this.backend.all()).find((f) => f.id === id) ?? null
  }

  async create(input: CreateInput): Promise<FileRecord> {
    const all = await this.backend.all()
    const parentId = input.parentId ?? null
    await this.requireFolder(parentId, all)
    const siblings = all.filter((f) => f.parentId === parentId && !f.trashed)
    const t = this.now()
    const id = newId()
    const rec: FileRecord = {
      id,
      name: input.name?.trim() ? cleanName(input.name, DEFAULT_NAMES[input.type]) : uniqueName(siblings, DEFAULT_NAMES[input.type]),
      type: input.type,
      parentId,
      createdAt: t,
      modifiedAt: t,
      starred: false,
      trashed: false,
      storage: input.storage ?? 'local',
      thumbnail: null,
      contentRef: input.type === 'folder' ? null : id,
      ...(input.type === 'folder' ? {} : { imageIds: [], attachmentIds: [], topicCount: 1 }),
    }
    if (input.type !== 'folder' && input.content) await this.backend.putContent(id, input.content)
    await this.backend.put(rec)
    this.emit()
    return rec
  }

  async update(id: string, patch: FilePatch): Promise<FileRecord> {
    const f = await this.require(id)
    const next: FileRecord = { ...f, ...patch }
    if (patch.name !== undefined) next.name = cleanName(patch.name, f.name)
    // Name changes and stars count as editing; thumbnails and indexes are bookkeeping and do not.
    if (patch.name !== undefined && next.name !== f.name) next.modifiedAt = this.now()
    await this.backend.put(next)
    this.emit()
    return next
  }

  async move(id: string, parentId: string | null): Promise<FileRecord> {
    const all = await this.backend.all()
    const f = all.find((x) => x.id === id)
    if (!f) throw new FileError('That file no longer exists.')
    if (f.trashed) throw new FileError('Restore it from the bin before moving it.')
    await this.requireFolder(parentId, all)
    if (parentId && isInside(all, parentId, id)) throw new FileError("A folder can't be moved into itself.")
    if (f.parentId === parentId) return f
    const next = { ...f, parentId, modifiedAt: this.now() }
    await this.backend.put(next)
    this.emit()
    return next
  }

  async duplicate(id: string): Promise<FileRecord> {
    const all = await this.backend.all()
    const src = all.find((x) => x.id === id)
    if (!src) throw new FileError('That file no longer exists.')
    const copyOf = async (f: FileRecord, parentId: string | null, name: string): Promise<FileRecord> => {
      const t = this.now()
      const nid = newId()
      const rec: FileRecord = { ...f, id: nid, name, parentId, createdAt: t, modifiedAt: t, starred: false, trashed: false, trashedAt: undefined, trashedRoot: null, contentRef: f.type === 'folder' ? null : nid }
      if (f.type !== 'folder') {
        const content = await this.backend.getContent(f.id)
        if (content) await this.backend.putContent(nid, content)
        const idx = await this.backend.getIndex(f.id)
        if (idx) await this.backend.putIndex({ ...idx, fileId: nid })
      }
      await this.backend.put(rec)
      return rec
    }
    const siblings = all.filter((f) => f.parentId === src.parentId && !f.trashed)
    const top = await copyOf(src, src.parentId, uniqueName(siblings, `Copy of ${src.name}`.slice(0, MAX_NAME_LENGTH)))
    if (src.type === 'folder') {
      const copyTree = async (fromId: string, toId: string) => {
        for (const child of all.filter((f) => f.parentId === fromId && !f.trashed)) {
          const c = await copyOf(child, toId, child.name)
          if (child.type === 'folder') await copyTree(child.id, c.id)
        }
      }
      await copyTree(src.id, top.id)
    }
    this.emit()
    return top
  }

  async trash(id: string): Promise<void> {
    const all = await this.backend.all()
    const f = all.find((x) => x.id === id)
    if (!f || f.trashed) return
    const t = this.now()
    const group = [f, ...descendantsOf(all, id).filter((d) => !d.trashed)]
    for (const g of group) await this.backend.put({ ...g, trashed: true, trashedAt: t, trashedRoot: id })
    this.emit()
  }

  async restore(id: string): Promise<void> {
    const all = await this.backend.all()
    const f = all.find((x) => x.id === id)
    if (!f || !f.trashed) return
    const root = f.trashedRoot ?? id
    const group = all.filter((g) => g.trashed && (g.trashedRoot ?? g.id) === root)
    const parent = f.parentId ? all.find((x) => x.id === f.parentId) : undefined
    // If the folder it was in is itself in the bin (or gone), it comes back at the top level.
    const parentOk = !f.parentId || (parent && (!parent.trashed || (parent.trashedRoot ?? parent.id) === root))
    for (const g of group) {
      const next: FileRecord = { ...g, trashed: false, trashedAt: undefined, trashedRoot: null }
      if (g.id === root && !parentOk) next.parentId = null
      await this.backend.put(next)
    }
    this.emit()
  }

  async remove(id: string): Promise<void> {
    const all = await this.backend.all()
    const f = all.find((x) => x.id === id)
    if (!f) return
    for (const g of [f, ...descendantsOf(all, id)]) {
      await this.backend.delete(g.id)
      await this.backend.deleteContent(g.id)
      await this.backend.deleteIndex(g.id)
    }
    this.emit()
  }

  async emptyTrash(): Promise<void> {
    const all = await this.backend.all()
    for (const f of all.filter((x) => x.trashed)) {
      await this.backend.delete(f.id)
      await this.backend.deleteContent(f.id)
      await this.backend.deleteIndex(f.id)
    }
    this.emit()
  }

  async loadContent(id: string) {
    return this.backend.getContent(id)
  }

  async saveContent(id: string, data: Uint8Array, meta: SaveMeta = {}): Promise<FileRecord> {
    const f = await this.require(id)
    await this.backend.putContent(id, data)
    const next: FileRecord = { ...f, modifiedAt: this.now() }
    if ('thumbnail' in meta) next.thumbnail = meta.thumbnail ?? null
    if (meta.imageIds) next.imageIds = meta.imageIds
    if (meta.attachmentIds) next.attachmentIds = meta.attachmentIds
    if (meta.topicCount !== undefined) next.topicCount = meta.topicCount
    await this.backend.put(next)
    if (meta.index) await this.backend.putIndex({ ...meta.index, fileId: id })
    this.emit()
    return next
  }

  getIndex(id: string) {
    return this.backend.getIndex(id)
  }

  allIndexes() {
    return this.backend.allIndexes()
  }

  async referencedImageIds(): Promise<Set<string>> {
    const ids = new Set<string>()
    for (const f of await this.backend.all()) f.imageIds?.forEach((i) => ids.add(i))
    return ids
  }

  async referencedAttachmentIds(): Promise<Set<string>> {
    const ids = new Set<string>()
    for (const f of await this.backend.all()) f.attachmentIds?.forEach((i) => ids.add(i))
    return ids
  }

  async search(query: SearchQuery): Promise<SearchHit[]> {
    const words = query.text.toLowerCase().split(/\s+/).filter(Boolean)
    const tag = query.tag?.toLowerCase()
    if (!words.length && !tag) return []
    const files = (await this.backend.all()).filter((f) => !f.trashed && f.type !== 'folder' && (!query.types || query.types.includes(f.type)))
    const indexes = new Map((await this.backend.allIndexes()).map((i) => [i.fileId, i]))
    const hits: SearchHit[] = []
    const limit = query.limit ?? 100
    const has = (text: string) => words.every((w) => text.toLowerCase().includes(w))
    const sorted = [...files].sort((a, b) => b.modifiedAt - a.modifiedAt)
    for (const file of sorted) {
      const idx = indexes.get(file.id)
      const topics = idx?.topics ?? []
      if (tag && !topics.some((t) => t.tags.some((x) => x.toLowerCase() === tag))) continue
      const nameHit = words.length > 0 && has(file.name)
      let found = false
      for (const t of topics) {
        if (tag && !t.tags.some((x) => x.toLowerCase() === tag)) continue
        const m: SearchHit['matched'] | null = !words.length ? 'tag' : has(t.text) ? 'topic' : has(t.note) ? 'note' : t.tags.some((x) => has(x)) ? 'tag' : null
        if (!m) continue
        found = true
        hits.push({ file, topicId: t.id, topicText: t.text, matched: m, snippet: m === 'note' ? t.note.slice(0, 140) : undefined })
        if (hits.length >= limit) return hits
      }
      if (nameHit && !found) hits.push({ file, matched: 'name' })
      else if (nameHit) hits.unshift({ file, matched: 'name' })
      if (hits.length >= limit) return hits.slice(0, limit)
    }
    return hits
  }
}

export class MemoryBackend implements Backend {
  files = new Map<string, FileRecord>()
  content = new Map<string, Uint8Array>()
  indexes = new Map<string, FileIndex>()
  async all() {
    return [...this.files.values()].map((f) => ({ ...f }))
  }
  async put(r: FileRecord) {
    this.files.set(r.id, { ...r })
  }
  async delete(id: string) {
    this.files.delete(id)
  }
  async getContent(id: string) {
    return this.content.get(id) ?? null
  }
  async putContent(id: string, data: Uint8Array) {
    this.content.set(id, data)
  }
  async deleteContent(id: string) {
    this.content.delete(id)
  }
  async getIndex(id: string) {
    return this.indexes.get(id) ?? null
  }
  async putIndex(i: FileIndex) {
    this.indexes.set(i.fileId, i)
  }
  async deleteIndex(id: string) {
    this.indexes.delete(id)
  }
  async allIndexes() {
    return [...this.indexes.values()]
  }
}
