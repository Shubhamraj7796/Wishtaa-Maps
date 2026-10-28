import type { DriveApi, DriveFileMeta } from './client'
import { DriveError } from './errors'

interface Stored {
  meta: DriveFileMeta
  body: string
}

/** An in-memory Google Drive for tests: versions go up on every write, like the real thing. */
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
    const meta: DriveFileMeta = { id, name, mimeType, modifiedTime: this.tick(), version: '1', parents }
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

  async update(id: string, { name, body }: { name?: string; body: string }) {
    this.gate(`update ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    f.body = body
    if (name) f.meta.name = name
    f.meta.version = String(Number(f.meta.version) + 1)
    f.meta.modifiedTime = this.tick()
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
    f.body = body
    f.meta.version = String(Number(f.meta.version) + 1)
    f.meta.modifiedTime = this.tick()
  }

  /** Adds a file as if created outside the app (for open-from-Drive). */
  seed(name: string, body: string, parentId?: string): DriveFileMeta {
    return this.store(name, 'application/json', parentId ? [parentId] : [], body)
  }
}
