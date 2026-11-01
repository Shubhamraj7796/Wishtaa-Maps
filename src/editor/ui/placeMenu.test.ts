import { describe, expect, it } from 'vitest'
import { placeMenu, type MenuPlacement } from './placeMenu'

const view = { width: 1000, height: 700 }
const size = { width: 256, height: 480 }
const btn = (left: number, top: number) => ({ left, top, width: 60, height: 40 })
const inside = (p: MenuPlacement, w = size.width) => {
  expect(p.left).toBeGreaterThanOrEqual(8)
  expect(p.left + w).toBeLessThanOrEqual(view.width - 8 + 0.001)
  expect(p.top).toBeGreaterThanOrEqual(8)
  expect(p.top + p.maxHeight).toBeLessThanOrEqual(view.height - 8 + 0.001)
}

describe('placeMenu keeps the dropdown inside the window', () => {
  it('opens below the button, left edges together, when it fits', () => {
    const p = placeMenu(btn(100, 50), size, view)
    expect(p).toMatchObject({ left: 100, top: 94, maxHeight: 480, above: false })
    inside(p)
  })

  it('shifts left at the right edge', () => {
    const p = placeMenu(btn(960, 50), size, view)
    expect(p.left).toBe(1000 - 8 - 256)
    inside(p)
  })

  it('stays off the left edge', () => {
    const p = placeMenu(btn(-30, 50), size, view)
    expect(p.left).toBe(8)
    inside(p)
  })

  it('flips above the button at the bottom edge', () => {
    const p = placeMenu(btn(100, 640), size, view)
    expect(p.above).toBe(true)
    expect(p.top + p.maxHeight).toBeLessThan(640)
    inside(p)
  })

  it('takes the roomier side and scrolls inside when it fits on neither (a short window)', () => {
    const short = { width: 1000, height: 300 }
    const p = placeMenu(btn(100, 20), size, short)
    expect(p.above).toBe(false)
    expect(p.maxHeight).toBeLessThan(size.height)
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(short.height - 8)
    const q = placeMenu(btn(100, 250), size, short)
    expect(q.above).toBe(true)
    expect(q.top).toBeGreaterThanOrEqual(8)
    expect(q.top + q.maxHeight).toBeLessThanOrEqual(250)
  })

  it('never clips at the top edge either: a button under the top of the window opens down', () => {
    const p = placeMenu(btn(100, 0), size, view)
    expect(p.top).toBe(44)
    inside(p)
  })

  it('narrows to a window narrower than the menu', () => {
    const p = placeMenu(btn(5, 5), size, { width: 200, height: 700 })
    expect(p.left).toBe(8)
  })

  it('works in each corner', () => {
    for (const [x, y] of [[0, 0], [940, 0], [0, 660], [940, 660]] as const) inside(placeMenu(btn(x, y), size, view))
  })
})
