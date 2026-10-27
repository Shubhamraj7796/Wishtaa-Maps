import { RepositoryCore, MemoryBackend, type Backend } from './core'
import type { FileIndex, FileRecord, FileRepository } from './types'

const DB_NAME = 'wishtaa-maps-files'

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/** Files, their content and their search index in IndexedDB. */
export class IndexedDbBackend implements Backend {
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(private dbName = DB_NAME) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(this.dbName, 1)
      open.onupgradeneeded = () => {
        const db = open.result
        db.createObjectStore('files', { keyPath: 'id' })
        db.createObjectStore('content', { keyPath: 'id' })
        db.createObjectStore('index', { keyPath: 'fileId' })
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => {
        this.dbPromise = null
        reject(open.error ?? new Error('Could not open IndexedDB'))
      }
    })
    return this.dbPromise
  }

  private async store(name: 'files' | 'content' | 'index', mode: IDBTransactionMode) {
    return (await this.db()).transaction(name, mode).objectStore(name)
  }

  private async write(name: 'files' | 'content' | 'index', fn: (s: IDBObjectStore) => void): Promise<void> {
    const tx = (await this.db()).transaction(name, 'readwrite')
    fn(tx.objectStore(name))
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save (storage full?)'))
      tx.onabort = () => reject(tx.error ?? new Error('Save was aborted (storage full?)'))
    })
  }

  async all() {
    return (await wrap((await this.store('files', 'readonly')).getAll())) as FileRecord[]
  }
  put(r: FileRecord) {
    return this.write('files', (s) => void s.put(r))
  }
  delete(id: string) {
    return this.write('files', (s) => void s.delete(id))
  }
  async getContent(id: string) {
    const row = (await wrap((await this.store('content', 'readonly')).get(id))) as { id: string; data: ArrayBuffer } | undefined
    return row ? new Uint8Array(row.data) : null
  }
  putContent(id: string, data: Uint8Array) {
    // Copy into a standalone buffer so a view into a larger buffer is not stored whole.
    const copy = data.slice().buffer
    return this.write('content', (s) => void s.put({ id, data: copy }))
  }
  deleteContent(id: string) {
    return this.write('content', (s) => void s.delete(id))
  }
  async getIndex(id: string) {
    return ((await wrap((await this.store('index', 'readonly')).get(id))) as FileIndex | undefined) ?? null
  }
  putIndex(i: FileIndex) {
    return this.write('index', (s) => void s.put(i))
  }
  deleteIndex(id: string) {
    return this.write('index', (s) => void s.delete(id))
  }
  async allIndexes() {
    return (await wrap((await this.store('index', 'readonly')).getAll())) as FileIndex[]
  }
}

/** The repository for files kept in this browser. Falls back to memory if IndexedDB is unavailable. */
export function createLocalRepository(): FileRepository {
  let backend: Backend
  try {
    backend = typeof indexedDB !== 'undefined' ? new IndexedDbBackend() : new MemoryBackend()
  } catch {
    backend = new MemoryBackend()
  }
  return new RepositoryCore(backend)
}
