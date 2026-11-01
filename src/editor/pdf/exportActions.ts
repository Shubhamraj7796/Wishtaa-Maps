import { exportMarkedPdf, markedName } from '@/core/pdf/export'
import { driveAuth, driveClient } from '@/app/drive'
import { showNotice } from '../notice'
import { useEditor } from '../store'
import { pdfStore } from './runtime'

const get = useEditor.getState

/** The marked-up copy of a PDF as bytes, or null (with a message) when this device does not hold the original. */
async function buildCopy(sourceId: string): Promise<{ bytes: Uint8Array; name: string } | null> {
  const source = get().pdf.sources[sourceId]
  if (!source) return null
  const original = await pdfStore.get(source.hash)
  if (!original) {
    showNotice('This device does not have the PDF. Use Reopen PDF first, then download.')
    return null
  }
  try {
    const bytes = await exportMarkedPdf(original, { sourceId, markup: Object.values(get().pdf.markup), pageEdits: get().pdf.pageEdits })
    return { bytes, name: markedName(source.name) }
  } catch (e) {
    showNotice(e instanceof Error && e.message ? e.message : 'The marked-up PDF could not be made.')
    return null
  }
}

/** Saves "Name (marked up).pdf" to the device. The original file and the map are not changed. */
export async function downloadMarkedPdf(sourceId: string): Promise<boolean> {
  showNotice('Making the marked-up PDF…', 3000)
  const copy = await buildCopy(sourceId)
  if (!copy) return false
  const url = URL.createObjectURL(new Blob([copy.bytes as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = copy.name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
  showNotice(`Downloaded "${copy.name}".`)
  return true
}

/** Puts "Name (marked up).pdf" in Google Drive as a NEW file in the Wishtaa Maps folder (the original is never replaced). */
export async function saveCopyToDrive(sourceId: string): Promise<boolean> {
  try {
    if (!driveAuth.ready()) await driveAuth.connect()
    showNotice('Making the marked-up PDF…', 3000)
    const copy = await buildCopy(sourceId)
    if (!copy) return false
    const parentId = await driveClient.ensureAppFolder()
    const file = await driveClient.uploadBinary({ name: copy.name, parentId, bytes: copy.bytes, mimeType: 'application/pdf', appProperties: { wishtaaPdfCopy: sourceId } })
    showNotice(`Saved "${file.name ?? copy.name}" to Google Drive (in the Wishtaa Maps folder).`)
    return true
  } catch (e) {
    showNotice(e instanceof Error && e.message ? e.message : 'The copy could not be saved to Google Drive.')
    return false
  }
}
