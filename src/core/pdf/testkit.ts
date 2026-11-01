import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRef, PDFString, StandardFonts, degrees, rgb } from 'pdf-lib'

export interface TestPage {
  /** Lines of text, drawn from the top down. */
  lines?: { text: string; size?: number }[]
  /** The page's own rotation. */
  rotate?: 0 | 90 | 180 | 270
  size?: [number, number]
}

export interface TestBookmark {
  title: string
  /** 1-based. */
  page: number
  children?: TestBookmark[]
}

/** Makes a small PDF for tests: pages with lines of text, optional rotation, optional bookmarks. */
export async function makePdf(pages: readonly TestPage[], opts: { bookmarks?: TestBookmark[] } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  pages.forEach((p, n) => {
    const [w, h] = p.size ?? [400, 300]
    const page = doc.addPage([w, h])
    let y = h - 40
    for (const l of p.lines ?? [{ text: `Page ${n + 1}` }]) {
      const size = l.size ?? 12
      page.drawText(l.text, { x: 40, y, size, font, color: rgb(0, 0, 0) })
      y -= size * 1.6
    }
    if (p.rotate) page.setRotation(degrees(p.rotate))
  })
  if (opts.bookmarks?.length) addBookmarks(doc, opts.bookmarks)
  return doc.save()
}

function addBookmarks(doc: PDFDocument, tree: TestBookmark[]) {
  const ctx = doc.context
  const outline = ctx.nextRef()
  const make = (nodes: TestBookmark[], parent: PDFRef): PDFRef[] => {
    const refs = nodes.map(() => ctx.nextRef())
    nodes.forEach((n, i) => {
      const entries: Record<string, unknown> = {
        Title: PDFString.of(n.title),
        Parent: parent,
        Dest: PDFArray.withContext(ctx),
      }
      const dest = entries.Dest as PDFArray
      dest.push(doc.getPage(Math.max(0, n.page - 1)).ref)
      dest.push(PDFName.of('Fit'))
      if (i > 0) entries.Prev = refs[i - 1]
      if (i < nodes.length - 1) entries.Next = refs[i + 1]
      if (n.children?.length) {
        const kids = make(n.children, refs[i] as PDFRef)
        entries.First = kids[0]
        entries.Last = kids[kids.length - 1]
        entries.Count = PDFNumber.of(kids.length)
      }
      ctx.assign(refs[i] as PDFRef, ctx.obj(entries as never))
    })
    return refs
  }
  const top = make(tree, outline)
  ctx.assign(outline, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: PDFNumber.of(top.length) } as never))
  doc.catalog.set(PDFName.of('Outlines'), outline)
}
