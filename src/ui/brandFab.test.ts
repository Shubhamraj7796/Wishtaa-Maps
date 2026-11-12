import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND_FAB, BRAND_FAB_ICON } from './iconSize'

const tokens = readFileSync('src/styles/tokens.css', 'utf8')
const triplet = (block: string, name: string): [number, number, number] => {
  const m = new RegExp(`--c-${name}: ([0-9]+) ([0-9]+) ([0-9]+)`).exec(block)
  if (!m) throw new Error(`token ${name} missing`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}
const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]: number[]) => 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!)
const ratio = (a: number[], b: number[]) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
const dim = (c: number[], k: number) => c.map((v) => Math.min(255, v * k))
const light = tokens.slice(tokens.indexOf(':root,'), tokens.indexOf(":root[data-theme='dark']"))
const dark = tokens.slice(tokens.indexOf(":root[data-theme='dark']"))

describe('the brand green of a floating action button', () => {
  it('uses the tokens brand and brand-ink, with no hard-coded colour', () => {
    for (const c of [BRAND_FAB, BRAND_FAB_ICON]) {
      expect(c).toMatch(/bg-brand/)
      expect(c).toMatch(/text-brand-ink/)
      expect(c).not.toMatch(/#[0-9a-f]{3,6}|rgb\(/i)
    }
  })

  it('the icon on the green passes 3:1 (an icon, not text) at rest, hovered and pressed, in light and dark mode', () => {
    for (const [mode, block] of [['light', light], ['dark', dark]] as const) {
      const brand = triplet(block, 'brand')
      const ink = triplet(block, 'brand-ink')
      for (const k of [1, 0.95, 0.9]) expect(ratio(dim(brand, k), dim(ink, k)), `${mode} at ${k}`).toBeGreaterThanOrEqual(3)
      // The button against the page behind it (a graphic must stand out too).
      expect(ratio(brand, triplet(block, 'surface')), `${mode} against the page`).toBeGreaterThanOrEqual(3)
    }
  })

  it('in dark mode the token ink is dark, because white on that teal would fail', () => {
    expect(ratio(triplet(dark, 'brand'), [255, 255, 255])).toBeLessThan(3)
    expect(ratio(triplet(dark, 'brand'), triplet(dark, 'brand-ink'))).toBeGreaterThan(7)
  })

  it('the four approved floating buttons use it, and the two left alone do not', () => {
    const src = (p: string) => readFileSync(p, 'utf8')
    expect(src('src/editor/items/NotePopup.tsx')).toContain('BRAND_FAB_ICON')
    expect(src('src/editor/pdf/CollapsedTab.tsx')).toContain('BRAND_FAB')
    expect(src('src/editor/pdf/PdfPanel.tsx')).toContain('BRAND_FAB')
    expect(src('src/editor/ui/SettingsPanel.tsx')).toContain('BRAND_FAB')
    expect(src('src/editor/viewer/PictureViewer.tsx')).not.toContain('BRAND_FAB')
    expect(src('src/editor/canvas/TopicView.tsx')).not.toContain('BRAND_FAB')
  })
})
