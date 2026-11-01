import type { PdfHandle } from '@/core/pdf/engine'
import type { PageLines } from '@/core/pdf/text'
import type { PdfSource } from '@/core/pdf/types'
import type { PageBox } from './PageView'

/** What is drawn above a page's text: markup, and the tool the person is using. (Filled in by the markup tools.) */
export function PageLayers(props: { source: PdfSource; handle: PdfHandle; n: number; box: PageBox; lines: PageLines | null }) {
  void props
  return null
}
