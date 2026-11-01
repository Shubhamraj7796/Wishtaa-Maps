import type { PdfHandle } from '@/core/pdf/engine'
import type { PdfSource } from '@/core/pdf/types'

/** The markup tools bar (filled in by the markup tools). */
export function Toolbar({ source }: { source: PdfSource }) {
  void source
  return null
}

/** The list of markup, by page (filled in by the markup tools). */
export function MarkupTab({ source, handle }: { source: PdfSource; handle: PdfHandle }) {
  void [source, handle]
  return <div className="p-4 text-sm text-muted">No markup yet.</div>
}
