import type { PdfHandle } from '@/core/pdf/engine'
import type { PdfSource, Rect } from '@/core/pdf/types'
import { showNotice } from '../notice'
import { mayEdit } from '../readmode'
import { addPictures, resolveTarget } from '../pictures/flow'
import { renderRegion } from './render'
import { setPdfTool } from './actions'

/** Takes a rectangle of a page as a picture for the selected topic (or a new one): the same steps as any added picture. */
export async function captureArea(source: PdfSource, handle: PdfHandle, n: number, rect: Rect) {
  if (!mayEdit('Adding a picture')) return
  setPdfTool('select')
  const blob = await renderRegion(handle, n, rect)
  if (!blob) {
    showNotice('That part of the page could not be turned into a picture.')
    return
  }
  await addPictures([blob], 'capture', resolveTarget(), { crop: false })
  void source
}
