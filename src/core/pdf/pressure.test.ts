import { PDFArray, PDFDocument, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { exportMarkedPdf } from './export'
import { pressureOf, roundPressure, segmentWidths, variesPressure, widthFactor } from './pressure'
import { makePdf } from './testkit'
import type { MarkupObject, PageEdit, Point } from './types'

describe('stylus pressure', () => {
  it('half pressure is the width chosen; harder is thicker, lighter is thinner', () => {
    expect(widthFactor(0.5)).toBeCloseTo(1, 10)
    expect(widthFactor(1)).toBeGreaterThan(widthFactor(0.5))
    expect(widthFactor(0)).toBeGreaterThan(0) // never invisible
    expect(widthFactor(-3)).toBe(widthFactor(0))
    expect(widthFactor(9)).toBe(widthFactor(1))
  })

  it('one width per segment: the average of its two ends', () => {
    expect(segmentWidths(10, [0.5, 0.5, 0.5])).toEqual([10, 10])
    const w = segmentWidths(10, [0, 1, 1])
    expect(w).toHaveLength(2)
    expect(w[1]).toBeGreaterThan(w[0] as number)
  })

  it('uses the pressure only when there is exactly one per point', () => {
    const pts: Point[] = [[0, 0], [0.1, 0.1], [0.2, 0.1]]
    expect(pressureOf(pts, [0.2, 0.5, 0.9])).toEqual([0.2, 0.5, 0.9])
    expect(pressureOf(pts, [0.2, 0.5])).toBeNull()
    expect(pressureOf(pts, undefined)).toBeNull()
    expect(pressureOf(pts, [0.2, Number.NaN, 0.9])).toBeNull()
    expect(pressureOf([[0, 0]], [0.5])).toBeNull()
  })

  it('a steady reading is not pressure sensing; a changing one is', () => {
    expect(variesPressure([0.5, 0.5, 0.5, 0.5])).toBe(false) // a mouse, or a pen that cannot sense it
    expect(variesPressure([1, 1, 1])).toBe(false)
    expect(variesPressure([0.2, 0.4, 0.8, 0.6])).toBe(true)
  })

  it('is kept to two decimals and inside 0 to 1', () => {
    expect(roundPressure([0.123456, 1.7, -0.2])).toEqual([0.12, 1, 0])
  })
})

describe('the marked-up PDF keeps the pressure', () => {
  async function content(bytes: Uint8Array): Promise<string> {
    const doc = await PDFDocument.load(bytes)
    const contents = doc.getPage(0).node.Contents()
    const streams: PDFStream[] = []
    if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i++) streams.push(doc.context.lookup(contents.get(i)) as PDFStream)
    else if (contents) streams.push(contents)
    return streams.map((s) => Buffer.from(decodePDFRawStream(s as PDFRawStream).decode()).toString('latin1')).join('\n')
  }
  const pen = (pressure?: number[]): MarkupObject => ({
    id: 'p', sourceId: 's', page: 1, kind: 'pen', color: '#ef4444', width: 0.01, createdAt: 1,
    points: [[0.1, 0.1], [0.2, 0.15], [0.3, 0.12], [0.4, 0.2]],
    ...(pressure ? { pressure } : {}),
  })
  const widths = (text: string) => [...text.matchAll(/([\d.]+) w\n/g)].map((m) => Number(m[1]))
  const none: Record<string, PageEdit> = {}

  it('a stroke with pressure is drawn in segments of different thickness; without it, all the same', async () => {
    const original = await makePdf([{ lines: [{ text: 'page' }] }])
    const plain = widths(await content(await exportMarkedPdf(original, { sourceId: 's', markup: [pen()], pageEdits: none })))
    expect(new Set(plain).size).toBe(1)
    const pressed = widths(await content(await exportMarkedPdf(original, { sourceId: 's', markup: [pen([0.2, 0.9, 0.5, 0.1])], pageEdits: none })))
    expect(pressed.length).toBeGreaterThanOrEqual(3)
    expect(new Set(pressed).size).toBeGreaterThan(1)
  })

  it('a damaged pressure list does not break the download', async () => {
    const original = await makePdf([{ lines: [{ text: 'page' }] }])
    const out = await exportMarkedPdf(original, { sourceId: 's', markup: [pen([0.5])], pageEdits: none })
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1)
  })
})
