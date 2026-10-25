import { describe, expect, it } from 'vitest'
import { MAX_WIDTH, MIN_SIZE, defaultDisplaySize, liveOffset, nudgeSize, originalSize, resizeImage } from './resize'

const base = { width: 200, height: 100, dx: 0, dy: 0, corner: 'se' as const, lockAspect: true }

describe('resizeImage (aspect locked)', () => {
  it('keeps the aspect ratio when dragging the bottom-right corner', () => {
    const r = resizeImage({ ...base, dx: 100, dy: 0 })
    expect(r).toEqual({ width: 300, height: 150 })
    expect(r.width / r.height).toBeCloseTo(2)
  })

  it('follows whichever axis moved furthest', () => {
    const r = resizeImage({ ...base, dx: 10, dy: 100 }) // height doubles
    expect(r).toEqual({ width: 400, height: 200 })
  })

  it('grows when dragging any corner away from the image', () => {
    expect(resizeImage({ ...base, corner: 'nw', dx: -50, dy: -25 }).width).toBe(250)
    expect(resizeImage({ ...base, corner: 'ne', dx: 50, dy: -25 }).width).toBe(250)
    expect(resizeImage({ ...base, corner: 'sw', dx: -50, dy: 25 }).width).toBe(250)
  })

  it('shrinks when dragging inwards', () => {
    expect(resizeImage({ ...base, corner: 'se', dx: -100, dy: -50 })).toEqual({ width: 100, height: 50 })
  })

  it('never goes below the minimum on either side', () => {
    const r = resizeImage({ ...base, dx: -10000, dy: -10000 })
    expect(r.height).toBeGreaterThanOrEqual(MIN_SIZE)
    expect(r.width).toBeGreaterThanOrEqual(MIN_SIZE)
    expect(r).toEqual({ width: 80, height: 40 }) // ratio kept: limited by the short side
  })

  it('never goes above the maximum width', () => {
    const r = resizeImage({ ...base, dx: 100000, dy: 100000 })
    expect(r.width).toBe(MAX_WIDTH)
    expect(r.height).toBe(600)
  })
})

describe('resizeImage (free, Shift held)', () => {
  it('changes width and height independently', () => {
    expect(resizeImage({ ...base, lockAspect: false, dx: 100, dy: -20 })).toEqual({ width: 300, height: 80 })
  })

  it('clamps each side', () => {
    const r = resizeImage({ ...base, lockAspect: false, dx: -9999, dy: -9999 })
    expect(r).toEqual({ width: MIN_SIZE, height: MIN_SIZE })
    expect(resizeImage({ ...base, lockAspect: false, dx: 99999, dy: 0 }).width).toBe(MAX_WIDTH)
  })
})

describe('other size helpers', () => {
  it('nudges width by a step, keeping the ratio', () => {
    expect(nudgeSize(200, 100, 10)).toEqual({ width: 210, height: 105 })
    expect(nudgeSize(200, 100, -10)).toEqual({ width: 190, height: 95 })
  })

  it('caps the first display size and original size', () => {
    expect(defaultDisplaySize(1600, 800)).toEqual({ width: 280, height: 140 })
    expect(defaultDisplaySize(100, 50)).toEqual({ width: 100, height: 50 })
    expect(originalSize(1600, 800)).toEqual({ width: 1200, height: 600 })
    expect(originalSize(500, 250)).toEqual({ width: 500, height: 250 })
  })

  it('keeps the opposite corner fixed in the live frame', () => {
    const o = { width: 100, height: 80 }
    const l = { width: 150, height: 120 }
    expect(liveOffset('se', o, l)).toEqual({ left: 0, top: 0 })
    expect(liveOffset('nw', o, l)).toEqual({ left: -50, top: -40 })
    expect(liveOffset('ne', o, l)).toEqual({ left: 0, top: -40 })
    expect(liveOffset('sw', o, l)).toEqual({ left: -50, top: 0 })
  })
})
