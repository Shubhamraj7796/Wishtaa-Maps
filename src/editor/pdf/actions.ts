import { sha256Hex } from '@/core/images/sha256'
import { newId } from '@/core/model/ids'
import { LOCAL } from '@/core/model/doc'
import { looksLikePdf, openPdf, PdfError, PdfPasswordError } from '@/core/pdf/engine'
import { editKey, PDF_LIMITS, type PdfSource, type SourceRef } from '@/core/pdf/types'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { useEditor, closedPdfPanel, type PdfPanelState } from '../store'
import { driveAuth, driveClient, driveConfig } from '@/app/drive'
import { pickPdfFiles } from '@/core/drive/picker'
import { askPassword } from './password'
import { rememberSize, type PanelSize } from './layout'
import { isShape, loadPrefs, sanitizeStyle, savePrefs, type Shape as PanelShape, type StyleKey, type ToolStyle } from './toolPrefs'
import { bumpDevice, closePdf, loadPdfjs, pdfStore, rememberPassword } from './runtime'

const get = useEditor.getState
const set = useEditor.setState

const patch = (p: Partial<PdfPanelState>) => set({ pdfPanel: { ...get().pdfPanel, ...p } })

export const closePdfPanel = () => set({ pdfPanel: { ...closedPdfPanel(), zoom: get().pdfPanel.zoom } })

/** Opens or closes the panel's Outline drawer (full screen). */
export const setPdfDrawer = (drawer: boolean) => patch({ drawer })
export const setPdfToolSide = (toolSide: 'left' | 'right') => void (get().pdfPanel.toolSide !== toolSide && patch({ toolSide }))
export const setPdfCollapsed = (collapsed: boolean) => patch({ collapsed, ...(collapsed ? { drawer: false } : {}) })
/** How much of the editor the PDF takes. Page, zoom and place in the PDF are kept; "Fit" fits again. */
export function setPdfSize(size: PanelSize) {
  rememberSize(size)
  patch({ size, collapsed: false, ...(size === 'full' ? {} : { drawer: false }) })
}

/** The PDF button: opens the panel on the map's first PDF (or empty, ready for one), or closes it. */
export function togglePdfPanel() {
  const p = get().pdfPanel
  if (p.open) return closePdfPanel()
  const first = p.sourceId && get().pdf.sources[p.sourceId] ? p.sourceId : (Object.values(get().pdf.sources).sort((a, b) => a.addedAt - b.addedAt)[0]?.id ?? null)
  patch({ open: true, sourceId: first })
}
export const setPdfPage = (page: number) => patch({ page: Math.max(1, Math.round(page)) })
export const setPdfZoom = (zoom: number | null) => patch({ zoom: zoom === null ? null : Math.min(4, Math.max(0.25, zoom)) })
export const setPdfTab = (tab: PdfPanelState['tab']) => patch({ tab })
/** The Shapes button remembers the shape last used, wherever it was used (PDF or picture). */
export function rememberShape(shape: PanelShape) {
  patch({ shape })
  savePrefs({ ...loadPrefs(), shape })
}
export function setPdfTool(tool: PdfPanelState['tool']) {
  if (isShape(tool)) {
    patch({ tool, shape: tool })
    savePrefs({ ...loadPrefs(), shape: tool })
  } else patch({ tool })
}
/** Changes one tool's colour, size or strength; it is remembered for next time on this device. */
export function setToolStyle(key: StyleKey, change: Partial<ToolStyle>) {
  const styles = { ...get().pdfPanel.styles, [key]: sanitizeStyle(key, { ...get().pdfPanel.styles[key], ...change }) }
  patch({ styles })
  savePrefs({ ...loadPrefs(), styles })
}

/** Shows a PDF (opens the panel on it). */
export function showPdf(sourceId: string, page = 1) {
  patch({ open: true, sourceId, page, tab: 'pages' })
}

/** Shows (and marks) a place in a PDF: from "p. 12" on a topic, or a markup in the list. */
export function showSource(ref: SourceRef) {
  const source = get().pdf.sources[ref.sourceId]
  if (!source) {
    showNotice('The PDF this came from is no longer in this map.')
    return
  }
  patch({ open: true, sourceId: ref.sourceId, page: ref.page, tab: 'pages', focus: { sourceId: ref.sourceId, page: ref.page, ...(ref.rect ? { rect: ref.rect } : {}), at: Date.now() } })
}

/**
 * Adds a PDF to the map from its bytes: checked first (it must open), kept on this device by its hash, and recorded in the map as a
 * reference. The same file added twice is one source. One undo step.
 */
export async function addPdf(bytes: Uint8Array, name: string, opts: { driveId?: string } = {}): Promise<PdfSource | null> {
  if (!mayEdit('Adding a PDF')) return null
  try {
    if (bytes.byteLength > PDF_LIMITS.maxBytes) throw new PdfError(`"${name}" is larger than ${Math.round(PDF_LIMITS.maxBytes / 1048576)} MB, which is more than we open.`)
    const hash = await sha256Hex(bytes)
    const known = Object.values(get().pdf.sources).find((s) => s.hash === hash)
    if (known) {
      if (!(await pdfStore.has(hash))) await pdfStore.put(hash, bytes, name)
      showPdf(known.id)
      showNotice(`"${name}" is already in this map.`)
      return known
    }
    // It must open before it is kept or recorded.
    const pdfjs = await loadPdfjs()
    let password: string | undefined
    let handle
    for (;;) {
      try {
        handle = await openPdf(pdfjs, bytes, undefined, password)
        break
      } catch (e) {
        if (!(e instanceof PdfPasswordError)) throw e
        const typed = await askPassword(name, e.wrong)
        if (typed === null) return null // given up: nothing is added
        password = typed
      }
    }
    if (password) rememberPassword(hash, password)
    const pages = handle.pages
    await handle.destroy()
    await pdfStore.put(hash, bytes, name)
    bumpDevice()
    const source: PdfSource = { id: newId(), name: name.replace(/\.pdf$/i, '') + (/\.pdf$/i.test(name) ? '.pdf' : ''), size: bytes.byteLength, hash, pages, ...(opts.driveId ? { driveId: opts.driveId } : {}), addedAt: Date.now() }
    mapDoc.ydoc.transact(() => mapDoc.pdfSources.set(source.id, source), LOCAL)
    showPdf(source.id)
    return source
  } catch (e) {
    showNotice(e instanceof PdfError ? e.message : 'This PDF could not be added.')
    return null
  }
}

/** A PDF from a file the person chose or dropped. */
export async function addPdfFile(file: File): Promise<PdfSource | null> {
  // A PDF is known by what is inside it, not by its name or type (some systems give none), so only a clearly different type is refused here.
  if (file.type && file.type !== 'application/pdf' && file.type !== 'application/octet-stream' && !/\.pdf$/i.test(file.name)) {
    showNotice(`"${file.name}" isn't a PDF.`)
    return null
  }
  if (file.size > PDF_LIMITS.maxBytes) {
    showNotice(`"${file.name}" is larger than ${Math.round(PDF_LIMITS.maxBytes / 1048576)} MB, which is more than we open.`)
    return null
  }
  return addPdf(new Uint8Array(await file.arrayBuffer()), file.name)
}

/** Adds several files one after the other (a drop or a multiple choice). */
export async function addPdfFiles(files: readonly File[]): Promise<void> {
  for (const f of files) await addPdfFile(f)
}

/** Asks for a PDF on this device. Must be called from a click. */
export function pickPdfFromDevice() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf,application/pdf'
  input.multiple = true
  input.onchange = () => void addPdfFiles([...(input.files ?? [])])
  input.click()
}

/** The PDF the person has given again after it was missing from this device: it must be the same file (same hash). */
export async function reopenPdf(sourceId: string, file: File): Promise<boolean> {
  const source = get().pdf.sources[sourceId]
  if (!source) return false
  const bytes = new Uint8Array(await file.arrayBuffer())
  if ((await sha256Hex(bytes)) !== source.hash) {
    showNotice(`That is not the same file as "${source.name}", so the links and markup would not fit it. Choose the original.`)
    return false
  }
  await pdfStore.put(source.hash, bytes, source.name)
  await closePdf(source.hash)
  bumpDevice()
  return true
}

/** Frees the space a PDF takes on this device. The maps keep their links and markup; the file is asked for again when needed. */
export async function removePdfFromDevice(hash: string) {
  await closePdf(hash)
  await pdfStore.delete(hash)
  bumpDevice()
}

/** Takes a PDF out of the map, with its markup and page edits (one undo step). Topics keep their text; their "p. N" links stop working. */
export function removePdfSource(sourceId: string) {
  if (!mayEdit('Removing a PDF')) return
  mapDoc.ydoc.transact(() => {
    mapDoc.pdfSources.delete(sourceId)
    for (const [k, m] of mapDoc.markup) if (m.sourceId === sourceId) mapDoc.markup.delete(k)
    for (const k of [...mapDoc.pageEdits.keys()]) if (k.startsWith(`${sourceId}:`)) mapDoc.pageEdits.delete(k)
  }, LOCAL)
  if (get().pdfPanel.sourceId === sourceId) {
    const next = Object.keys(get().pdf.sources).find((id) => id !== sourceId) ?? null
    patch({ sourceId: next, open: next !== null, page: 1 })
  }
}

/** Turns a page (one undo step), or hides / shows it. Nothing in the file changes. */
export function setPageEdit(sourceId: string, page: number, change: Partial<{ rotation: 0 | 90 | 180 | 270; hidden: boolean }>) {
  if (!mayEdit('Changing pages')) return
  const key = editKey(sourceId, page)
  const cur = mapDoc.pageEdits.get(key) ?? { rotation: 0 as const, hidden: false }
  mapDoc.ydoc.transact(() => mapDoc.pageEdits.set(key, { ...cur, ...change }), LOCAL)
}

export const turnPage = (sourceId: string, page: number, by: 90 | -90) => {
  const cur = get().pdf.pageEdits[editKey(sourceId, page)]?.rotation ?? 0
  setPageEdit(sourceId, page, { rotation: ((((cur + by) % 360) + 360) % 360) as 0 | 90 | 180 | 270 })
}

/**
 * Inserts PDFs from Google Drive: sign in if needed, choose them in the PDF picker (several at once), download each with the signed-in
 * access, check by content that it is a PDF, and add it. A file that is not a PDF, is too big or is damaged is reported by name and the
 * rest still go in.
 */
export async function openPdfFromDrive(): Promise<PdfSource | null> {
  if (!mayEdit('Adding a PDF')) return null
  let last: PdfSource | null = null
  try {
    if (!driveAuth.ready()) await driveAuth.connect()
    const token = await driveAuth.getToken()
    const docs = await pickPdfFiles({ token, apiKey: driveConfig.apiKey, clientId: driveConfig.clientId })
    for (const doc of docs) {
      if (doc.sizeBytes && doc.sizeBytes > PDF_LIMITS.maxBytes) {
        showNotice(`"${doc.name}" is larger than ${Math.round(PDF_LIMITS.maxBytes / 1048576)} MB, which is more than we open.`)
        continue
      }
      showNotice(`Downloading "${doc.name}" from Google Drive…`)
      let bytes: Uint8Array
      try {
        bytes = await driveClient.downloadBytes(doc.id)
      } catch (e) {
        showNotice(e instanceof Error && e.message ? e.message : `"${doc.name}" could not be downloaded from Google Drive.`)
        continue
      }
      if (!looksLikePdf(bytes)) {
        showNotice(`"${doc.name}" isn't a PDF.`)
        continue
      }
      last = (await addPdf(bytes, doc.name, { driveId: doc.id })) ?? last
    }
    return last
  } catch (e) {
    showNotice(e instanceof Error && e.message ? e.message : 'The PDF could not be opened from Google Drive.')
    return last
  }
}

/** Brings a missing PDF back from the Drive file it came from (it must still be the same file). */
export async function refetchFromDrive(sourceId: string): Promise<boolean> {
  const source = get().pdf.sources[sourceId]
  if (!source?.driveId) return false
  try {
    if (!driveAuth.ready()) await driveAuth.connect()
    const bytes = await driveClient.downloadBytes(source.driveId)
    if ((await sha256Hex(bytes)) !== source.hash) {
      showNotice('The file in Google Drive has changed since it was added, so the links and markup would not fit it.')
      return false
    }
    await pdfStore.put(source.hash, bytes, source.name)
    bumpDevice()
    return true
  } catch {
    showNotice('Google Drive would not give the file again. Choose it with Reopen PDF, or from Google Drive with the + button.')
    return false
  }
}
