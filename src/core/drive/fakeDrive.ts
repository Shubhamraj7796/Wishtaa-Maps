import type { DriveApi, DriveFileMeta } from './client'
import { DriveError } from './errors'

interface Stored {
  meta: DriveFileMeta
  body: string
}

/** A small stand-in for Drive's content checksum (any change of text changes it). */
function checksum(text: string): string {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0).toString(16).padStart(8, '0') + text.length.toString(16)
}

/**
 * An in-memory Google Drive for tests: `version` goes up on every write, like the real thing, and ALSO when Drive does
 * housekeeping of its own (`touchMetadata`), while the content checksum, revision and modifiedTime stay the same.
 */
export class FakeDrive implements DriveApi {
  files = new Map<string, Stored>()
  isOnline = true
  isConnected = true
  failNextWith: DriveError | null = null
  calls: string[] = []
  private n = 0
  private clock = Date.UTC(2026, 0, 1)

  private tick(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  private gate(call: string) {
    this.calls.push(call)
    if (!this.isOnline) throw new DriveError('offline', 'No connection to Google Drive.')
    if (this.failNextWith) {
      const e = this.failNextWith
      this.failNextWith = null
      throw e
    }
  }

  available() {
    return this.isConnected
  }

  private store(name: string, mimeType: string, parents: string[], body: string): DriveFileMeta {
    const id = `drive-${++this.n}`
    const meta: DriveFileMeta = { id, name, mimeType, modifiedTime: this.tick(), version: '1', parents, md5Checksum: checksum(body), headRevisionId: `rev-${id}-1` }
    this.files.set(id, { meta, body })
    return { ...meta }
  }

  async ensureAppFolder() {
    this.gate('ensureAppFolder')
    for (const f of this.files.values()) if (f.meta.name === 'Wishtaa Maps' && f.meta.mimeType === 'application/vnd.google-apps.folder') return f.meta.id
    return this.store('Wishtaa Maps', 'application/vnd.google-apps.folder', [], '').id
  }

  async meta(id: string) {
    this.gate(`meta ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    return { ...f.meta }
  }

  async download(id: string) {
    this.gate(`download ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    return f.body
  }

  async create({ name, parentId, body }: { name: string; parentId: string; body: string }) {
    this.gate('create')
    return this.store(name, 'application/json', [parentId], body)
  }

  async createFolder(name: string, parentId: string) {
    this.gate('createFolder')
    return this.store(name, 'application/vnd.google-apps.folder', [parentId], '')
  }

  async update(id: string, { name, body }: { name?: string; body: string }) {
    this.gate(`update ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    if (name) f.meta.name = name
    this.changeContent(f, body)
    return { ...f.meta }
  }

  async list(parentId: string) {
    this.gate('list')
    return [...this.files.values()].filter((f) => f.meta.parents?.includes(parentId) && !f.meta.trashed).map((f) => ({ ...f.meta }))
  }

  async trash(id: string) {
    this.gate(`trash ${id}`)
    const f = this.files.get(id)
    if (f) f.meta.trashed = true
  }

  /** Simulates another device saving the file. */
  editElsewhere(id: string, body: string) {
    const f = this.files.get(id)
    if (!f) throw new Error('no such file')
    this.changeContent(f, body)
  }

  private changeContent(f: Stored, body: string) {
    f.body = body
    f.meta.version = String(Number(f.meta.version) + 1)
    f.meta.modifiedTime = this.tick()
    f.meta.md5Checksum = checksum(body)
    f.meta.headRevisionId = `rev-${f.meta.id}-${++this.n}`
  }

  /** Drive's own housekeeping (thumbnail, indexing, a view): the version goes up, nothing else changes. */
  touchMetadata(id: string) {
    const f = this.files.get(id)
    if (!f) throw new Error('no such file')
    f.meta.version = String(Number(f.meta.version) + 1)
  }

  /** Adds a file as if created outside the app (for open-from-Drive). */
  seed(name: string, body: string, parentId?: string): DriveFileMeta {
    return this.store(name, 'application/json', parentId ? [parentId] : [], body)
  }
}
