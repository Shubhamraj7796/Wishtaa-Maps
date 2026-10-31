import type { DriveApi, DriveFileMeta } from './client'
import { DriveError } from './errors'
import { WISHTAA_LEGACY_MIME, WISHTAA_MIME } from './format'

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
  /** The next write reaches Drive but its reply is lost (the connection drops after the upload). */
  loseNextReply = false
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

  private store(name: string, mimeType: string, parents: string[], body: string, appProperties?: Record<string, string>): DriveFileMeta {
    const id = `drive-${++this.n}`
    const meta: DriveFileMeta = { id, name, mimeType, modifiedTime: this.tick(), version: '1', parents, md5Checksum: checksum(body), headRevisionId: `rev-${id}-1`, ...(appProperties ? { appProperties: { ...appProperties } } : {}) }
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

  async create({ name, parentId, body, appProperties }: { name: string; parentId: string; body: string; appProperties?: Record<string, string> }) {
    this.gate('create')
    return this.store(name, WISHTAA_MIME, [parentId], body, appProperties)
  }

  async createFolder(name: string, parentId: string) {
    this.gate('createFolder')
    return this.store(name, 'application/vnd.google-apps.folder', [parentId], '')
  }

  async update(id: string, { name, body, appProperties }: { name?: string; body: string; appProperties?: Record<string, string> }) {
    this.gate(`update ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    if (name) f.meta.name = name
    if (appProperties) f.meta.appProperties = { ...f.meta.appProperties, ...appProperties }
    this.changeContent(f, body)
    if (this.loseNextReply) {
      this.loseNextReply = false
      throw new DriveError('offline', 'The connection dropped before Drive answered.')
    }
    return { ...f.meta }
  }

  async setAppProperties(id: string, props: Record<string, string | null>) {
    this.gate(`setAppProperties ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    const next = { ...f.meta.appProperties }
    for (const [k, v] of Object.entries(props)) {
      if (v === null) delete next[k]
      else next[k] = v
    }
    f.meta.appProperties = next
    // Drive counts a metadata change as a change of the file (version, modified time) but makes no new content revision.
    f.meta.version = String(Number(f.meta.version) + 1)
    f.meta.modifiedTime = this.tick()
    return { ...f.meta }
  }

  /** Bytes the original keeps: set by `seedBytes`. */
  private bytes = new Map<string, Uint8Array>()

  async downloadBytes(id: string, onProgress?: (fraction: number) => void) {
    this.gate(`downloadBytes ${id}`)
    const f = this.files.get(id)
    if (!f) throw new DriveError('notfound', 'not found', 404)
    onProgress?.(0.5)
    onProgress?.(1)
    return this.bytes.get(id) ?? new TextEncoder().encode(f.body)
  }

  async findBySource(sourceFileId: string) {
    this.gate(`findBySource ${sourceFileId}`)
    return [...this.files.values()].filter((f) => f.meta.appProperties?.sourceFileId === sourceFileId && !f.meta.trashed).map((f) => ({ ...f.meta }))
  }

  /** Puts a binary file in Drive as if made elsewhere (an .emmx). */
  seedBytes(name: string, bytes: Uint8Array, mimeType = 'application/octet-stream', parentId?: string): DriveFileMeta {
    const meta = this.store(name, mimeType, parentId ? [parentId] : [], '')
    this.bytes.set(meta.id, bytes)
    const f = this.files.get(meta.id)
    if (f) f.meta.size = String(bytes.byteLength)
    return { ...f?.meta } as DriveFileMeta
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
  editElsewhere(id: string, body: string, appProperties?: Record<string, string>) {
    const f = this.files.get(id)
    if (!f) throw new Error('no such file')
    this.changeContent(f, body)
    // A writer that sets its own marker, or (no marker given) one that sets none, like editing in Drive itself.
    if (appProperties) f.meta.appProperties = { ...appProperties }
    else delete f.meta.appProperties
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
  seed(name: string, body: string, parentId?: string, mimeType: string = WISHTAA_LEGACY_MIME): DriveFileMeta {
    return this.store(name, mimeType, parentId ? [parentId] : [], body)
  }
}
