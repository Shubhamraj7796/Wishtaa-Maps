import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, resolveTheme } from '../settings'
import { AUTO_BRANCH, autoThickness, centralScale, depthFactor, onScreenWidths } from './autoBranch'
import { resolveLine } from './resolve'

describe('automatic branch thickness', () => {
  it('a topic about 700 px wide gets a bold main branch (the imported IND AS case)', () => {
    const t = autoThickness(1, 700, 300)
    expect(t).toBeGreaterThan(15)
    expect(t).toBeLessThanOrEqual(AUTO_BRANCH.level1Max)
  })

  it('a normal small topic stays modest, never under 4 px at the first level', () => {
    expect(autoThickness(1, 120, 160)).toBe(AUTO_BRANCH.level1Min)
    expect(autoThickness(1, 1, 160)).toBe(AUTO_BRANCH.level1Min)
  })

  it('the first level is clamped to 4 to 28 px however big the topic', () => {
    expect(autoThickness(1, 5000, 1000)).toBe(AUTO_BRANCH.level1Max)
    expect(autoThickness(1, 0, 0)).toBe(AUTO_BRANCH.level1Min)
  })

  it('grows with the size of the topic', () => {
    const sizes = [200, 300, 400, 600, 800].map((s) => autoThickness(1, s, 200))
    for (let i = 1; i < sizes.length; i++) expect(sizes[i] as number).toBeGreaterThanOrEqual(sizes[i - 1] as number)
    expect(sizes[4]).toBeGreaterThan(sizes[0] as number)
  })

  it('is 25% thinner each level down, for the same topic size', () => {
    expect(depthFactor(1)).toBe(1)
    expect(depthFactor(2)).toBeCloseTo(0.75)
    expect(depthFactor(3)).toBeCloseTo(0.5625)
    const size = 900
    const d1 = autoThickness(1, size, 200)
    const d2 = autoThickness(2, size, 200)
    const d3 = autoThickness(3, size, 200)
    expect(d2).toBeCloseTo(d1 * 0.75, 1)
    expect(d3).toBeCloseTo(d1 * 0.5625, 1)
  })

  it('never goes below 2 px, however deep', () => {
    for (const depth of [2, 3, 6, 12, 40]) expect(autoThickness(depth, 100, 160)).toBeGreaterThanOrEqual(AUTO_BRANCH.minThickness)
    expect(autoThickness(40, 100, 160)).toBe(AUTO_BRANCH.minThickness)
  })

  it('a bigger central topic gives bolder lines, a smaller one lighter, softly', () => {
    expect(centralScale(200)).toBeCloseTo(1)
    expect(centralScale(800)).toBe(AUTO_BRANCH.centralScaleMax)
    expect(centralScale(20)).toBe(AUTO_BRANCH.centralScaleMin)
    expect(centralScale(0)).toBe(1)
    expect(centralScale(NaN)).toBe(1)
    expect(autoThickness(1, 500, 400)).toBeGreaterThan(autoThickness(1, 500, 100))
  })

  it('keeps every constant in one config object', () => {
    expect(Object.keys(AUTO_BRANCH)).toEqual(expect.arrayContaining(['k', 'level1Min', 'level1Max', 'perLevel', 'minThickness', 'minOnScreen']))
    expect(AUTO_BRANCH.k).toBeCloseTo(0.025)
  })
})

describe('minimum width on screen', () => {
  it('scales with the map: at 100% a 6 px branch is 6 px', () => {
    expect(onScreenWidths(6, 2, 1)).toEqual({ width: 6, endWidth: 2 })
  })

  it('a zoomed-out map still shows its branches at about 1.5 px on screen', () => {
    const out = onScreenWidths(4, 1.2, 0.05)
    expect(out.width * 0.05).toBeGreaterThanOrEqual(AUTO_BRANCH.minOnScreen - 0.01)
    expect(out.endWidth * 0.05).toBeGreaterThanOrEqual(AUTO_BRANCH.minOnScreen - 0.01)
  })

  it('the thin end is never thicker than the thick end', () => {
    const out = onScreenWidths(3, 2.9, 0.1)
    expect(out.endWidth).toBeLessThanOrEqual(out.width)
  })

  it('does not thicken branches that are already wide enough', () => {
    expect(onScreenWidths(20, 6, 0.5)).toEqual({ width: 20, endWidth: 6 })
  })
})

describe('Auto, manual and old maps in resolveLine', () => {
  const auto = resolveTheme(DEFAULT_SETTINGS)
  const manualMap = resolveTheme({ ...DEFAULT_SETTINGS, branchThickness: 9 })
  const base = { depth: 1, branch: 0 }

  it('is the default: a branch with no thickness of its own is automatic and tapered', () => {
    const line = resolveLine(auto, { ...base, size: 700, centralSize: 300 })
    expect(line.auto).toBe(true)
    expect(line.width).toBe(autoThickness(1, 700, 300))
    expect(line.taper).toBe(true)
    expect(line.endWidth).toBeLessThan(line.width)
  })

  it('an old map (no explicit thickness) simply uses Auto, so it can look bolder', () => {
    const old = resolveLine(auto, { ...base, size: 700, centralSize: 300, style: {} })
    expect(old.auto).toBe(true)
    expect(old.width).toBeGreaterThan(resolveLine(auto, base).width)
  })

  it('a thickness set on the branch is manual and wins over Auto', () => {
    const line = resolveLine(auto, { ...base, size: 700, centralSize: 300, style: { lineWidth: 3 } })
    expect(line).toMatchObject({ auto: false, width: 3 })
  })

  it('a map-wide thickness is manual for every branch that has none of its own', () => {
    const line = resolveLine(manualMap, { ...base, size: 700, centralSize: 300 })
    expect(line.auto).toBe(false)
    expect(line.width).toBeCloseTo(9)
  })

  it('switching a branch back to Auto (clearing its thickness) returns the automatic width', () => {
    const manual = resolveLine(auto, { ...base, size: 700, centralSize: 300, style: { lineWidth: 3 } })
    const back = resolveLine(auto, { ...base, size: 700, centralSize: 300, style: { lineWidth: undefined } })
    expect(manual.width).toBe(3)
    expect(back.auto).toBe(true)
    expect(back.width).toBe(autoThickness(1, 700, 300))
  })

  it('without topic sizes to work from, the theme\'s own thickness is used (previews, old recordings)', () => {
    const line = resolveLine(auto, base)
    expect(line.auto).toBe(false)
  })

  it('a branch can turn taper off even in Auto, and the map can too', () => {
    expect(resolveLine(auto, { ...base, size: 700, centralSize: 300, style: { taper: false } }).taper).toBe(false)
    expect(resolveLine(resolveTheme({ ...DEFAULT_SETTINGS, taper: false }), { ...base, size: 700, centralSize: 300 }).taper).toBe(false)
  })

  it('deeper branches are thinner than main branches', () => {
    const main = resolveLine(auto, { depth: 1, branch: 0, size: 600, centralSize: 300 })
    const sub = resolveLine(auto, { depth: 2, branch: 0, size: 600, centralSize: 300 })
    const deep = resolveLine(auto, { depth: 4, branch: 0, size: 600, centralSize: 300 })
    expect(sub.width).toBeLessThan(main.width)
    expect(deep.width).toBeLessThan(sub.width)
  })
})

describe('speed', () => {
  it('works out 20,000 branches in well under a second', () => {
    const theme = resolveTheme(DEFAULT_SETTINGS)
    const start = performance.now()
    for (let i = 0; i < 20000; i++) resolveLine(theme, { depth: 1 + (i % 5), branch: i % 8, size: 100 + (i % 700), centralSize: 300 })
    expect(performance.now() - start).toBeLessThan(1000)
  })
})
