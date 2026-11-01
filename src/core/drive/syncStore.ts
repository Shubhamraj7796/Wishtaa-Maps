/**
 * What is kept on this device to merge a map with another device's changes:
 *  - the BASE: the content of the map the last time it matched Google Drive (after an upload or a download), the common starting
 *    point of a three-way merge;
 *  - RECOVERABLE versions: a copy of the version that lost a clash during a merge, so nothing a person wrote is ever thrown away.
 * Only the map file itself (small JSON-like data, never pictures) is kept.
 */
export interface Recoverable {
  key: string
  at: number
  /** Whose copy this is: "This device" or the other device. */
  from: 'local' | 'remote'
  /** What was kept instead, in a sentence. */
  note: string
  /** What differed (short descriptions), up to a handful. */
  fields: string[]
  content: Uint8Array
}

export interface SyncStore {
  getBase(fileId: string): Promise<Uint8Array | null>
  putBase(fileId: string, content: Uint8Array): Promise<void>
  deleteFile(fileId: string): Promise<void>
  addRecoverable(fileId: string, v: Recoverable): Promise<void>
  listRecoverable(fileId: string): Promise<Recoverable[]>
  deleteRecoverable(fileId: string, key: string): Promise<void>
}

export const MAX_RECOVERABLE = 10

export class MemorySyncStore implements SyncStore {
  private bases = new Map<string, Uint8Array>()
  private versions = new Map<string, Recoverable[]>()
  async getBase(id: string) {
    return this.bases.get(id) ?? null
  }
  async putBase(id: string, content: Uint8Array) {
    this.bases.set(id, content.slice())
  }
  async deleteFile(id: string) {
    this.bases.delete(id)
    this.versions.delete(id)
  }
  async addRecoverable(id: string, v: Recoverable) {
    const list = [...(this.versions.get(id) ?? []), v].sort((a, b) => b.at - a.at).slice(0, MAX_RECOVERABLE)
    this.versions.set(id, list)
  }
  async listRecoverable(id: string) {
    return [...(this.versions.get(id) ?? [])]
  }
  async deleteRecoverable(id: string, key: string) {
    this.versions.set(id, (this.versions.get(id) ?? []).filter((v) => v.key !== key))
  }
}

const wrap = <T>(req: IDBRequest<T>) => new Promise<T>((resolve, reject) => ((req.onsuccess = () => resolve(req.result)), (req.onerror = () => reject(req.error))))

/** The same, in this browser's IndexedDB (its own small database, apart from the files). */
export class IndexedDbSyncStore implements SyncStore {
  private dbp: Promise<IDBDatabase> | null = null
  constructor(private name = 'wishtaa-maps-sync') {}
  private db() {
    this.dbp ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(this.name, 1)
      open.onupgradeneeded = () => {
        open.result.createObjectStore('base', { keyPath: 'id' })
        open.result.createObjectStore('versions', { keyPath: 'id' })
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => {
        this.dbp = null
        reject(open.error)
      }
    })
    return this.dbp
  }
  private async tx(store: 'base' | 'versions', mode: IDBTransactionMode) {
    return (await this.db()).transaction(store, mode).objectStore(store)
  }
  private done(store: 'base' | 'versions', fn: (s: IDBObjectStore) => void) {
    return this.db().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const t = db.transaction(store, 'readwrite')
          fn(t.objectStore(store))
          t.oncomplete = () => resolve()
          t.onerror = t.onabort = () => reject(t.error)
        })
    )
  }
  async getBase(id: string) {
    const row = (await wrap((await this.tx('base', 'readonly')).get(id))) as { data: ArrayBuffer } | undefined
    return row ? new Uint8Array(row.data) : null
  }
  putBase(id: string, content: Uint8Array) {
    const data = content.slice().buffer
    return this.done('base', (s) => void s.put({ id, data }))
  }
  async deleteFile(id: string) {
    await this.done('base', (s) => void s.delete(id))
    await this.done('versions', (s) => void s.delete(id))
  }
  async listRecoverable(id: string) {
    const row = (await wrap((await this.tx('versions', 'readonly')).get(id))) as { list: Recoverable[] } | undefined
    return row?.list ?? []
  }
  async addRecoverable(id: string, v: Recoverable) {
    const list = [...(await this.listRecoverable(id)), v].sort((a, b) => b.at - a.at).slice(0, MAX_RECOVERABLE)
    await this.done('versions', (s) => void s.put({ id, list }))
  }
  async deleteRecoverable(id: string, key: string) {
    const list = (await this.listRecoverable(id)).filter((v) => v.key !== key)
    await this.done('versions', (s) => void s.put({ id, list }))
  }
}
