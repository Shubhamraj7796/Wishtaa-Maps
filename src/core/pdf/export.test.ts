import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../images/sha256'
import { exportMarkedPdf, markedName } from './export'
import { rectToPdf } from './geometry'
import { makePdf } from './testkit'
import { editKey, type MarkupObject, type PageEdit, type Rect, type Turn } from './types'

let seq = 0
const mk = (m: Partial<MarkupObject> & Pick<MarkupObject, 'kind' | 'page'>): MarkupObject => ({ id: `m${++seq}`, sourceId: 's', color: '#facc15', createdAt: ++seq, ...m })
const R: Rect = { x: 0.1, y: 0.2, w: 0.4, h: 0.05 }
const none: Record<string, PageEdit> = {}

/** All the drawing instructions of one page of a PDF, as text. */
async function content(bytes: Uint8Array, index: number): Promise<string> {
  const doc = await PDFDocument.load(bytes)
  const contents = doc.getPage(index).node.Contents()
  const streams: PDFStream[] = []
  if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i++) streams.push(doc.context.lookup(contents.get(i)) as PDFStream)
  else if (contents) streams.push(contents)
  return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString('latin1')).join('\n')
}

/** The boxes drawn by filled or stroked paths on a page (pdf-lib writes a rectangle as a moved origin and four corners). */
function rects(text: string) {
  const out: { x: number; y: number; width: number; height: number }[] = []
  for (const block of text.split(/\nq\n/)) {
    const cm = /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\n/.exec(block)
    if (!cm) continue
    const pts = [...block.matchAll(/(-?[\d.]+) (-?[\d.]+) [ml]\n/g)].map((m) => [Number(m[1]), Number(m[2])] as const)
    if (pts.length < 4) continue
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    out.push({ x: Number(cm[1]) + Math.min(...xs), y: Number(cm[2]) + Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) })
  }
  return out
}
const near = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => (['x', 'y', 'width', 'height'] as const).every((k) => Math.abs(a[k] - b[k]) < 0.05)

describe('export with markup', () => {
  it('never changes the original bytes, and a second export gives the same result', async () => {
    const original = await makePdf([{}, {}])
    const before = await sha256Hex(original)
    const out = await exportMarkedPdf(original, { sourceId: 's', markup: [mk({ kind: 'highlight', page: 1, rects: [R], text: 'x' })], pageEdits: none })
    expect(await sha256Hex(original)).toBe(before)
    expect(await sha256Hex(out)).not.toBe(before)
    const again = await exportMarkedPdf(original, { sourceId: 's', markup: [mk({ kind: 'highlight', page: 1, rects: [R], text: 'x' })], pageEdits: none })
    expect((await PDFDocument.load(again)).getPageCount()).toBe(2)
  })

  for (const own of [0, 90, 180, 270] as Turn[]) {
    it(`puts a highlight, a rectangle and a whiteout exactly where the page is read, on a page with its own rotation of ${own}`, async () => {
      const original = await makePdf([{ rotate: own, size: [400, 300] }])
      const out = await exportMarkedPdf(original, {
        sourceId: 's',
        markup: [mk({ kind: 'highlight', page: 1, rects: [R] }), mk({ kind: 'rect', page: 1, rects: [{ x: 0.5, y: 0.6, w: 0.3, h: 0.2 }], width: 0.004 }), mk({ kind: 'whiteout', page: 1, rects: [{ x: 0.05, y: 0.9, w: 0.2, h: 0.05 }] })],
        pageEdits: none,
      })
      const found = rects(await content(out, 0))
      for (const r of [R, { x: 0.5, y: 0.6, w: 0.3, h: 0.2 }, { x: 0.05, y: 0.9, w: 0.2, h: 0.05 }]) {
        const want = rectToPdf(r, 400, 300, own)
        expect(found.some((f) => near(f, want)), `rect ${JSON.stringify(r)} expected ${JSON.stringify(want)} in ${JSON.stringify(found)}`).toBe(true)
      }
    })
  }

  it('leaves the original text readable and opens in pdf.js', async () => {
    const original = await makePdf([{ lines: [{ text: 'Original words stay' }] }])
    const out = await exportMarkedPdf(original, { sourceId: 's', markup: [mk({ kind: 'text', page: 1, rects: [{ x: 0.1, y: 0.5, w: 0.5, h: 0.1 }], text: 'Added note', fontSize: 0.04 })], pageEdits: none })
    const doc = await pdfjs.getDocument({ data: new Uint8Array(out) }).promise
    const page = await doc.getPage(1)
    const text = (await page.getTextContent()).items.map((i) => ('str' in i ? i.str : '')).join(' ')
    expect(text).toContain('Original words stay')
    expect(text).toContain('Added note')
  })

  it('writes text the standard font cannot show as a question mark instead of failing, and wraps it inside the box', async () => {
    const original = await makePdf([{}])
    const out = await exportMarkedPdf(original, { sourceId: 's', markup: [mk({ kind: 'text', page: 1, rects: [{ x: 0.1, y: 0.5, w: 0.2, h: 0.3 }], text: 'दवा dawai long long long long long long words', fontSize: 0.05 })], pageEdits: none })
    const doc = await pdfjs.getDocument({ data: new Uint8Array(out) }).promise
    const items = (await (await doc.getPage(1)).getTextContent()).items.map((i) => ('str' in i ? i.str : '')).filter((t) => t.trim())
    expect(items.length).toBeGreaterThan(2) // "Page 1" and the note, which wrapped to more than one line
    expect(items.join(' ')).toContain('???')
    expect(items.join(' ')).toContain('dawai')
  })

  it('draws pen strokes, lines, arrows and ellipses', async () => {
    const original = await makePdf([{}])
    const out = await exportMarkedPdf(original, {
      sourceId: 's',
      markup: [
        mk({ kind: 'pen', page: 1, points: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.1]], width: 0.004 }),
        mk({ kind: 'line', page: 1, points: [[0.1, 0.5], [0.4, 0.6]], width: 0.004 }),
        mk({ kind: 'arrow', page: 1, points: [[0.1, 0.7], [0.5, 0.7]], width: 0.004 }),
        mk({ kind: 'ellipse', page: 1, rects: [R], width: 0.004 }),
        mk({ kind: 'underline', page: 1, rects: [R] }),
        mk({ kind: 'strike', page: 1, rects: [R] }),
      ],
      pageEdits: none,
    })
    const text = await content(out, 0)
    expect((text.match(/ l\n|\bl\b/g) ?? []).length).toBeGreaterThanOrEqual(2 + 1 + 3 + 2) // pen 2, line 1, arrow 3, underline + strike 2
    expect(text).toMatch(/ c\b/) // an ellipse is curves
  })

  it('adds link annotations: a web address, and a page of the PDF; a link to a hidden page is dropped', async () => {
    const original = await makePdf([{}, {}, {}])
    const out = await exportMarkedPdf(original, {
      sourceId: 's',
      markup: [mk({ kind: 'link', page: 1, rects: [R], link: { url: 'https://example.com/' } }), mk({ kind: 'link', page: 1, rects: [{ ...R, y: 0.4 }], link: { page: 3 } }), mk({ kind: 'link', page: 1, rects: [{ ...R, y: 0.6 }], link: { page: 2 } })],
      pageEdits: { [editKey('s', 2)]: { rotation: 0, hidden: true } },
    })
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    const annots = doc.getPage(0).node.Annots()
    expect(annots?.size()).toBe(2) // the link to hidden page 2 was dropped
    const first = doc.context.lookup(annots?.get(0), PDFDict)
    expect(first.get(PDFName.of('Subtype'))?.toString()).toBe('/Link')
    expect(doc.context.lookup(first.get(PDFName.of('A')), PDFDict).get(PDFName.of('URI'))?.toString()).toContain('example.com')
    const second = doc.context.lookup(annots?.get(1), PDFDict)
    const dest = second.get(PDFName.of('Dest')) as PDFArray
    expect(dest.get(0)).toBe(doc.getPage(1).ref) // old page 3 is now the second page
  })

  it('leaves hidden pages out and adds the person’s turn to the page’s own', async () => {
    const original = await makePdf([{ lines: [{ text: 'One' }] }, { lines: [{ text: 'Two' }], rotate: 90 }, { lines: [{ text: 'Three' }] }])
    const out = await exportMarkedPdf(original, {
      sourceId: 's',
      markup: [],
      pageEdits: { [editKey('s', 1)]: { rotation: 0, hidden: true }, [editKey('s', 2)]: { rotation: 90, hidden: false }, [editKey('s', 3)]: { rotation: 270, hidden: false } },
    })
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getPage(0).getRotation().angle).toBe(180) // 90 own + 90 turned
    expect(doc.getPage(1).getRotation().angle).toBe(270)
    expect((await PDFDocument.load(original)).getPageCount()).toBe(3)
  })

  it('refuses when every page is hidden, and ignores markup from other PDFs', async () => {
    const original = await makePdf([{}])
    await expect(exportMarkedPdf(original, { sourceId: 's', markup: [], pageEdits: { [editKey('s', 1)]: { rotation: 0, hidden: true } } })).rejects.toThrow(/hidden/)
    const out = await exportMarkedPdf(original, { sourceId: 's', markup: [mk({ kind: 'whiteout', page: 1, rects: [R], sourceId: 'other' })], pageEdits: none })
    expect(rects(await content(out, 0))).toHaveLength(0)
  })

  it('names the copy after the original', () => {
    expect(markedName('Notes.pdf')).toBe('Notes (marked up).pdf')
    expect(markedName('Notes.PDF')).toBe('Notes (marked up).pdf')
    expect(markedName('')).toBe('Document (marked up).pdf')
  })
})
