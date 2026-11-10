import { openPdf, PdfPasswordError, type PdfHandle, type PdfjsLike } from '@/core/pdf/engine'
import { IndexedDbPdfStore, MemoryPdfStore, type PdfStore } from '@/core/pdf/store'
import type { PdfSource } from '@/core/pdf/types'

/** The PDFs kept on this device, by hash. */
function createStore(): PdfStore {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbPdfStore()
  } catch {
    /* fall through */
  }
  return new MemoryPdfStore()
}
export let pdfStore: PdfStore = createStore()
/** Tests swap in their own. */
export const setPdfStore = (s: PdfStore) => void (pdfStore = s)

/** The pdf.js library and its worker, loaded the first time a PDF is opened (it is large, so it is not part of the editor). */
let library: Promise<PdfjsLike> | null = null
let lib: PdfjsLike | null = null
export function loadPdfjs(): Promise<PdfjsLike> {
  library ??= (async () => {
    const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    // Fonts, colour profiles, character maps and image decoders are fetched by the worker from this site's own /pdfjs/ folder.
    const at = (dir: string) => new URL(`/pdfjs/${dir}/`, location.origin).href
    const assets = { useWorkerFetch: true, wasmUrl: at('wasm'), standardFontDataUrl: at('standard_fonts'), cMapUrl: at('cmaps'), cMapPacked: true, iccUrl: at('iccs') }
    lib = { getDocument: (src) => pdfjs.getDocument({ ...src, ...assets } as never) as never, Util: pdfjs.Util as PdfjsLike['Util'] }
    return lib
  })().catch((e) => {
    library = null
    throw e
  })
  return library
}
/** For tests: use this pdf.js (the Node build) instead of loading the browser one. */
export function usePdfjs(p: PdfjsLike) {
  lib = p
  library = Promise.resolve(p)
}
export const pdfjsNow = () => lib

/** Changes whenever this device's copies of PDFs change (added, given again, removed), so what shows them looks again. */
let deviceVersion = 0
const deviceListeners = new Set<() => void>()
export const bumpDevice = () => {
  deviceVersion++
  deviceListeners.forEach((l) => l())
}
export const subscribeDevice = (fn: () => void) => (deviceListeners.add(fn), () => void deviceListeners.delete(fn))
export const getDeviceVersion = () => deviceVersion

/** Open documents, by the PDF's hash (one open copy however many maps or panels use it). */
const open = new Map<string, Promise<PdfHandle>>()
/** Hashes in the order they were last shown (newest last): the memory budget lets go of the oldest background ones. */
let used: string[] = []
/** How many documents that are NOT on screen may stay open, so switching back to a recent tab is instant. */
export const BACKGROUND_DOCUMENTS = 2
const touch = (hash: string) => (used = [...used.filter((h) => h !== hash), hash])

/**
 * One memory budget for all open PDFs: the documents on screen stay, the few most recently used others are kept for a quick return, and
 * every other one is closed (it opens again from this device's copy when its tab is shown). Pages are drawn only for the panes in view,
 * and the page renderer is shared, so five PDFs of 200 pages cost no more than one while only one or two are showing.
 */
export function trimOpenPdfs(showing: readonly string[]) {
  for (const h of showing) touch(h)
  const keep = new Set([...showing, ...used.filter((h) => !showing.includes(h)).slice(-BACKGROUND_DOCUMENTS)])
  for (const h of [...open.keys()]) if (!keep.has(h)) void closePdf(h)
  used = used.filter((h) => keep.has(h))
}
export const openDocumentCount = () => open.size

/** Passwords typed this session, by the PDF's hash. They are kept in memory only, never in the map or on disk. */
const passwords = new Map<string, string>()
export const rememberPassword = (hash: string, password: string) => void passwords.set(hash, password)

export type PdfAccess = { state: 'ready'; handle: PdfHandle } | { state: 'missing' } | { state: 'password'; wrong: boolean } | { state: 'error'; message: string }

/** The open document for a source: from this device's copy. `missing` when this device does not hold the file (it asks for it again). */
export async function accessPdf(source: PdfSource, onProgress?: (fraction: number) => void): Promise<PdfAccess> {
  try {
    touch(source.hash)
    let h = open.get(source.hash)
    if (!h) {
      h = (async () => {
        const bytes = await pdfStore.get(source.hash)
        if (!bytes) throw new Missing()
        return openPdf(await loadPdfjs(), bytes, (p) => onProgress?.(p.total ? p.loaded / p.total : 0), passwords.get(source.hash))
      })()
      open.set(source.hash, h)
      h.catch(() => open.delete(source.hash))
    }
    return { state: 'ready', handle: await h }
  } catch (e) {
    if (e instanceof Missing) return { state: 'missing' }
    if (e instanceof PdfPasswordError) return { state: 'password', wrong: e.wrong }
    return { state: 'error', message: e instanceof Error ? e.message : 'This PDF could not be opened.' }
  }
}

class Missing extends Error {}

/** Lets go of an open document (it is opened again when needed). */
export async function closePdf(hash: string) {
  const h = open.get(hash)
  open.delete(hash)
  if (h) await h.then((x) => x.destroy()).catch(() => undefined)
}

export async function closeAllPdfs() {
  await Promise.all([...open.keys()].map(closePdf))
}
