import { turn } from './geometry'
import { groupLines, type BookmarkNode, type PageLines, type Run } from './text'
import { PDF_LIMITS, type Turn } from './types'

/**
 * A thin layer over pdf.js: one open PDF, its pages' sizes as they are READ (the page's own rotation applied), its text as lines with
 * positions, and its bookmarks. pdf.js itself is handed in (the browser build in the app, the Node build in tests), and everything
 * that is dangerous is switched off: no scripts, no forms engine, no eval, and a cap on image size.
 */

/** The part of pdf.js this uses (kept narrow, so it is easy to stand in for). */
export interface PdfjsLike {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDocLike>; onProgress?: ((p: { loaded: number; total?: number }) => void) | null; destroy(): Promise<void> }
  Util: { transform(a: number[], b: number[]): number[] }
}

export interface PdfPageLike {
  rotate: number
  getViewport(o: { scale: number; rotation?: number }): { width: number; height: number; transform: number[]; scale: number }
  getTextContent(): Promise<{ items: unknown[] }>
  render(o: { canvasContext: unknown; viewport: unknown; transform?: number[]; canvas?: unknown }): { promise: Promise<void>; cancel(): void }
  cleanup(): void
}

export interface PdfDocLike {
  numPages: number
  getPage(n: number): Promise<PdfPageLike>
  getOutline(): Promise<{ title: string; dest: unknown; items: unknown[] }[] | null>
  getDestination(id: string): Promise<unknown[] | null>
  getPageIndex(ref: unknown): Promise<number>
}

/** The safe way to open: nothing in the file is run. */
export const SAFE_OPTIONS = {
  isEvalSupported: false,
  enableXfa: false,
  useWorkerFetch: false,
  stopAtErrors: false,
  maxImageSize: 64 * 1024 * 1024,
  disableFontFace: false,
  verbosity: 0,
} as const

export interface PageInfo {
  /** Size of the page as it is read, in points. */
  w: number
  h: number
  /** The rotation stored in the page itself. */
  own: Turn
}

export class PdfError extends Error {}

/** The PDF needs a password (`wrong`: the one given was not right). */
export class PdfPasswordError extends PdfError {
  constructor(readonly wrong: boolean) {
    super(wrong ? 'That password is not right.' : 'This PDF is password protected. Enter the password.')
  }
}

export interface OpenProgress {
  loaded: number
  total: number
}

export class PdfHandle {
  private infos = new Map<number, PageInfo>()
  private lines = new Map<number, PageLines>()
  constructor(
    readonly pdfjs: PdfjsLike,
    readonly doc: PdfDocLike,
    readonly pages: number,
    private readonly close: () => Promise<void>
  ) {}

  async page(n: number): Promise<PdfPageLike> {
    if (n < 1 || n > this.pages) throw new PdfError(`There is no page ${n}.`)
    return this.doc.getPage(n)
  }

  /** The size of page n as it is read. Cached. */
  async info(n: number): Promise<PageInfo> {
    const known = this.infos.get(n)
    if (known) return known
    const page = await this.page(n)
    const vp = page.getViewport({ scale: 1 })
    const info = { w: vp.width, h: vp.height, own: turn(page.rotate) }
    this.infos.set(n, info)
    page.cleanup()
    return info
  }

  /** The text of page n as lines with positions (in points, as the page is read). Cached for the last pages asked for. */
  async text(n: number): Promise<PageLines> {
    const known = this.lines.get(n)
    if (known) return known
    const page = await this.page(n)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const runs: Run[] = []
    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number }
      if (typeof item.str !== 'string' || !item.transform) continue
      const t = this.pdfjs.Util.transform(vp.transform, item.transform)
      const h = Math.hypot(t[2] ?? 0, t[3] ?? 0)
      const w = (item.width ?? 0) * vp.scale
      runs.push({ str: item.str, x: t[4] ?? 0, y: (t[5] ?? 0) - h, w, h })
    }
    page.cleanup()
    const out: PageLines = { page: n, w: vp.width, h: vp.height, lines: groupLines(runs) }
    this.lines.set(n, out)
    if (this.lines.size > 12) this.lines.delete(this.lines.keys().next().value as number)
    return out
  }

  /** True when the pages of this PDF have no text at all in the first `look` pages (a scan or a handwritten page). */
  async hasText(look = 5): Promise<boolean> {
    for (let n = 1; n <= Math.min(look, this.pages); n++) if ((await this.text(n)).lines.length) return true
    return false
  }

  /** The bookmarks as a tree with page numbers. Empty when the PDF has none. */
  async bookmarks(max = 5000): Promise<BookmarkNode[]> {
    const outline = await this.doc.getOutline().catch(() => null)
    if (!outline) return []
    let count = 0
    const walk = async (items: { title: string; dest: unknown; items: unknown[] }[]): Promise<BookmarkNode[]> => {
      const out: BookmarkNode[] = []
      for (const it of items) {
        if (count++ > max) break
        out.push({ title: String(it.title ?? ''), page: await this.pageOfDest(it.dest), children: await walk((it.items ?? []) as never) })
      }
      return out
    }
    return walk(outline)
  }

  private async pageOfDest(dest: unknown): Promise<number | null> {
    try {
      const d = typeof dest === 'string' ? await this.doc.getDestination(dest) : (dest as unknown[] | null)
      const target = d?.[0]
      if (target === null || target === undefined) return null
      if (typeof target === 'number') return target + 1
      return (await this.doc.getPageIndex(target)) + 1
    } catch {
      return null
    }
  }

  async destroy() {
    this.infos.clear()
    this.lines.clear()
    await this.close().catch(() => undefined)
  }
}

/** Opens a PDF from its bytes. Throws a readable error for a file that is too big, not a PDF, damaged, or password protected. */
export async function openPdf(pdfjs: PdfjsLike, bytes: Uint8Array, onProgress?: (p: OpenProgress) => void, password?: string): Promise<PdfHandle> {
  if (bytes.byteLength > PDF_LIMITS.maxBytes) throw new PdfError(`This PDF is larger than ${Math.round(PDF_LIMITS.maxBytes / 1048576)} MB, which is more than we open.`)
  if (!looksLikePdf(bytes)) throw new PdfError("This file isn't a PDF.")
  // pdf.js takes the bytes over, so it gets its own copy.
  const task = pdfjs.getDocument({ ...SAFE_OPTIONS, data: bytes.slice(), ...(password ? { password } : {}) })
  if (onProgress) task.onProgress = (p) => onProgress({ loaded: p.loaded, total: p.total ?? bytes.byteLength })
  try {
    const doc = await task.promise
    return new PdfHandle(pdfjs, doc, doc.numPages, () => task.destroy())
  } catch (e) {
    const name = (e as { name?: string }).name
    if (name === 'PasswordException') throw new PdfPasswordError((e as { code?: number }).code === 2)
    if (name === 'InvalidPDFException') throw new PdfError('This PDF is damaged and could not be read.')
    throw new PdfError('This PDF could not be opened.')
  }
}

/** The file starts with %PDF (it may have a few bytes of junk before it, as some do). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024))
  return head.includes('%PDF-')
}
