// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { clampSide, loadSheetHeight, loadSideWidth, MIN_MAIN, MIN_SIDE, nextSize, rememberSize, saveSheetHeight, saveSideWidth, startingSize } from './layout'
import { DEFAULT_STYLES, defaultPlace, loadPrefs, sanitizeStyle, savePrefs, sizeRange, snapToolbar, strokeWidth } from './toolPrefs'

beforeEach(() => installMemoryLocalStorage())

describe('panel size', () => {
  it('cycles Normal, Wide, Full, and back', () => {
    expect(nextSize('normal')).toBe('wide')
    expect(nextSize('wide')).toBe('full')
    expect(nextSize('full')).toBe('normal')
  })

  it('keeps the side width inside what the window allows', () => {
    expect(clampSide(100, 1200)).toBe(MIN_SIDE)
    expect(clampSide(460, 1200)).toBe(460)
    expect(clampSide(5000, 1200)).toBe(1200 - MIN_MAIN)
    expect(clampSide(5000, 400)).toBe(MIN_SIDE)
  })

  it('remembers the width and the sheet height on this device', () => {
    expect(loadSideWidth()).toBe(460)
    saveSideWidth(612.4)
    saveSheetHeight(300)
    expect(loadSideWidth()).toBe(612)
    expect(loadSheetHeight()).toBe(300)
  })

  it('starts full screen on a portrait touch screen, otherwise in the size last used, never full', () => {
    expect(startingSize(true, true)).toBe('full')
    expect(startingSize(true, false)).toBe('normal')
    expect(startingSize(false, true)).toBe('normal')
    rememberSize('wide')
    expect(startingSize(false, false)).toBe('wide')
    rememberSize('full') // not remembered: a PDF never opens full screen on a computer by itself
    expect(startingSize(false, false)).toBe('wide')
  })
})

describe('tool preferences', () => {
  it('gives every tool a starting colour (pen red, highlight yellow) and survives bad stored data', () => {
    const p = loadPrefs()
    expect(p.styles.pen.color).toBe('#ef4444')
    expect(p.styles.highlight.color).toBe('#facc15')
    localStorage.setItem('wishtaamaps:pdf-tools', '{"styles":{"pen":{"color":"javascript:1","size":999},"highlight":{"opacity":9}},"bar":{"side":"up"}}')
    const q = loadPrefs()
    expect(q.styles.pen).toEqual({ ...DEFAULT_STYLES.pen, size: 12 })
    expect(q.styles.highlight.opacity).toBe(0.85)
    expect(q.bar).toBeNull()
    localStorage.setItem('wishtaamaps:pdf-tools', 'not json')
    expect(loadPrefs().styles.pen.color).toBe('#ef4444')
  })

  it('keeps each tool’s colour and size apart, and round-trips them', () => {
    const p = loadPrefs()
    savePrefs({ ...p, styles: { ...p.styles, pen: sanitizeStyle('pen', { color: '#2563eb', size: 9 }), highlight: sanitizeStyle('highlight', { color: '#4ade80', opacity: 0.6 }) }, shape: 'arrow', bar: { side: 'right', y: 0.4, collapsed: true, fade: true } })
    const q = loadPrefs()
    expect(q.styles.pen).toMatchObject({ color: '#2563eb', size: 9 })
    expect(q.styles.highlight).toMatchObject({ color: '#4ade80', opacity: 0.6 })
    expect(q.styles.underline.color).toBe(DEFAULT_STYLES.underline.color)
    expect(q.shape).toBe('arrow')
    expect(q.bar).toEqual({ side: 'right', y: 0.4, collapsed: true, fade: true })
  })

  it('sizes: highlight has none, strokes 1 to 12, text 8 to 60; stroke width is a fraction of the page', () => {
    expect(sizeRange('highlight')).toBeNull()
    expect(sizeRange('pen')).toMatchObject({ min: 1, max: 12 })
    expect(sizeRange('text')).toMatchObject({ min: 8, max: 60 })
    expect(strokeWidth(4)).toBe(0.004)
  })

  it('starts the toolbar on the left on a computer and at the bottom right on a touch screen', () => {
    expect(defaultPlace(false)).toMatchObject({ side: 'left' })
    expect(defaultPlace(true)).toMatchObject({ side: 'right' })
    expect(defaultPlace(true).y).toBeGreaterThan(0.6)
  })
})

describe('snapping the toolbar to an edge', () => {
  const area = { width: 800, height: 600 }
  const bar = { height: 300 }
  it('snaps to the nearer side', () => {
    expect(snapToolbar(100, 50, area, bar).side).toBe('left')
    expect(snapToolbar(399, 50, area, bar).side).toBe('left')
    expect(snapToolbar(401, 50, area, bar).side).toBe('right')
    expect(snapToolbar(780, 50, area, bar).side).toBe('right')
  })
  it('keeps its height as a fraction of the room, clamped to the area', () => {
    expect(snapToolbar(100, 150, area, bar).y).toBe(0.5)
    expect(snapToolbar(100, -40, area, bar).y).toBe(0)
    expect(snapToolbar(100, 900, area, bar).y).toBe(1)
    expect(snapToolbar(100, 10, area, { height: 700 }).y).toBe(1) // taller than the area: no room, so it takes the bottom
  })
})
