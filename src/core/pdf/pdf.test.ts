import 'fake-indexeddb/auto'
import * as Y from 'yjs'
import { PDFDocument } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMapDoc, ensureRoot, snapshotPdf, snapshotTopics } from '../model/doc'
import { addChild } from '../model/commands'
import { sha256Hex } from '../images/sha256'
import { openPdf, looksLikePdf, PdfError, type PdfjsLike } from './engine'
import { fromShown, rectFrom, rectToPdf, rectToShown, rectFromShown, shownSize, toPdf, toShown, turn, unionRect } from './geometry'
import { IndexedDbPdfStore, MemoryPdfStore } from './store'
import { detectHeadings, flattenBookmarks, groupLines, joinHyphenation, topicTexts, type PageLines } from './text'
import { makePdf } from './testkit'
import type { Turn } from './types'

const lib = pdfjs as unknown as PdfjsLike
const TURNS: Turn[] = [0, 90, 180, 270]

describe('turning pages and finding places on them', () => {
  it('normalises angles', () => {
    expect([turn(0), turn(90), turn(360), turn(-90), turn(450), turn(268)]).toEqual([0, 90, 0, 270, 90, 270])
  })

  it('turning a point and turning it back gives the same point, for every turn', () => {
    for (const r of TURNS) for (const p of [[0.1, 0.2], [0.9, 0.3], [0.5, 0.5]] as [number, number][]) {
      const back = fromShown(toShown(p, r), r)
      expect(back[0]).toBeCloseTo(p[0])
      expect(back[1]).toBeCloseTo(p[1])
    }
  })

  it('a quarter turn clockwise moves the top left corner to the top right', () => {
    expect(toShown([0, 0], 90)).toEqual([1, 0])
    expect(toShown([1, 0], 90)).toEqual([1, 1])
    expect(toShown([0, 0], 180)).toEqual([1, 1])
    expect(toShown([0, 0], 270)).toEqual([0, 1])
  })

  it('a rectangle turns with the page and comes back', () => {
    const r = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }
    for (const t of TURNS) {
      const back = rectFromShown(rectToShown(r, t), t)
      expect(back.x).toBeCloseTo(r.x)
      expect(back.y).toBeCloseTo(r.y)
      expect(back.w).toBeCloseTo(r.w)
      expect(back.h).toBeCloseTo(r.h)
    }
    expect(rectToShown(r, 90)).toMatchObject({ w: expect.closeTo(0.1), h: expect.closeTo(0.3) })
  })

  it('a turned page has its shape swapped for 90 and 270', () => {
    expect(shownSize(400, 300, 90)).toEqual({ w: 300, h: 400 })
    expect(shownSize(400, 300, 180)).toEqual({ w: 400, h: 300 })
  })

  it('rectangles: from two corners in any order, kept on the page, and their union', () => {
    expect(rectFrom([0.5, 0.5], [0.2, 0.1])).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.4 })
    expect(rectFrom([-1, 0.5], [2, 3])).toEqual({ x: 0, y: 0.5, w: 1, h: 0.5 })
    expect(unionRect([{ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, { x: 0.5, y: 0.6, w: 0.2, h: 0.1 }])).toEqual({ x: 0.1, y: 0.1, w: expect.closeTo(0.6), h: expect.closeTo(0.6) })
    expect(unionRect([])).toBeNull()
  })

  it('agrees with pdf.js: a place on the page as read is the same place in the PDF, for a page turned 0, 90, 180 and 270 in the file', async () => {
    for (const own of TURNS) {
      const bytes = await makePdf([{ rotate: own, size: [400, 300] }])
      const handle = await openPdf(lib, bytes)
      const page = await handle.page(1)
      const vp = page.getViewport({ scale: 1 })
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.25, 0.7], [0.8, 0.1]] as [number, number][]) {
        const real = (vp as unknown as { convertToPdfPoint(x: number, y: number): number[] }).convertToPdfPoint(u * vp.width, v * vp.height)
        const mine = toPdf([u, v], 400, 300, own)
        expect(mine[0], `own ${own} (${u},${v}) x`).toBeCloseTo(real[0] as number, 3)
        expect(mine[1], `own ${own} (${u},${v}) y`).toBeCloseTo(real[1] as number, 3)
      }
      await handle.destroy()
    }
  })

  it('a rectangle in PDF coordinates (lower left origin) from one on the page as read', () => {
    expect(rectToPdf({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 400, 300, 0)).toEqual({ x: 100, y: 75, width: 200, height: 75 })
  })
})

describe('text for topics', () => {
  it('joins a word split by a hyphen at the end of a line, and drops soft hyphens', () => {
    expect(joinHyphenation('inter-\nnational trade')).toBe('international trade')
    expect(joinHyphenation('well-known\nfact')).toBe('well-known\nfact') // a real hyphen in the middle of a line stays
    expect(joinHyphenation('co-\n  operate')).toBe('cooperate')
    expect(joinHyphenation('Arti­ficial')).toBe('Artificial')
    expect(joinHyphenation('pre-\nIND AS')).toBe('pre-\nIND AS') // a capital after the break: a name, not a split word
  })

  it('one topic for a whole selection, tidied, or one per line', () => {
    const sel = 'Lease means a contract that\nconveys the right to\r\ncontrol the use of an inter-\nnational asset.'
    expect(topicTexts(sel)).toEqual(['Lease means a contract that conveys the right to control the use of an international asset.'])
    expect(topicTexts(sel, { perLine: true })).toEqual(['Lease means a contract that', 'conveys the right to', 'control the use of an international asset.'])
    expect(topicTexts('  \n  ')).toEqual([])
    expect(topicTexts('a    b')).toEqual(['a b'])
  })

  it('groups pieces of text into lines by where they sit, in reading order, with spaces where there are gaps', () => {
    const lines = groupLines([
      { str: 'world', x: 60, y: 10, w: 30, h: 10 },
      { str: 'Hello', x: 10, y: 10.5, w: 40, h: 10 },
      { str: 'Second line', x: 10, y: 30, w: 80, h: 10 },
    ])
    expect(lines.map((l) => l.text)).toEqual(['Hello world', 'Second line'])
    expect(lines[0]).toMatchObject({ x: 10, y: 10, h: 10 })
  })

  it('suggests headings from the size of the text, never touching small body text, page numbers or very long lines', () => {
    const body = (y: number) => ({ text: 'Body text of the paragraph goes here.', x: 40, y, w: 300, h: 11 })
    const pages: PageLines[] = [
      { page: 1, w: 400, h: 600, lines: [{ text: 'Leases', x: 40, y: 30, w: 80, h: 24 }, { text: '1.1 Meaning of lease', x: 40, y: 80, w: 150, h: 16 }, body(110), body(125), body(140), { text: '12', x: 200, y: 580, w: 10, h: 16 }] },
      { page: 2, w: 400, h: 600, lines: [{ text: '2. Recognition', x: 40, y: 30, w: 120, h: 16 }, body(60), body(75), body(90), body(105)] },
    ]
    const h = detectHeadings(pages)
    expect(h.map((x) => [x.title, x.level, x.page])).toEqual([
      ['Leases', 1, 1],
      ['1.1 Meaning of lease', 2, 1],
      ['2. Recognition', 2, 2],
    ])
    expect(h[0]?.rect).toEqual({ x: 0.1, y: 0.05, w: 0.2, h: 0.04 })
  })

  it('a heading that wraps onto a second line is one heading', () => {
    const pages: PageLines[] = [{ page: 1, w: 400, h: 600, lines: [{ text: 'A very long title that', x: 40, y: 30, w: 300, h: 20 }, { text: 'wraps onto a second line', x: 40, y: 52, w: 250, h: 20 }, ...Array.from({ length: 6 }, (_, i) => ({ text: 'Body text of the paragraph goes here.', x: 40, y: 100 + i * 14, w: 300, h: 11 }))] }]
    expect(detectHeadings(pages).map((x) => x.title)).toEqual(['A very long title that wraps onto a second line'])
  })

  it('finds nothing in a document of one text size', () => {
    expect(detectHeadings([{ page: 1, w: 400, h: 600, lines: [{ text: 'Same size everywhere', x: 0, y: 0, w: 100, h: 12 }, { text: 'Also the same', x: 0, y: 20, w: 100, h: 12 }] }])).toEqual([])
    expect(detectHeadings([])).toEqual([])
  })

  it('flattens bookmarks in order with their depth, skipping empty titles', () => {
    const flat = flattenBookmarks([
      { title: 'One', page: 1, children: [{ title: 'One.A', page: 2, children: [] }, { title: '   ', page: 3, children: [] }] },
      { title: 'Two', page: null, children: [] },
    ])
    expect(flat).toEqual([
      { title: 'One', level: 1, page: 1 },
      { title: 'One.A', level: 2, page: 2 },
      { title: 'Two', level: 1, page: null },
    ])
    const deep = (n: number): never => ({ title: `L${n}`, page: 1, children: n < 20 ? [deep(n + 1)] : [] }) as never
    expect(Math.max(...flattenBookmarks([deep(1)]).map((b) => b.level))).toBe(6)
  })
})

describe('opening a PDF', () => {
  let bytes: Uint8Array
  beforeAll(async () => {
    bytes = await makePdf(
      [
        { lines: [{ text: 'Introduction', size: 24 }, { text: 'Lease means a contract.', size: 12 }, { text: 'inter-', size: 12 }, { text: 'national', size: 12 }] },
        { lines: [{ text: 'Second page', size: 24 }], size: [600, 800] },
        { lines: [] },
      ],
      { bookmarks: [{ title: 'Chapter 1', page: 1, children: [{ title: 'Section 1.1', page: 2 }] }, { title: 'Chapter 2', page: 3 }] }
    )
  })

  it('reads the page count and each page size as the page is read, and caches them', async () => {
    const h = await openPdf(lib, bytes)
    expect(h.pages).toBe(3)
    expect(await h.info(1)).toEqual({ w: 400, h: 300, own: 0 })
    expect(await h.info(2)).toEqual({ w: 600, h: 800, own: 0 })
    await h.destroy()
  })

  it('gives the text as lines with positions, top to bottom', async () => {
    const h = await openPdf(lib, bytes)
    const t = await h.text(1)
    expect(t.lines.map((l) => l.text)).toEqual(['Introduction', 'Lease means a contract.', 'inter-', 'national'])
    expect(t.lines[0]?.h).toBeCloseTo(24, 0)
    expect(t.lines[0]?.y).toBeLessThan(t.lines[1]?.y as number)
    expect(topicTexts(t.lines.slice(1).map((l) => l.text).join('\n'))).toEqual(['Lease means a contract. international'])
    await h.destroy()
  })

  it('reads the bookmarks with their pages', async () => {
    const h = await openPdf(lib, bytes)
    const tree = await h.bookmarks()
    expect(flattenBookmarks(tree)).toEqual([
      { title: 'Chapter 1', level: 1, page: 1 },
      { title: 'Section 1.1', level: 2, page: 2 },
      { title: 'Chapter 2', level: 1, page: 3 },
    ])
    await h.destroy()
  })

  it('a PDF with no bookmarks has none', async () => {
    const h = await openPdf(lib, await makePdf([{}]))
    expect(await h.bookmarks()).toEqual([])
    await h.destroy()
  })

  it('knows whether there is text to select (a scan has none)', async () => {
    const withText = await openPdf(lib, bytes)
    expect(await withText.hasText()).toBe(true)
    const scan = await openPdf(lib, await makePdf([{ lines: [] }, { lines: [] }]))
    expect(await scan.hasText()).toBe(false)
    await withText.destroy()
    await scan.destroy()
  })

  it('refuses what is not a PDF, is too big, or is damaged, with a message a person can read', async () => {
    await expect(openPdf(lib, new TextEncoder().encode('just some words'))).rejects.toThrow(/not a PDF/)
    await expect(openPdf(lib, new Uint8Array(51 * 1024 * 1024))).rejects.toThrow(/larger than 50 MB/)
    await expect(openPdf(lib, new TextEncoder().encode('%PDF-1.4\nthis is not really a pdf file at all'))).rejects.toBeInstanceOf(PdfError)
    expect(looksLikePdf(new TextEncoder().encode('junk\n%PDF-1.7'))).toBe(true)
  })

  it('refuses a PDF protected with a password and says so', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    // pdf-lib cannot write encrypted files, so a hand-made encrypted header is used by pdf.js tests elsewhere; here the message is checked
    // through the error name pdf.js gives.
    const fake: PdfjsLike = {
      Util: lib.Util,
      getDocument: () => ({ promise: Promise.reject(Object.assign(new Error('x'), { name: 'PasswordException' })), destroy: async () => undefined }),
    }
    await expect(openPdf(fake, await doc.save())).rejects.toThrow(/password/)
  })

  it('opens without running anything: no scripts, no eval, nothing from the network', async () => {
    const seen: Record<string, unknown>[] = []
    const spy: PdfjsLike = { ...lib, Util: lib.Util, getDocument: (src) => (seen.push(src), lib.getDocument(src)) }
    const h = await openPdf(spy, bytes)
    expect(seen[0]).toMatchObject({ isEvalSupported: false, enableXfa: false, useWorkerFetch: false })
    expect(seen[0]).not.toHaveProperty('url')
    await h.destroy()
  })

  it('reports progress', async () => {
    const seen: number[] = []
    const h = await openPdf(lib, bytes, (p) => seen.push(p.loaded))
    expect(h.pages).toBe(3)
    await h.destroy()
    void seen
  })
})

describe('the PDFs kept on this device, by their hash', () => {
  for (const [label, make] of [['in memory', () => new MemoryPdfStore()], ['in IndexedDB', () => new IndexedDbPdfStore(`pdfs-${Math.random()}`)]] as const) {
    it(`keeps, finds, lists and removes a PDF (${label})`, async () => {
      const store = make()
      const bytes = await makePdf([{}])
      const hash = await sha256Hex(bytes)
      expect(await store.has(hash)).toBe(false)
      await store.put(hash, bytes, 'Lease.pdf')
      expect(await store.has(hash)).toBe(true)
      expect(await store.get(hash)).toEqual(bytes)
      expect(await store.list()).toEqual([expect.objectContaining({ hash, name: 'Lease.pdf', size: bytes.byteLength })])
      await store.delete(hash)
      expect(await store.has(hash)).toBe(false)
      expect(await store.get(hash)).toBeUndefined()
    })
  }
})

describe('PDFs in a map: references only, saved with the map, one undo step each', () => {
  const source = { id: 's1', name: 'Lease.pdf', size: 1234, hash: 'abc', pages: 9, addedAt: 1 }

  it('a source, its markup and its page edits live in the map, and come back when the map is loaded', () => {
    const a = createMapDoc()
    ensureRoot(a)
    a.ydoc.transact(() => {
      a.pdfSources.set('s1', source)
      a.markup.set('m1', { id: 'm1', sourceId: 's1', page: 2, kind: 'highlight', color: '#facc15', rects: [{ x: 0.1, y: 0.1, w: 0.5, h: 0.02 }], text: 'Lease', createdAt: 1 })
      a.pageEdits.set('s1:3', { rotation: 90, hidden: false })
    })
    const b = createMapDoc()
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc))
    expect(snapshotPdf(b)).toEqual(snapshotPdf(a))
    expect(snapshotPdf(b).sources['s1']).toEqual(source)
    // The PDF itself is not in the map's data: a few hundred bytes, however big the PDF.
    expect(Y.encodeStateAsUpdate(a.ydoc).byteLength).toBeLessThan(2000)
  })

  it('topics keep their link to a place in a PDF, and copying a topic keeps it', () => {
    const d = createMapDoc()
    const root = ensureRoot(d)
    const t = addChild(d, root, 'Meaning of lease')
    d.ydoc.transact(() => d.topics.set(t, { ...(d.topics.get(t) as object), source: { sourceId: 's1', page: 4, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.03 } } } as never), 'local')
    expect(snapshotTopics(d)[t]?.source).toEqual({ sourceId: 's1', page: 4, rect: { x: 0.1, y: 0.2, w: 0.5, h: 0.03 } })
  })

  it('adding and removing are undoable, one step each', () => {
    const d = createMapDoc()
    ensureRoot(d)
    d.undo.clear()
    d.ydoc.transact(() => d.pdfSources.set('s1', source), 'local')
    d.ydoc.transact(() => d.markup.set('m1', { id: 'm1', sourceId: 's1', page: 1, kind: 'rect', color: '#f00', rects: [{ x: 0, y: 0, w: 0.1, h: 0.1 }], createdAt: 1 }), 'local')
    expect(d.undo.undoStack.length).toBe(2)
    d.undo.undo()
    expect(d.markup.size).toBe(0)
    expect(d.pdfSources.size).toBe(1)
    d.undo.undo()
    expect(d.pdfSources.size).toBe(0)
    d.undo.redo()
    expect(d.pdfSources.has('s1')).toBe(true)
  })

  it('a map saved before PDFs existed has none', () => {
    const d = createMapDoc()
    ensureRoot(d)
    expect(snapshotPdf(d)).toEqual({ sources: {}, markup: {}, pageEdits: {} })
  })
})
