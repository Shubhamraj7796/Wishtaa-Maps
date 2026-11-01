import { sha256Hex } from '@/core/images/sha256'
import { newId } from '@/core/model/ids'
import { LOCAL } from '@/core/model/doc'
import { openPdf, PdfError } from '@/core/pdf/engine'
import { editKey, PDF_LIMITS, type PdfSource, type SourceRef } from '@/core/pdf/types'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { useEditor, closedPdfPanel, type PdfPanelState } from '../store'
import { driveAuth, driveClient, driveConfig } from '@/app/drive'
import { pickPdfFile } from '@/core/drive/picker'
import { bumpDevice, closePdf, loadPdfjs, pdfStore } from './runtime'

const get = useEditor.getState
const set = useEditor.setState

const patch = (p: Partial<PdfPanelState>) => set({ pdfPanel: { ...get().pdfPanel, ...p } })

export const closePdfPanel = () => set({ pdfPanel: { ...closedPdfPanel(), zoom: get().pdfPanel.zoom } })

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
export const setPdfColor = (color: string) => patch({ color })
export const setPdfTool = (tool: PdfPanelState['tool']) => patch({ tool })

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
    const handle = await openPdf(await loadPdfjs(), bytes)
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
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    showNotice(`"${file.name}" is not a PDF.`)
    return null
  }
  if (file.size > PDF_LIMITS.maxBytes) {
    showNotice(`"${file.name}" is larger than ${Math.round(PDF_LIMITS.maxBytes / 1048576)} MB, which is more than we open.`)
    return null
  }
  return addPdf(new Uint8Array(await file.arrayBuffer()), file.name)
}

/** Asks for a PDF on this device. Must be called from a click. */
export function pickPdfFromDevice() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.pdf,application/pdf'
  input.onchange = () => {
    const file = input.files?.[0]
    if (file) void addPdfFile(file)
  }
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

/** Opens a PDF from Google Drive: sign in if needed, choose it in Google's picker, download it, and add it. */
export async function openPdfFromDrive(): Promise<PdfSource | null> {
  if (!mayEdit('Adding a PDF')) return null
  try {
    if (!driveAuth.ready()) await driveAuth.connect()
    const token = await driveAuth.getToken()
    const doc = await pickPdfFile({ token, apiKey: driveConfig.apiKey, clientId: driveConfig.clientId })
    if (!doc) return null
    if (doc.sizeBytes && doc.sizeBytes > PDF_LIMITS.maxBytes) {
      showNotice(`"${doc.name}" is larger than ${Math.round(PDF_LIMITS.maxBytes / 1048576)} MB, which is more than we open.`)
      return null
    }
    showNotice(`Downloading "${doc.name}" from Google Drive…`)
    const bytes = await driveClient.downloadBytes(doc.id)
    return await addPdf(bytes, doc.name, { driveId: doc.id })
  } catch (e) {
    showNotice(e instanceof Error && e.message ? e.message : 'The PDF could not be opened from Google Drive.')
    return null
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
