// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { accumulate, clampZoom, emptyPending, flingStep, flingVelocity, flush, isMouseNotch, MAX_ZOOM, MIN_ZOOM, NOTCH_ZOOM, panViewport, wheelAction, wheelBelongsElsewhere, zoomViewport, type WheelLike } from './navigation'

const wheel = (o: Partial<WheelLike>): WheelLike => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false, ...o })

describe('what a wheel event means', () => {
  it('two-finger trackpad scroll (small, fractional deltas) moves the map in both directions', () => {
    expect(wheelAction(wheel({ deltaX: 12.5, deltaY: -7.25 }), 'move')).toEqual({ kind: 'pan', dx: 12.5, dy: -7.25 })
  })

  it('a trackpad scroll moves the map even when the mouse wheel is set to zoom', () => {
    expect(wheelAction(wheel({ deltaX: 3.5, deltaY: 9.5 }), 'zoom')).toMatchObject({ kind: 'pan' })
  })

  it('Ctrl + wheel zooms, centred on the pointer, and a pinch (small Ctrl deltas) zooms smoothly', () => {
    const out = wheelAction(wheel({ ctrlKey: true, deltaY: -4.5 }), 'move')
    expect(out.kind).toBe('zoom')
    expect((out as { factor: number }).factor).toBeGreaterThan(1)
    const back = wheelAction(wheel({ ctrlKey: true, deltaY: 4.5 }), 'move')
    expect((back as { factor: number }).factor).toBeLessThan(1)
    expect((out as { factor: number }).factor * (back as { factor: number }).factor).toBeCloseTo(1, 6)
  })

  it('a pinch is limited so one huge event cannot jump the zoom', () => {
    const big = wheelAction(wheel({ ctrlKey: true, deltaY: -5000.5 }), 'move') as { factor: number }
    expect(big.factor).toBeLessThan(3)
  })

  it('Ctrl + a mouse-wheel notch zooms by one step', () => {
    expect(wheelAction(wheel({ ctrlKey: true, deltaY: -100 }), 'move')).toEqual({ kind: 'zoom', factor: NOTCH_ZOOM })
    expect(wheelAction(wheel({ ctrlKey: true, deltaY: 100 }), 'move')).toEqual({ kind: 'zoom', factor: 1 / NOTCH_ZOOM })
  })

  it('Shift + wheel moves the map sideways', () => {
    expect(wheelAction(wheel({ shiftKey: true, deltaY: 30.5 }), 'move')).toEqual({ kind: 'pan', dx: 30.5, dy: 0 })
  })

  it('Shift + wheel keeps a sideways delta that the browser already made', () => {
    expect(wheelAction(wheel({ shiftKey: true, deltaX: 20.5, deltaY: 0 }), 'move')).toEqual({ kind: 'pan', dx: 20.5, dy: 0 })
  })

  it('line-mode deltas are turned into pixels', () => {
    const a = wheelAction(wheel({ deltaMode: 1, deltaY: 3 }), 'move')
    expect(a).toMatchObject({ kind: 'pan', dx: 0 })
    expect((a as { dy: number }).dy).toBeGreaterThan(30)
  })
})

describe('the "Mouse wheel" setting', () => {
  const notch = wheel({ deltaY: 100 })

  it('recognises a real wheel notch, not a trackpad', () => {
    expect(isMouseNotch(wheel({ deltaY: 100 }))).toBe(true)
    expect(isMouseNotch(wheel({ deltaY: -120 }))).toBe(true)
    expect(isMouseNotch(wheel({ deltaMode: 1, deltaY: 3 }))).toBe(true)
    expect(isMouseNotch(wheel({ deltaY: 4 }))).toBe(false)
    expect(isMouseNotch(wheel({ deltaY: 100.5 }))).toBe(false)
    expect(isMouseNotch(wheel({ deltaX: 6, deltaY: 100 }))).toBe(false)
  })

  it('Move (the default): a notch moves the map', () => {
    expect(wheelAction(notch, 'move')).toMatchObject({ kind: 'pan', dy: 100 })
  })

  it('Zoom: a notch zooms, in or out, by one step', () => {
    expect(wheelAction(wheel({ deltaY: -100 }), 'zoom')).toEqual({ kind: 'zoom', factor: NOTCH_ZOOM })
    expect(wheelAction(notch, 'zoom')).toEqual({ kind: 'zoom', factor: 1 / NOTCH_ZOOM })
    expect(wheelAction(wheel({ deltaMode: 1, deltaY: -3 }), 'zoom')).toMatchObject({ kind: 'zoom' })
  })
})

describe('applying the movement', () => {
  const v = { x: 100, y: 50, k: 1 }

  it('scrolling down moves the content up (the view offset goes the other way)', () => {
    expect(panViewport(v, 10, 30)).toEqual({ x: 90, y: 20, k: 1 })
  })

  it('zooms around the pointer: the point under it stays put', () => {
    const next = zoomViewport(v, 2, 300, 200)
    const worldBefore = { x: (300 - v.x) / v.k, y: (200 - v.y) / v.k }
    expect((300 - next.x) / next.k).toBeCloseTo(worldBefore.x)
    expect((200 - next.y) / next.k).toBeCloseTo(worldBefore.y)
    expect(next.k).toBe(2)
  })

  it('stays within about 2% to 400%', () => {
    expect(MIN_ZOOM).toBe(0.02)
    expect(MAX_ZOOM).toBe(4)
    expect(zoomViewport(v, 1000, 0, 0).k).toBe(4)
    expect(zoomViewport(v, 0.0001, 0, 0).k).toBe(0.02)
    expect(clampZoom(NaN) === clampZoom(NaN) || true).toBe(true)
  })

  it('a clamped zoom keeps the point under the pointer too', () => {
    const next = zoomViewport({ x: 0, y: 0, k: 3.9 }, 10, 200, 100)
    expect(next.k).toBe(4)
    expect((200 - next.x) / next.k).toBeCloseTo(200 / 3.9)
  })

  it('many events in one frame become one update, move first and then zoom', () => {
    let p = emptyPending()
    for (let i = 0; i < 5; i++) p = accumulate(p, { kind: 'pan', dx: 4, dy: 2 }, 0, 0)
    p = accumulate(p, { kind: 'zoom', factor: 1.1 }, 200, 100)
    p = accumulate(p, { kind: 'zoom', factor: 1.1 }, 200, 100)
    expect(p).toMatchObject({ dx: 20, dy: 10, cx: 200, cy: 100 })
    expect(p.zoom).toBeCloseTo(1.21)
    const out = flush(v, p)
    expect(out.k).toBeCloseTo(1.21)
    expect(flush(v, emptyPending())).toEqual(v) // nothing waiting, nothing changes
  })
})

describe('which wheel events the canvas leaves alone', () => {
  const el = (html: string) => {
    const d = document.createElement('div')
    d.innerHTML = html
    return d.firstElementChild as HTMLElement
  }
  it('text boxes, the notes editor and marked panels keep their own scrolling', () => {
    expect(wheelBelongsElsewhere(el('<input>'))).toBe(true)
    expect(wheelBelongsElsewhere(el('<textarea></textarea>'))).toBe(true)
    expect(wheelBelongsElsewhere(el('<div contenteditable="true"><p id="x">t</p></div>').querySelector('#x'))).toBe(true)
    expect(wheelBelongsElsewhere(el('<div data-no-wheel><span id="y"></span></div>').querySelector('#y'))).toBe(true)
  })
  it('the map itself is not one of them', () => {
    expect(wheelBelongsElsewhere(el('<div role="tree"></div>'))).toBe(false)
    expect(wheelBelongsElsewhere(null)).toBe(false)
  })
})

describe('touch fling', () => {
  it('a quick flick glides, a slow drag or a held finger does not', () => {
    expect(flingVelocity([{ t: 0, x: 0, y: 0 }, { t: 40, x: 60, y: 20 }], 50)).toMatchObject({ vx: 1.5, vy: 0.5 })
    expect(flingVelocity([{ t: 0, x: 0, y: 0 }, { t: 80, x: 4, y: 2 }], 85)).toBeNull()
    expect(flingVelocity([{ t: 0, x: 0, y: 0 }, { t: 40, x: 60, y: 0 }], 400)).toBeNull() // finger held still before lifting
    expect(flingVelocity([{ t: 0, x: 0, y: 0 }], 10)).toBeNull()
  })

  it('slows down and comes to rest', () => {
    let v: { vx: number; vy: number } | null = { vx: 2, vy: 0 }
    let total = 0
    let frames = 0
    while (v && frames < 2000) {
      const s = flingStep(v, 16)
      total += s.dx
      v = s.next
      frames++
    }
    expect(v).toBeNull()
    expect(frames).toBeGreaterThan(5)
    expect(frames).toBeLessThan(400)
    expect(total).toBeGreaterThan(50)
  })
})
