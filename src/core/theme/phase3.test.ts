import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, resolveTheme } from '../settings'
import { AA_LARGE, AA_NORMAL, contrast, contrastReport, isLargeText, normalizeHex, readableText } from './color'
import { recentColours, rememberColour } from './recent'
import { resolveLine, resolveLook } from './resolve'

describe('contrast report (WCAG AA)', () => {
  it('passes black on white and says nothing to suggest', () => {
    const r = contrastReport('#000000', '#ffffff')
    expect(r.ok).toBe(true)
    expect(r.ratio).toBe(21)
    expect(r.suggestion).toBeNull()
  })

  it('flags light grey on white and offers a colour that really is readable', () => {
    const r = contrastReport('#cccccc', '#ffffff')
    expect(r.ok).toBe(false)
    expect(r.ratio).toBeLessThan(AA_NORMAL)
    expect(r.suggestion).not.toBeNull()
    expect(contrast(r.suggestion as string, '#ffffff')).toBeGreaterThanOrEqual(AA_NORMAL)
  })

  it('asks for 4.5:1 for normal text and only 3:1 for large text', () => {
    // #949494 on white is about 3.0:1: fine for large text, not for normal text.
    const grey = '#8c8c8c'
    const ratio = contrast(grey, '#ffffff')
    expect(ratio).toBeGreaterThan(AA_LARGE)
    expect(ratio).toBeLessThan(AA_NORMAL)
    expect(contrastReport(grey, '#ffffff', false).ok).toBe(false)
    expect(contrastReport(grey, '#ffffff', true).ok).toBe(true)
  })

  it('suggests a readable colour for every background', () => {
    for (const bg of ['#ffffff', '#000000', '#777777', '#0f766e', '#facc15', '#7c3aed']) {
      const s = readableText(bg)
      expect(contrast(s, bg), bg).toBeGreaterThanOrEqual(AA_NORMAL)
    }
  })

  it('knows what is large text', () => {
    expect(isLargeText(24)).toBe(true)
    expect(isLargeText(14)).toBe(false)
    expect(isLargeText(19, 700)).toBe(true)
    expect(isLargeText(19, 400)).toBe(false)
  })
})

describe('typed colours', () => {
  it('accepts #rrggbb, rrggbb and the short forms, in any case', () => {
    expect(normalizeHex('#0F766E')).toBe('#0f766e')
    expect(normalizeHex('0f766e')).toBe('#0f766e')
    expect(normalizeHex('#abc')).toBe('#aabbcc')
    expect(normalizeHex('  F80 ')).toBe('#ff8800')
  })
  it('rejects what is not a colour', () => {
    for (const bad of ['', '#12', '#12345', '#1234567', 'red', '#ggg', 'rgb(1,2,3)']) expect(normalizeHex(bad), bad).toBeNull()
  })
})

describe('recent colours', () => {
  const memory = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
  }

  it('keeps the newest first, no duplicates, at most 8', () => {
    const s = memory()
    for (const c of ['#111111', '#222222', '#333333', '#111111']) rememberColour(c, s)
    expect(recentColours(s)).toEqual(['#111111', '#333333', '#222222'])
    for (let i = 0; i < 12; i++) rememberColour(`#${String(i).padStart(2, '0')}0000`, s)
    expect(recentColours(s)).toHaveLength(8)
  })

  it('ignores things that are not colours', () => {
    const s = memory()
    expect(rememberColour('red', s)).toEqual([])
    expect(recentColours(s)).toEqual([])
  })

  it('survives broken or missing storage', () => {
    expect(recentColours({ getItem: () => 'not json{' })).toEqual([])
    expect(recentColours({ getItem: () => JSON.stringify([1, 'x', '#aabbcc']) })).toEqual(['#aabbcc'])
    expect(recentColours(null)).toEqual([])
    expect(() => rememberColour('#aabbcc', { getItem: () => null, setItem: () => { throw new Error('full') } })).not.toThrow()
  })
})

describe('new text, fill and branch settings', () => {
  const theme = resolveTheme(DEFAULT_SETTINGS)
  const args = { depth: 1, branch: 0, isRoot: false }

  it('a topic with none of them looks as before', () => {
    const look = resolveLook(theme, args)
    expect(look).toMatchObject({ underline: false, strike: false, highlight: null, align: 'center', fillOpacity: 1 })
    expect(resolveLine(theme, args)).toMatchObject({ opacity: 1, arrow: false })
  })

  it('a topic can set them, and null puts one back to inherit', () => {
    const look = resolveLook(theme, { ...args, style: { underline: true, strike: true, highlight: '#ffee00', align: 'left', fillOpacity: 0.4 } })
    expect(look).toMatchObject({ underline: true, strike: true, highlight: '#ffee00', align: 'left', fillOpacity: 0.4 })
    const reset = resolveLook(theme, { ...args, style: { underline: null as unknown as boolean, align: null as unknown as 'left' } })
    expect(reset.underline).toBe(false)
    expect(reset.align).toBe('center')
  })

  it('keeps opacity inside 0 to 1', () => {
    expect(resolveLook(theme, { ...args, style: { fillOpacity: 7 } }).fillOpacity).toBe(1)
    expect(resolveLook(theme, { ...args, style: { fillOpacity: -2 } }).fillOpacity).toBe(0)
    expect(resolveLine(theme, { ...args, style: { lineOpacity: 3 } }).opacity).toBe(1)
  })

  it('a branch can have its own colour, thickness, dash, opacity and arrow head', () => {
    const line = resolveLine(theme, { ...args, style: { lineColor: '#ff0000', lineWidth: 12, lineStyle: 'dashed', lineOpacity: 0.5, lineArrow: true } })
    expect(line).toMatchObject({ color: '#ff0000', width: 12, style: 'dashed', opacity: 0.5, arrow: true })
  })

  it('a topic override beats the map and theme (node override > map override > theme)', () => {
    const own = resolveLine(theme, { ...args, style: { lineWidth: 6, taper: false } })
    expect(own.width).toBe(6)
    expect(own.taper).toBe(false)
    expect(own.endWidth).toBe(6)
    const tapered = resolveLine(theme, { ...args, style: { lineWidth: 10, taper: true } })
    expect(tapered.endWidth).toBeLessThan(10)
  })
})
