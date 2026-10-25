/**
 * Image blob storage, kept behind an interface so the IndexedDB implementation
 * can later be swapped for Supabase Storage without touching the editor.
 */
export interface ImageMeta {
  id: string
  width: number
  height: number
  type: string
  size: number
}

export interface StoredImage extends ImageMeta {
  blob: Blob
}

export interface ImageStore {
  put(image: StoredImage): Promise<void>
  get(id: string): Promise<StoredImage | undefined>
  getMeta(id: string): Promise<ImageMeta | undefined>
  delete(id: string): Promise<void>
  keys(): Promise<string[]>
}

const meta = ({ id, width, height, type, size }: ImageMeta): ImageMeta => ({ id, width, height, type, size })

export class MemoryImageStore implements ImageStore {
  private items = new Map<string, StoredImage>()
  async put(image: StoredImage) {
    this.items.set(image.id, image)
  }
  async get(id: string) {
    return this.items.get(id)
  }
  async getMeta(id: string) {
    const i = this.items.get(id)
    return i && meta(i)
  }
  async delete(id: string) {
    this.items.delete(id)
  }
  async keys() {
    return [...this.items.keys()]
  }
}

interface Row extends ImageMeta {
  data: ArrayBuffer
}

export const DEFAULT_DB_NAME = 'wishtaa-maps-images'
const STORE = 'images'

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

/**
 * IndexedDB store. Blobs are kept as ArrayBuffers plus their type, which is the most
 * portable form across browsers (older Safari had trouble persisting Blobs).
 */
export class IndexedDbImageStore implements ImageStore {
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(private dbName = DEFAULT_DB_NAME) {}

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(this.dbName, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: 'id' })
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => {
        this.dbPromise = null
        reject(open.error ?? new Error('Could not open IndexedDB'))
      }
    })
    return this.dbPromise
  }

  private async store(mode: IDBTransactionMode) {
    return (await this.db()).transaction(STORE, mode).objectStore(STORE)
  }

  async put(image: StoredImage) {
    const row: Row = { ...meta(image), data: await image.blob.arrayBuffer() }
    const tx = (await this.db()).transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(row)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not save the image'))
      tx.onabort = () => reject(tx.error ?? new Error('Image save was aborted (storage full?)'))
    })
  }

  async get(id: string) {
    const row = (await wrap((await this.store('readonly')).get(id))) as Row | undefined
    return row && { ...meta(row), blob: new Blob([row.data], { type: row.type }) }
  }

  async getMeta(id: string) {
    const row = (await wrap((await this.store('readonly')).get(id))) as Row | undefined
    return row && meta(row)
  }

  async delete(id: string) {
    await wrap((await this.store('readwrite')).delete(id))
  }

  async keys() {
    return (await wrap((await this.store('readonly')).getAllKeys())) as string[]
  }
}
