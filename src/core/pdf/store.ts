/**
 * The PDFs this device holds, by their content hash. A map refers to a PDF by hash, so the same file is kept once however many maps use
 * it, and "Remove from this device" frees the space without touching any map (it asks for the file again when it is needed).
 */
export interface StoredPdf {
  hash: string
  name: string
  size: number
  lastUsed: number
}

export interface PdfStore {
  put(hash: string, bytes: Uint8Array, name: string): Promise<void>
  get(hash: string): Promise<Uint8Array | undefined>
  has(hash: string): Promise<boolean>
  delete(hash: string): Promise<void>
  list(): Promise<StoredPdf[]>
}

export class MemoryPdfStore implements PdfStore {
  private items = new Map<string, { bytes: Uint8Array; name: string; lastUsed: number }>()
  async put(hash: string, bytes: Uint8Array, name: string) {
    this.items.set(hash, { bytes: bytes.slice(), name, lastUsed: Date.now() })
  }
  async get(hash: string) {
    const it = this.items.get(hash)
    if (it) it.lastUsed = Date.now()
    return it?.bytes.slice()
  }
  async has(hash: string) {
    return this.items.has(hash)
  }
  async delete(hash: string) {
    this.items.delete(hash)
  }
  async list() {
    return [...this.items].map(([hash, v]) => ({ hash, name: v.name, size: v.bytes.byteLength, lastUsed: v.lastUsed }))
  }
}

const DB = 'wishtaa-maps-pdfs'
const STORE = 'pdfs'
const wrap = <T,>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => ((req.onsuccess = () => resolve(req.result)), (req.onerror = () => reject(req.error))))

interface Row {
  hash: string
  name: string
  size: number
  lastUsed: number
  data: ArrayBuffer
}

export class IndexedDbPdfStore implements PdfStore {
  private db: Promise<IDBDatabase> | null = null
  constructor(private name = DB) {}
  private open() {
    this.db ??= new Promise((resolve, reject) => {
      const r = indexedDB.open(this.name, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'hash' })
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => {
        this.db = null
        reject(r.error)
      }
    })
    return this.db
  }
  private async store(mode: IDBTransactionMode) {
    return (await this.open()).transaction(STORE, mode).objectStore(STORE)
  }
  async put(hash: string, bytes: Uint8Array, name: string) {
    const row: Row = { hash, name, size: bytes.byteLength, lastUsed: Date.now(), data: bytes.slice().buffer as ArrayBuffer }
    await wrap((await this.store('readwrite')).put(row))
  }
  async get(hash: string) {
    const row = (await wrap((await this.store('readonly')).get(hash))) as Row | undefined
    if (!row) return undefined
    void this.store('readwrite').then((s) => wrap(s.put({ ...row, lastUsed: Date.now() }))).catch(() => undefined)
    return new Uint8Array(row.data)
  }
  async has(hash: string) {
    return (await wrap((await this.store('readonly')).count(hash))) > 0
  }
  async delete(hash: string) {
    await wrap((await this.store('readwrite')).delete(hash))
  }
  async list() {
    const rows = (await wrap((await this.store('readonly')).getAll())) as Row[]
    return rows.map(({ hash, name, size, lastUsed }) => ({ hash, name, size, lastUsed }))
  }
}
