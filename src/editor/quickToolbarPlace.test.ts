import { describe, expect, it } from 'vitest'
import { placeToolbar, unionRect } from './quickToolbarPlace'

const area = { w: 1000, h: 700 }
const bar = { w: 400, h: 44 }

describe('where the quick toolbar goes', () => {
  it('sits centred above the selected topic', () => {
    const p = placeToolbar({ x: 400, y: 300, w: 200, h: 60 }, bar, area)
    expect(p.below).toBe(false)
    expect(p.left).toBe(500 - 200)
    expect(p.top).toBeLessThan(300 - bar.h)
  })

  it('flips below when there is no room above, and does not cover the topic', () => {
    const target = { x: 400, y: 20, w: 200, h: 60 }
    const p = placeToolbar(target, bar, area)
    expect(p.below).toBe(true)
    expect(p.top).toBeGreaterThanOrEqual(target.y + target.h)
  })

  it('stays inside the area on the left and right', () => {
    expect(placeToolbar({ x: 0, y: 300, w: 40, h: 40 }, bar, area).left).toBeGreaterThanOrEqual(8)
    const right = placeToolbar({ x: 980, y: 300, w: 40, h: 40 }, bar, area)
    expect(right.left + bar.w).toBeLessThanOrEqual(area.w - 8)
  })

  it('stays inside a narrow phone-width area', () => {
    const p = placeToolbar({ x: 150, y: 300, w: 80, h: 30 }, { w: 300, h: 44 }, { w: 360, h: 640 })
    expect(p.left).toBeGreaterThanOrEqual(8)
    expect(p.left + 300).toBeLessThanOrEqual(360)
  })

  it('goes to the top edge for a selection that fills the area, rather than off screen', () => {
    const p = placeToolbar({ x: 0, y: 0, w: 1000, h: 700 }, bar, area)
    expect(p.top).toBe(8)
    expect(p.below).toBe(false)
  })

  it('unions several topics into one rectangle', () => {
    expect(unionRect([])).toBeNull()
    expect(unionRect([{ x: 10, y: 10, w: 20, h: 20 }, { x: 100, y: 50, w: 30, h: 10 }])).toEqual({ x: 10, y: 10, w: 120, h: 50 })
  })
})
