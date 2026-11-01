import { describe, expect, it } from 'vitest'
import { NARROW, PICTURE_MAX_H, PICTURE_MAX_W, ROW_H, offsets, pictureBox, rowAt, rowHeight, scrollToShow, windowFor } from './outlineLayout'

describe('how big a picture is in the outline', () => {
  it('keeps its proportions and is at most 320 px wide on a desktop', () => {
    expect(pictureBox({ width: 1280, height: 720 }, 900, 0)).toEqual({ w: 320, h: 180 })
    expect(pictureBox({ width: 100, height: 100 }, 900, 0)).toEqual({ w: 320, h: 320 })
  })

  it('takes the full width of the row on a phone', () => {
    const phone = pictureBox({ width: 1000, height: 500 }, 390, 0)
    expect(390).toBeLessThan(NARROW)
    expect(phone.w).toBe(390 - 60) // all the room the row has
    expect(phone.h).toBe(165)
  })

  it('a deeper topic has less room, and a very tall picture is limited in height without being stretched', () => {
    expect(pictureBox({ width: 1000, height: 500 }, 390, 3).w).toBeLessThan(pictureBox({ width: 1000, height: 500 }, 390, 0).w)
    const tall = pictureBox({ width: 300, height: 3000 }, 900, 0)
    expect(tall.h).toBe(PICTURE_MAX_H)
    expect(tall.w / tall.h).toBeCloseTo(0.1, 1)
    expect(PICTURE_MAX_W).toBe(320)
  })

  it('an unknown size still gives a sensible box', () => {
    expect(pictureBox({ width: 0, height: 0 }, 900, 0)).toEqual({ w: 320, h: 240 })
  })
})

describe('the rows of the list', () => {
  const heights = [rowHeight(null), rowHeight({ w: 320, h: 180 }), rowHeight(null), rowHeight({ w: 320, h: 180 })]

  it('a text row is one line; a picture row adds the picture and its gap', () => {
    expect(rowHeight(null)).toBe(ROW_H)
    expect(heights[1]).toBe(ROW_H + 180 + 10)
  })

  it('offsets say where each row starts and how tall the list is', () => {
    const o = offsets(heights)
    expect(o[0]).toBe(0)
    expect(o[1]).toBe(30)
    expect(o[4]).toBe(heights.reduce((a, b) => a + b, 0))
  })

  it('finds the row at a height, at the edges and past the end', () => {
    const o = offsets(heights)
    expect(rowAt(o, 0)).toBe(0)
    expect(rowAt(o, 29)).toBe(0)
    expect(rowAt(o, 30)).toBe(1)
    expect(rowAt(o, 249)).toBe(1)
    expect(rowAt(o, 250)).toBe(2)
    expect(rowAt(o, 99999)).toBe(3)
    expect(rowAt(offsets([]), 5)).toBe(0)
  })
})

describe('only the rows near the screen are drawn', () => {
  const many = offsets(Array.from({ length: 500 }, (_, i) => (i % 2 ? rowHeight({ w: 320, h: 180 }) : rowHeight(null))))

  it('500 rows with pictures: a screenful plus a margin, not 500', () => {
    const w = windowFor(many, 0, 800)
    expect(w.start).toBe(0)
    expect(w.end - w.start).toBeLessThan(25)
    const mid = windowFor(many, (many[250] as number) + 10, 800)
    expect(mid.start).toBeGreaterThan(240)
    expect(mid.end - mid.start).toBeLessThan(25)
  })

  it('the window always includes everything that is on screen', () => {
    for (const top of [0, 1234, 20_000, 50_000]) {
      const w = windowFor(many, top, 700, 0)
      const first = rowAt(many, top)
      const last = rowAt(many, top + 700 - 1)
      expect(w.start).toBeLessThanOrEqual(first)
      expect(w.end).toBeGreaterThan(last)
    }
  })

  it('an empty list draws nothing', () => {
    expect(windowFor(offsets([]), 0, 800)).toEqual({ start: 0, end: 0 })
  })
})

describe('scrolling a row into view', () => {
  const o = offsets(Array.from({ length: 100 }, () => ROW_H))
  it('does nothing when it is already fully visible', () => {
    expect(scrollToShow(o, 5, 0, 600)).toBeNull()
  })
  it('puts a row that is off screen about a third of the way down', () => {
    const to = scrollToShow(o, 80, 0, 600) as number
    expect(to).toBe(80 * ROW_H - 200)
    expect(scrollToShow(o, 80, to, 600)).toBeNull()
  })
  it('never scrolls above the top', () => {
    expect(scrollToShow(o, 1, 900, 600)).toBe(0)
  })
  it('a row taller than the screen shows its start', () => {
    const tall = offsets([ROW_H, 2000, ROW_H])
    expect(scrollToShow(tall, 1, 0, 600)).toBe(ROW_H - 8)
  })
})
