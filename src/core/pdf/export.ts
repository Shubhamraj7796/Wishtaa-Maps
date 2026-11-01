import { BlendMode, PDFDocument, PDFName, PDFString, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { readSize, rectToPdf, toPdf, turn } from './geometry'
import { editKey, NO_EDIT, type MarkupObject, type PageEdit, type Point, type Rect, type Turn } from './types'

/**
 * A copy of a PDF with the markup drawn on it. Nothing in the original is touched: the file is read, a NEW document is written, and
 * hidden pages are left out of the copy (never out of the original). Positions are turned from "page as read" fractions into PDF
 * coordinates with the page's own rotation, so markup lands in the same place however the page is stored.
 */
export interface ExportOptions {
  markup: readonly MarkupObject[]
  pageEdits: Record<string, PageEdit>
  sourceId: string
}

const hex = (c: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c)
  return m ? rgb(parseInt(m[1] as string, 16) / 255, parseInt(m[2] as string, 16) / 255, parseInt(m[3] as string, 16) / 255) : rgb(0, 0, 0)
}

/** Text a standard font can write (anything else becomes "?"), then broken into lines that fit `width` points. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const set = new Set(font.getCharacterSet())
  const clean = Array.from(text.replace(/\t/g, ' ')).map((ch) => (ch === '\n' || set.has(ch.codePointAt(0) as number) ? ch : '?')).join('')
  const out: string[] = []
  for (const para of clean.split('\n')) {
    let line = ''
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word
      if (!line || font.widthOfTextAtSize(next, size) <= width) line = next
      else {
        out.push(line)
        line = word
      }
    }
    out.push(line)
  }
  return out
}

interface Geo {
  x0: number
  y0: number
  w: number
  h: number
  own: Turn
  /** The page as read, in points (width, height). */
  read: { w: number; h: number }
}

function geoOf(page: PDFPage): Geo {
  const box = page.getCropBox()
  const own = turn(page.getRotation().angle)
  return { x0: box.x, y0: box.y, w: box.width, h: box.height, own, read: readSize(box.width, box.height, own) }
}

export async function exportMarkedPdf(original: Uint8Array, opts: ExportOptions): Promise<Uint8Array> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(original, { updateMetadata: false })
  } catch (e) {
    if (e instanceof Error && /encrypt/i.test(`${e.name} ${e.message}`)) throw new Error('A password protected PDF cannot be downloaded with markup. Your markup stays in the map.')
    throw e
  }
  const pages = doc.getPages()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const byPage = new Map<number, MarkupObject[]>()
  for (const m of [...opts.markup].filter((x) => x.sourceId === opts.sourceId).sort((a, b) => a.createdAt - b.createdAt)) {
    const l = byPage.get(m.page) ?? []
    l.push(m)
    byPage.set(m.page, l)
  }
  const hidden = new Set<number>()
  pages.forEach((_, i) => {
    if ((opts.pageEdits[editKey(opts.sourceId, i + 1)] ?? NO_EDIT).hidden) hidden.add(i)
  })

  pages.forEach((page, i) => {
    const g = geoOf(page)
    const at = (p: Point) => {
      const q = toPdf(p, g.w, g.h, g.own)
      return { x: g.x0 + q[0], y: g.y0 + q[1] }
    }
    for (const m of byPage.get(i + 1) ?? []) {
      const color = hex(m.color)
      const lineW = Math.max(0.5, (m.width ?? 0.004) * g.read.w)
      const box = (r: Rect) => {
        const b = rectToPdf(r, g.w, g.h, g.own)
        return { x: g.x0 + b.x, y: g.y0 + b.y, width: b.width, height: b.height }
      }
      switch (m.kind) {
        case 'highlight':
          for (const r of m.rects ?? []) page.drawRectangle({ ...box(r), color, opacity: 0.4, blendMode: BlendMode.Multiply })
          break
        case 'underline':
        case 'strike':
          for (const r of m.rects ?? []) {
            const yy = r.y + r.h * (m.kind === 'underline' ? 0.92 : 0.55)
            page.drawLine({ start: at([r.x, yy]), end: at([r.x + r.w, yy]), thickness: Math.max(0.6, r.h * g.read.h * 0.08), color })
          }
          break
        case 'pen': {
          const pts = m.points ?? []
          for (let k = 1; k < pts.length; k++) page.drawLine({ start: at(pts[k - 1] as Point), end: at(pts[k] as Point), thickness: lineW, color, lineCap: 1 })
          break
        }
        case 'rect': {
          const r = m.rects?.[0]
          if (r) page.drawRectangle({ ...box(r), borderColor: color, borderWidth: lineW })
          break
        }
        case 'ellipse': {
          const r = m.rects?.[0]
          if (r) {
            const b = box(r)
            page.drawEllipse({ x: b.x + b.width / 2, y: b.y + b.height / 2, xScale: b.width / 2, yScale: b.height / 2, borderColor: color, borderWidth: lineW })
          }
          break
        }
        case 'line':
        case 'arrow': {
          const [a, b] = m.points ?? []
          if (!a || !b) break
          const s = at(a)
          const e = at(b)
          page.drawLine({ start: s, end: e, thickness: lineW, color, lineCap: 1 })
          if (m.kind === 'arrow') {
            const ang = Math.atan2(e.y - s.y, e.x - s.x)
            const size = Math.max(6, lineW * 4)
            for (const k of [0.45, -0.45]) page.drawLine({ start: e, end: { x: e.x - size * Math.cos(ang + k), y: e.y - size * Math.sin(ang + k) }, thickness: lineW, color, lineCap: 1 })
          }
          break
        }
        case 'whiteout': {
          const r = m.rects?.[0]
          if (r) page.drawRectangle({ ...box(r), color: rgb(1, 1, 1), opacity: 1 })
          break
        }
        case 'text': {
          const r = m.rects?.[0]
          if (!r || !m.text) break
          const size = Math.max(4, (m.fontSize ?? 0.02) * g.read.h)
          const lines = wrap(m.text, font, size, r.w * g.read.w)
          const lead = 1.2 * size
          const room = Math.max(1, Math.floor((r.h * g.read.h) / lead))
          lines.slice(0, Math.max(room, 1)).forEach((line, k) => {
            if (!line) return
            // The baseline of line k, found on the page as read so it follows the page's own rotation.
            const base = at([r.x, r.y + (size * 0.95 + k * lead) / g.read.h])
            page.drawText(line, { x: base.x, y: base.y, size, font, color, rotate: degrees(g.own) })
          })
          break
        }
        case 'link': {
          const r = m.rects?.[0]
          if (!r || !m.link) break
          const b = box(r)
          const target = 'page' in m.link ? (hidden.has(m.link.page - 1) ? null : pages[m.link.page - 1]) : null
          if ('page' in m.link && !target) break
          const action = 'url' in m.link ? doc.context.obj({ Type: 'Action', S: 'URI', URI: PDFString.of(m.link.url) }) : undefined
          const annot = doc.context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [b.x, b.y, b.x + b.width, b.y + b.height],
            Border: [0, 0, 0],
            ...(action ? { A: action } : { Dest: [(target as PDFPage).ref, PDFName.of('Fit')] }),
          })
          page.node.addAnnot(doc.context.register(annot))
          page.drawRectangle({ ...b, borderColor: rgb(0.15, 0.39, 0.92), borderWidth: 0.5, borderDashArray: [3, 2] })
          break
        }
      }
    }
  })

  // Turned pages: the person's turn is added to the page's own, so it opens the way it was being read.
  pages.forEach((page, i) => {
    const user = (opts.pageEdits[editKey(opts.sourceId, i + 1)] ?? NO_EDIT).rotation
    if (user) page.setRotation(degrees((page.getRotation().angle + user) % 360))
  })
  // Hidden pages are left out of the copy (from the end, so the numbers stay right).
  for (const i of [...hidden].sort((a, b) => b - a)) doc.removePage(i)
  if (doc.getPageCount() === 0) throw new Error('Every page is hidden, so there is nothing to download. Show a page first.')
  return doc.save()
}

/** A file name for the copy: "Name (marked up).pdf". */
export function markedName(name: string): string {
  const base = name.replace(/\.pdf$/i, '').trim() || 'Document'
  return `${base} (marked up).pdf`
}
