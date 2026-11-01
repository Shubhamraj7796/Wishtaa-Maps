/**
 * PDFs in a map. A map never contains a PDF: it holds a REFERENCE to each one (name, size, a content hash, the Drive file it came
 * from, the page count) and what the person did on top of it (links from topics, markup, page edits). The PDF itself stays where it
 * is, and a copy is kept on this device by its hash. The original file is never changed.
 *
 * Positions are PAGE-RELATIVE: x and y are fractions (0 to 1) of the page's width and height, measured from the top left of the page
 * as it is meant to be read (its own rotation applied), so they do not depend on zoom or on how the page is drawn. Turning a page
 * (a page edit) turns the markup with it.
 */

/** A rectangle on a page, in fractions of the page (x, y = top left). */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export type Point = [number, number]

export interface PdfSource {
  id: string
  name: string
  size: number
  /** SHA-256 of the file's bytes: the copy kept on this device, and a check that a reopened file is the same one. */
  hash: string
  pages: number
  /** The Google Drive file it was opened from, if any (so it can be fetched again). */
  driveId?: string
  addedAt: number
}

/** Where in a PDF a topic comes from: shown as "p. 12", and clicking it shows the passage. */
export interface SourceRef {
  sourceId: string
  /** 1 to the number of pages. */
  page: number
  /** The passage (one rectangle covering it), if known. */
  rect?: Rect
}

export type MarkupKind = 'highlight' | 'underline' | 'strike' | 'pen' | 'text' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'whiteout' | 'link'

export const MARKUP_KINDS: readonly MarkupKind[] = ['highlight', 'underline', 'strike', 'pen', 'text', 'rect', 'ellipse', 'line', 'arrow', 'whiteout', 'link']

export interface MarkupObject {
  id: string
  sourceId: string
  page: number
  kind: MarkupKind
  /** A colour such as "#facc15". */
  color: string
  /** Pen and shape line width, as a fraction of the page width. */
  width?: number
  /** Highlight, underline, strike: one rectangle per line of text. Shapes, whiteout, text box and link: one rectangle. */
  rects?: Rect[]
  /** Pen: the path. Line and arrow: two points. */
  points?: Point[]
  /** The words under a highlight (for "make a topic from this"), or the words in a text box. */
  text?: string
  /** A note on this markup. */
  note?: string
  /** Text box: size as a fraction of the page height. */
  fontSize?: number
  /** Link: another page of this PDF, or an address on the web. */
  link?: { page: number } | { url: string }
  /** The topic made from this markup, if any. */
  topicId?: string
  createdAt: number
}

export type Turn = 0 | 90 | 180 | 270

/** What was done to a page: turned, or hidden (never removed from the file). */
export interface PageEdit {
  rotation: Turn
  hidden: boolean
}

export const NO_EDIT: PageEdit = { rotation: 0, hidden: false }

export const editKey = (sourceId: string, page: number) => `${sourceId}:${page}`

export interface PdfState {
  sources: Record<string, PdfSource>
  markup: Record<string, MarkupObject>
  pageEdits: Record<string, PageEdit>
}

export const emptyPdfState = (): PdfState => ({ sources: {}, markup: {}, pageEdits: {} })

/** Limits (one place). */
export const PDF_LIMITS = {
  /** A PDF over this is refused. */
  maxBytes: 50 * 1024 * 1024,
  /** Rendered pages held in memory at once. */
  renderedPages: 8,
  /** Pages drawn at the same time. */
  concurrentRenders: 2,
  /** Pixels in one rendered page (a retina page at high zoom is capped, then scaled up a little). */
  maxPagePixels: 16_000_000,
  maxMarkupPerMap: 20_000,
} as const
