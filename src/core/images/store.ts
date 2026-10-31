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
  /** A small picture (about 256 px) drawn instead of the full one when zoomed out or moving. */
  putThumb(id: string, blob: Blob, color?: string): Promise<void>
  getThumb(id: string): Promise<Blob | undefined>
  /** The average colour of the picture (kept with its small version), for drawing a flat placeholder when it is tiny on screen. */
  getThumbColor(id: string): Promise<string | undefined>
  setThumbColor(id: string, color: string): Promise<void>
}

const meta = ({ id, width, height, type, size }: ImageMeta): ImageMeta => ({ id, width, height, type, size })

export class MemoryImageStore implements ImageStore {
  private items = new Map<string, StoredImage>()
  private thumbs = new Map<string, Blob>()
  private colors = new Map<string, string>()
  async put(image: StoredImage) {
    this.items.set(image.id, image)
  }
  async putThumb(id: string, blob: Blob, color?: string) {
    this.thumbs.set(id, blob)
    if (color) this.colors.set(id, color)
  }
  async getThumbColor(id: string) {
    return this.colors.get(id)
  }
  async setThumbColor(id: string, color: string) {
    this.colors.set(id, color)
  }
  async getThumb(id: string) {
    return this.thumbs.get(id)
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
    this.thumbs.delete(id)
    this.colors.delete(id)
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
/** Sizes only, so asking a picture's size never reads its bytes. */
const META = 'meta'
const THUMBS = 'thumbs'
const DB_VERSION = 2

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
      const open = indexedDB.open(this.dbName, DB_VERSION)
      open.onupgradeneeded = () => {
        const db = open.result
        for (const name of [STORE, META, THUMBS]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' })
      }
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
    const tx = (await this.db()).transaction([STORE, META], 'readwrite')
    tx.objectStore(STORE).put(row)
    tx.objectStore(META).put(meta(image))
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
    const db = await this.db()
    const fast = (await wrap(db.transaction(META, 'readonly').objectStore(META).get(id))) as ImageMeta | undefined
    if (fast) return fast
    // A picture saved before sizes were kept apart: read it once and remember its size.
    const row = (await wrap((await this.store('readonly')).get(id))) as Row | undefined
    if (!row) return undefined
    await wrap(db.transaction(META, 'readwrite').objectStore(META).put(meta(row))).catch(() => undefined)
    return meta(row)
  }

  async putThumb(id: string, blob: Blob, color?: string) {
    const db = await this.db()
    await wrap(db.transaction(THUMBS, 'readwrite').objectStore(THUMBS).put({ id, type: blob.type, data: await blob.arrayBuffer(), ...(color ? { color } : {}) }))
  }

  async getThumb(id: string) {
    const db = await this.db()
    const row = (await wrap(db.transaction(THUMBS, 'readonly').objectStore(THUMBS).get(id))) as { type: string; data: ArrayBuffer } | undefined
    return row && new Blob([row.data], { type: row.type })
  }

  async getThumbColor(id: string) {
    const db = await this.db()
    const row = (await wrap(db.transaction(THUMBS, 'readonly').objectStore(THUMBS).get(id))) as { color?: string } | undefined
    return row?.color
  }

  async setThumbColor(id: string, color: string) {
    const db = await this.db()
    const store = db.transaction(THUMBS, 'readwrite').objectStore(THUMBS)
    const row = (await wrap(store.get(id))) as Record<string, unknown> | undefined
    if (row) await wrap(store.put({ ...row, color }))
  }

  async delete(id: string) {
    const tx = (await this.db()).transaction([STORE, META, THUMBS], 'readwrite')
    for (const name of [STORE, META, THUMBS]) tx.objectStore(name).delete(id)
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('Could not delete the image'))
    })
  }

  async keys() {
    return (await wrap((await this.store('readonly')).getAllKeys())) as string[]
  }
}
