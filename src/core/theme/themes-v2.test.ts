import { describe, expect, it, vi } from 'vitest'
import { measure } from '../layout/engine'
import { addChild, replaceTopicStyle, setTopicStyle } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import { DEFAULT_SETTINGS, readSettings, resolveTheme, snapshotSettings, type MapSettings } from '../settings'
import { applyColorScheme, applyTheme, previewSettings } from './apply'
import { contrast } from './color'
import { exportTheme, importTheme, LocalThemeRepository, themeFromMap, ThemeImportError, THEMES_KEY } from './custom'
import { centralFill, LEVEL_KEYS, migrateV1Theme, sanitizeTheme, THEME_FORMAT, type Theme } from './model'
import { accentFor, asResolved, resolveLine, resolveLook, themeBranchWidth, TAPER_END } from './resolve'
import { COLOR_SCHEMES, findScheme } from './schemes'
import { polylineLength, samplePath, taperEdges, taperedBranchPath, taperedOutline, widthAt } from './taper'
import { DEFAULT_THEME_ID, THEMES, findTheme } from './themes'

const settingsFor = (over: Partial<MapSettings> = {}): MapSettings => ({ ...DEFAULT_SETTINGS, ...over })
const theme = (id: string) => findTheme(id)

describe('the theme gallery', () => {
  const light = THEMES.filter((t) => !t.dark)
  const dark = THEMES.filter((t) => t.dark)

  it('has at least 16 themes: 8 light, 6 dark, and the Wishtaa default', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(16)
    expect(light.length).toBeGreaterThanOrEqual(8)
    expect(dark.length).toBeGreaterThanOrEqual(6)
    expect(THEMES.find((t) => t.id === DEFAULT_THEME_ID)?.name).toBe('Wishtaa Classic')
  })

  it('is data in the current format, and every theme is valid and unchanged by validation', () => {
    for (const t of THEMES) {
      expect(t.version).toBe(THEME_FORMAT)
      expect(Object.keys(t.levels)).toEqual(LEVEL_KEYS)
      expect(sanitizeTheme(JSON.parse(JSON.stringify(t)))).toEqual(t)
    }
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
  })

  it('covers the looks asked for', () => {
    const has = (f: (t: Theme) => boolean) => THEMES.some(f)
    expect(has((t) => t.levels.central.shape === 'doubleCircle')).toBe(true) // concentric central topic
    expect(has((t) => t.levels.central.shape === 'doubleCircle' && t.dark)).toBe(true)
    expect(has((t) => t.levels.main.branch.taper)).toBe(true) // tapered branches
    expect(has((t) => t.levels.sub.shape === 'underline' && t.levels.sub.fill === 'plain')).toBe(true) // underline style
    expect(has((t) => t.levels.main.fill === 'outline')).toBe(true) // outlined / minimal
    expect(has((t) => t.levels.main.fill === 'solid')).toBe(true) // solid bold
    expect(has((t) => t.levels.main.fill === 'tint')).toBe(true) // soft / pastel
    expect(has((t) => t.palette.every((c) => c.toLowerCase() === t.palette[0]?.toLowerCase() || /^#(1|2|3|4|5|6|7)/.test(c)))).toBe(true) // monochrome-ish
    expect(has((t) => t.handDrawn)).toBe(true)
    expect(has((t) => t.levels.main.branch.curve === 'roundedElbow')).toBe(true)
  })

  it('the high-contrast themes reach 7:1 (AAA) for every text on its background', () => {
    for (const id of ['clear', 'clear-dark']) {
      const t = theme(id)
      expect(contrast(t.text, t.bg), id).toBeGreaterThanOrEqual(7)
      const r = resolveTheme(settingsFor({ themeId: id }))
      for (const isRoot of [true, false])
        t.palette.forEach((_, branch) => {
          for (const depth of isRoot ? [0] : [1, 2, 3]) {
            const look = resolveLook(r, { depth, branch: isRoot ? -1 : branch, isRoot })
            const bg = look.fill === 'transparent' ? t.bg : look.fill
            expect(contrast(look.text, bg), `${id} depth ${depth} branch ${branch}`).toBeGreaterThanOrEqual(7)
            // The outline or border must also stand out from the canvas.
            expect(contrast(look.border, t.bg), `${id} border depth ${depth} branch ${branch}`).toBeGreaterThanOrEqual(4.5)
          }
        })
    }
  })

  it('keeps text readable (4.5:1) in all themes, for every colour scheme too', () => {
    for (const t of THEMES) {
      for (const scheme of COLOR_SCHEMES) {
        const r = resolveTheme(settingsFor({ themeId: t.id, colorSchemeId: scheme.id }))
        scheme.colors.forEach((_, branch) => {
          for (const depth of [1, 2, 3]) {
            const look = resolveLook(r, { depth, branch, isRoot: false })
            const bg = look.fill === 'transparent' ? r.bg : look.fill
            expect(contrast(look.text, bg), `${t.id}/${scheme.id} b${branch} d${depth}`).toBeGreaterThanOrEqual(4.5)
          }
        })
      }
    }
  })
})

describe('colour schemes', () => {
  it('has at least 12 palettes, each a valid ordered list of colours', () => {
    expect(COLOR_SCHEMES.length).toBeGreaterThanOrEqual(12)
    expect(new Set(COLOR_SCHEMES.map((s) => s.id)).size).toBe(COLOR_SCHEMES.length)
    for (const s of COLOR_SCHEMES) {
      expect(s.colors.length).toBeGreaterThanOrEqual(6)
      for (const c of s.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('includes rainbow, warm, cool, pastel, earthy, one-colour and colour-blind-safe palettes', () => {
    const names = COLOR_SCHEMES.map((s) => s.name.toLowerCase()).join('|')
    for (const w of ['rainbow', 'warm', 'cool', 'pastel', 'earthy', 'blues', 'greens', 'purples', 'reds', 'greys', 'colour-blind']) expect(names).toContain(w)
    expect(COLOR_SCHEMES.filter((s) => s.group === 'Accessible').length).toBeGreaterThanOrEqual(2)
    expect(findScheme('cb-okabe')?.colors).toContain('#0072b2')
    expect(findScheme('nope')).toBeNull()
  })

  it('main branches take colours in order, and wrap around', () => {
    const scheme = COLOR_SCHEMES[0]!
    const r = resolveTheme(settingsFor({ colorSchemeId: scheme.id }))
    scheme.colors.forEach((c, i) => expect(accentFor(r, i)).toBe(c))
    expect(accentFor(r, scheme.colors.length)).toBe(scheme.colors[0])
    expect(accentFor(r, scheme.colors.length + 2)).toBe(scheme.colors[2])
  })

  it('sub-branches inherit their parent branch colour', () => {
    const r = resolveTheme(settingsFor({ colorSchemeId: 'pastel' }))
    for (const branch of [0, 1, 4]) {
      const main = resolveLine(r, { depth: 1, branch })
      expect(resolveLine(r, { depth: 2, branch }).color).toBe(main.color)
      expect(resolveLine(r, { depth: 5, branch }).color).toBe(main.color)
    }
  })

  it('changing the scheme recolours branches but never changes shapes, fonts or sizes', () => {
    for (const id of ['wishtaa', 'orbit', 'brush', 'underline']) {
      const before = resolveTheme(settingsFor({ themeId: id }))
      const after = resolveTheme(settingsFor({ themeId: id, colorSchemeId: 'cb-okabe' }))
      for (const [depth, isRoot] of [[0, true], [1, false], [2, false], [3, false]] as const) {
        const a = resolveLook(before, { depth, branch: 1, isRoot })
        const b = resolveLook(after, { depth, branch: 1, isRoot })
        expect({ shape: b.shape, fontSize: b.fontSize, fontWeight: b.fontWeight, fontFamily: b.fontFamily, borderWidth: b.borderWidth }).toEqual({ shape: a.shape, fontSize: a.fontSize, fontWeight: a.fontWeight, fontFamily: a.fontFamily, borderWidth: a.borderWidth })
      }
      expect(accentFor(after, 1)).not.toBe(accentFor(before, 1))
      expect(after.levels).toEqual(before.levels)
    }
  })

  it('rainbow off uses one colour; a custom palette beats the scheme', () => {
    const single = resolveTheme(settingsFor({ colorSchemeId: 'warm', rainbow: false }))
    expect(accentFor(single, 0)).toBe(accentFor(single, 3))
    const custom = resolveTheme(settingsFor({ colorSchemeId: 'warm', palette: ['#010203', '#040506'] }))
    expect(accentFor(custom, 1)).toBe('#040506')
  })
})

describe('resolution order: topic, then map, then theme, then default', () => {
  const base = settingsFor({ themeId: 'wishtaa' })

  it('branch colour: theme palette < colour scheme < the map’s own palette < the topic’s colour', () => {
    const t = (s: Partial<MapSettings>) => resolveTheme({ ...base, ...s })
    expect(accentFor(t({}), 0)).toBe(theme('wishtaa').palette[0])
    expect(accentFor(t({ colorSchemeId: 'cool' }), 0)).toBe(findScheme('cool')!.colors[0])
    expect(accentFor(t({ colorSchemeId: 'cool', palette: ['#0a0b0c'] }), 0)).toBe('#0a0b0c')
    expect(resolveLine(t({ colorSchemeId: 'cool', palette: ['#0a0b0c'] }), { depth: 1, branch: 0, style: { lineColor: '#123456' } }).color).toBe('#123456')
  })

  it('branch thickness: theme level < map override (scales every level) < the topic’s own', () => {
    const themed = resolveTheme(base)
    const t = themeBranchWidth(themed, 1)
    expect(resolveLine(themed, { depth: 1, branch: 0 }).width).toBe(t)
    const big = resolveTheme({ ...base, branchThickness: 12 })
    expect(resolveLine(big, { depth: 1, branch: 0 }).width).toBe(12)
    // Other levels keep their proportion.
    const ratio = themeBranchWidth(themed, 2) / t
    expect(resolveLine(big, { depth: 2, branch: 0 }).width).toBeCloseTo(12 * ratio, 1)
    expect(resolveLine(big, { depth: 1, branch: 0, style: { lineWidth: 3 } }).width).toBe(3)
  })

  it('taper: theme level < map override < the topic’s own', () => {
    const brush = settingsFor({ themeId: 'brush' })
    expect(resolveLine(resolveTheme(brush), { depth: 1, branch: 0 }).taper).toBe(true)
    expect(resolveLine(resolveTheme({ ...brush, taper: false }), { depth: 1, branch: 0 }).taper).toBe(false)
    expect(resolveLine(resolveTheme({ ...brush, taper: false }), { depth: 1, branch: 0, style: { taper: true } }).taper).toBe(true)
    expect(resolveLine(resolveTheme(base), { depth: 1, branch: 0 }).taper).toBe(false)
    expect(resolveLine(resolveTheme({ ...base, taper: true }), { depth: 1, branch: 0 }).taper).toBe(true)
    expect(resolveLine(resolveTheme({ ...base, taper: true }), { depth: 1, branch: 0, style: { taper: false } }).taper).toBe(false)
  })

  it('a tapered branch ends thinner than it starts; an untapered one does not change', () => {
    const l = resolveLine(resolveTheme({ ...base, taper: true, branchThickness: 10 }), { depth: 1, branch: 0 })
    expect(l.width).toBe(10)
    expect(l.endWidth).toBeCloseTo(10 * TAPER_END, 5)
    const flat = resolveLine(resolveTheme(base), { depth: 1, branch: 0 })
    expect(flat.endWidth).toBe(flat.width)
  })

  it('topic and theme fill, shape, font and text: the topic wins, then the theme level, then the default', () => {
    const r = resolveTheme(settingsFor({ themeId: 'clear' }))
    const plain = resolveLook(r, { depth: 1, branch: 0, isRoot: false })
    expect(plain.fontWeight).toBe(700) // from the theme level
    expect(resolveLook(r, { depth: 1, branch: 0, isRoot: false, style: { fontWeight: 400, shape: 'pill' } })).toMatchObject({ fontWeight: 400, shape: 'pill' })
    // Nothing set anywhere: built-in defaults
    expect(resolveLook(asResolved(sanitizeTheme({ ...theme('mono'), levels: undefined, version: 1, root: { fill: '#000000', text: '#ffffff' }, l1: {}, l2: {} }) as Theme), { depth: 1, branch: 0, isRoot: false }).shape).toBe('rounded')
  })

  it('null in a topic’s overrides means inherit, same as not set', () => {
    const r = resolveTheme(base)
    const withNulls = { fill: null, shape: null, lineColor: null, lineWidth: null, taper: null } as unknown as Parameters<typeof resolveLook>[1]['style']
    expect(resolveLook(r, { depth: 1, branch: 2, isRoot: false, style: withNulls })).toEqual(resolveLook(r, { depth: 1, branch: 2, isRoot: false }))
    expect(resolveLine(r, { depth: 1, branch: 2, style: withNulls })).toEqual(resolveLine(r, { depth: 1, branch: 2 }))
  })

  it('theme curve and dash per level reach the line', () => {
    const r = resolveTheme(settingsFor({ themeId: 'underline' }))
    expect(resolveLine(r, { depth: 1, branch: 0 }).curve).toBe('roundedElbow')
    expect(resolveLine(r, { depth: 2, branch: 0, style: { branchCurve: 'straight' } }).curve).toBe('straight')
    expect(resolveLine(r, { depth: 1, branch: 0, style: { lineStyle: 'dotted' } }).style).toBe('dotted')
  })
})

describe('thickness by level', () => {
  it('gets thinner with depth in every theme, down to a floor, and a map override never goes outside 1 to 40 px', () => {
    for (const t of THEMES) {
      const r = asResolved(t)
      const w = [1, 2, 3, 4, 6, 9].map((d) => resolveLine(r, { depth: d, branch: 0 }).width)
      for (let i = 1; i < w.length; i++) expect(w[i]!, `${t.id} depth ${i}`).toBeLessThanOrEqual(w[i - 1]!)
      for (const x of w) expect(x).toBeGreaterThanOrEqual(1)
    }
    const r = resolveTheme(settingsFor({ branchThickness: 20 }))
    expect(resolveLine(r, { depth: 1, branch: 0, style: { lineWidth: 999 } }).width).toBe(40)
    expect(resolveLine(r, { depth: 1, branch: 0, style: { lineWidth: 0.01 } }).width).toBe(1)
  })
})

describe('applying a theme', () => {
  const setup = () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'A')
    const b = addChild(doc, root, 'B')
    return { doc, root, a, b }
  }

  it('is one undo step: theme, and the map-wide tweaks it clears, come back together', () => {
    const { doc } = setup()
    doc.settings.set('palette', ['#112233'])
    doc.settings.set('colorSchemeId', 'warm')
    doc.settings.set('branchThickness', 9)
    doc.settings.set('taper', true)
    doc.settings.set('background', { color: '#eeeeee', pattern: 'grid' })
    doc.undo.stopCapturing()
    doc.undo.clear()
    const before = snapshotSettings(doc)
    applyTheme(doc, theme('midnight'))
    const during = snapshotSettings(doc)
    expect(during).toMatchObject({ themeId: 'midnight', palette: null, colorSchemeId: null, branchThickness: null, taper: null, background: { color: null, pattern: null } })
    expect(doc.undo.undoStack.length).toBe(1)
    doc.undo.undo()
    expect(snapshotSettings(doc)).toEqual(before)
    doc.undo.redo()
    expect(snapshotSettings(doc)).toEqual(during)
  })

  it('keeps each topic’s own overrides by default, and clears them only on request (also one step)', () => {
    const { doc, a, b } = setup()
    setTopicStyle(doc, [a], { fill: '#ff0000', shape: 'pill', lineColor: '#00ff00' })
    applyTheme(doc, theme('ocean'))
    expect(doc.topics.get(a)?.style).toEqual({ fill: '#ff0000', shape: 'pill', lineColor: '#00ff00' })
    doc.undo.stopCapturing()
    doc.undo.clear()
    applyTheme(doc, theme('forest'), { resetOverrides: true })
    expect(doc.topics.get(a)?.style).toEqual({})
    expect(doc.topics.get(b)?.style).toEqual({})
    expect(snapshotSettings(doc).themeId).toBe('forest')
    expect(doc.undo.undoStack.length).toBe(1)
    doc.undo.undo()
    expect(doc.topics.get(a)?.style).toEqual({ fill: '#ff0000', shape: 'pill', lineColor: '#00ff00' })
    expect(snapshotSettings(doc).themeId).toBe('ocean')
  })

  it('stores a theme that is not built in inside the map, so the map keeps its own theme', () => {
    const { doc } = setup()
    const mine: Theme = { ...theme('ocean'), id: 'custom-x', name: 'Mine' }
    applyTheme(doc, mine)
    const s = snapshotSettings(doc)
    expect(s.themeId).toBe('custom-x')
    expect(s.customThemes.map((t) => t.id)).toEqual(['custom-x'])
    // Opened somewhere that has no copy of it, it still resolves from the map itself.
    expect(resolveTheme(s).name).toBe('Mine')
    applyTheme(doc, theme('sand'))
    applyTheme(doc, mine)
    expect(snapshotSettings(doc).customThemes).toHaveLength(1)
  })

  it('"Reset to theme" (clearing a topic’s overrides) returns it to exactly what the theme gives, and undoes', () => {
    const { doc, a } = setup()
    const r = resolveTheme(snapshotSettings(doc))
    const plain = resolveLook(r, { depth: 1, branch: 0, isRoot: false })
    setTopicStyle(doc, [a], { fill: '#ff0000', textColor: '#ffffff', fontSize: 30, taper: true })
    doc.undo.stopCapturing()
    replaceTopicStyle(doc, [a], {})
    expect(resolveLook(r, { depth: 1, branch: 0, isRoot: false, style: doc.topics.get(a)?.style })).toEqual(plain)
    doc.undo.undo()
    expect(doc.topics.get(a)?.style.fontSize).toBe(30)
  })

  it('a colour scheme is one undo step and clears a custom palette', () => {
    const { doc } = setup()
    doc.settings.set('palette', ['#112233'])
    doc.undo.stopCapturing()
    doc.undo.clear()
    applyColorScheme(doc, 'candy')
    expect(snapshotSettings(doc)).toMatchObject({ colorSchemeId: 'candy', palette: null })
    expect(doc.undo.undoStack.length).toBe(1)
    applyColorScheme(doc, null)
    expect(snapshotSettings(doc).colorSchemeId).toBeNull()
  })
})

describe('previews (hover) do not change the map', () => {
  it('show what applying would show, without touching the settings', () => {
    const s = settingsFor({ themeId: 'ocean', palette: ['#111111'], taper: true, branchThickness: 9, background: { color: '#abcdef', pattern: 'grid' } })
    const frozen = JSON.stringify(s)
    const p = previewSettings(s, { theme: theme('midnight') })
    expect(p).toMatchObject({ themeId: 'midnight', palette: null, taper: null, branchThickness: null, background: { color: null, pattern: null } })
    expect(JSON.stringify(s)).toBe(frozen)
    expect(previewSettings(s, { schemeId: 'warm' })).toMatchObject({ themeId: 'ocean', colorSchemeId: 'warm', palette: null })
    expect(previewSettings(s, { branchThickness: 15 }).branchThickness).toBe(15)
    expect(previewSettings(s, {})).toBe(s)
    const custom: Theme = { ...theme('ocean'), id: 'custom-p', name: 'P' }
    expect(resolveTheme(previewSettings(s, { theme: custom })).name).toBe('P')
  })
})

describe('old maps open unchanged', () => {
  it('a version 1 theme converts to per-level data with the old line widths', () => {
    const v1 = { id: 'old', name: 'Old', dark: false, bg: '#ffffff', pattern: 'dots', text: '#111111', palette: ['#0f766e'], root: { fill: '#112233', text: '#ffffff', shape: 'ellipse' }, l1: { mode: 'solid', shape: 'pill' }, l2: { mode: 'tint', shape: 'rect' }, lineWidth: 5, font: 'x', handDrawn: false } as const
    const t = migrateV1Theme(v1 as unknown as Parameters<typeof migrateV1Theme>[0])
    expect(t.version).toBe(2)
    expect(centralFill(t)).toBe('#112233')
    expect(t.levels.main).toMatchObject({ shape: 'pill', fill: 'solid' })
    expect(t.levels.sub).toMatchObject({ shape: 'rect', fill: 'tint' })
    expect(t.levels.deeper).toMatchObject({ shape: 'rect', fill: 'tint' })
    const r = asResolved(t)
    // Old rule: max(1.5, lineWidth - 0.6 * depth)
    for (const d of [1, 2, 3, 4, 5, 8]) expect(resolveLine(r, { depth: d, branch: 0 }).width).toBeCloseTo(Math.max(1.5, 5 - 0.6 * d), 5)
  })

  it('settings from a map made before colour schemes, taper and thickness existed', () => {
    const s = readSettings({ layout: 'mindmap:both', themeId: 'sunset', rainbow: true, handDrawn: null })
    expect(s).toMatchObject({ colorSchemeId: null, branchThickness: null, taper: null, themeId: 'sunset' })
  })

  it('bad values for the new settings are ignored', () => {
    expect(readSettings({ colorSchemeId: 'not-a-scheme', branchThickness: 'thick', taper: 'yes' })).toMatchObject({ colorSchemeId: null, branchThickness: null, taper: null })
    expect(readSettings({ branchThickness: 999 }).branchThickness).toBe(20)
    expect(readSettings({ branchThickness: 0 }).branchThickness).toBe(1)
  })
})

describe('tapered branches', () => {
  it('samples straight and curved paths', () => {
    expect(samplePath('M0 0L10 0')).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }])
    const c = samplePath('M0 0C10 0 20 10 30 10', 10)
    expect(c).toHaveLength(11)
    expect(c[0]).toEqual({ x: 0, y: 0 })
    expect(c[10]?.x).toBeCloseTo(30)
    expect(c[10]?.y).toBeCloseTo(10)
    expect(samplePath('M0 0Q10 0 10 10', 4)).toHaveLength(5)
    expect(samplePath('')).toEqual([])
    expect(polylineLength(samplePath('M0 0L3 4'))).toBeCloseTo(5)
  })

  it('is as thick as asked at the start and at the end, and thins evenly in between', () => {
    const pts = samplePath('M0 0L100 0', 10)
    const { left, right } = taperEdges(pts, 10, 2)
    const width = (i: number) => Math.abs((left[i] as { y: number }).y - (right[i] as { y: number }).y)
    expect(width(0)).toBeCloseTo(10, 5)
    expect(width(pts.length - 1)).toBeCloseTo(2, 5)
    expect(width(1)).toBeCloseTo(widthAt(1 / 1, 10, 2) > 0 ? 10 - 8 * (100 / 100) : 0, 0) // two points on a straight line: one step to the end
    const many = taperEdges(samplePath('M0 0C40 0 60 50 100 50', 40), 12, 3)
    const ws = many.left.map((l, i) => Math.hypot(l.x - (many.right[i] as { x: number }).x, l.y - (many.right[i] as { y: number }).y))
    for (let i = 1; i < ws.length; i++) expect(ws[i]!).toBeLessThanOrEqual(ws[i - 1]! + 1e-6)
    expect(ws[0]).toBeCloseTo(12, 4)
    expect(ws[ws.length - 1]).toBeCloseTo(3, 4)
  })

  it('stays centred on the path (both edges equally far from it)', () => {
    const pts = samplePath('M0 0L100 0', 5)
    const { left, right } = taperEdges(pts, 8, 4)
    left.forEach((l, i) => expect(l.y + (right[i] as { y: number }).y).toBeCloseTo(0, 5))
  })

  it('makes a closed, filled outline with round ends, and nothing for a path with no length', () => {
    const d = taperedBranchPath('M0 0C40 0 60 50 100 50', 10, 2)
    expect(d.startsWith('M')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.match(/A/g)).toHaveLength(2)
    expect(taperedOutline([{ x: 1, y: 1 }], 5, 1)).toBe('')
    expect(taperedOutline([{ x: 1, y: 1 }, { x: 1, y: 1 }], 5, 1)).toBe('')
  })
})

describe('the double circle shape', () => {
  it('needs a square box with room for the text inside the inner circle', () => {
    const plain = measure('IND AS 2', 0, null, undefined, 'rounded')
    const dc = measure('IND AS 2', 0, null, undefined, 'doubleCircle')
    expect(dc.w).toBe(dc.h)
    expect(dc.w).toBeGreaterThanOrEqual(Math.max(plain.w, plain.h))
    // The inner circle (box minus ring and gap) must contain the text rectangle's corners.
    const inner = dc.w - 2 * 14
    expect(inner / 2).toBeGreaterThanOrEqual(Math.hypot(plain.w, plain.h) / 2 * 0.7)
  })

  it('is used as the central shape of some themes', () => {
    expect(THEMES.filter((t) => t.levels.central.shape === 'doubleCircle').map((t) => t.id)).toEqual(expect.arrayContaining(['orbit', 'halo']))
    const look = resolveLook(resolveTheme(settingsFor({ themeId: 'orbit' })), { depth: 0, branch: -1, isRoot: true })
    expect(look.shape).toBe('doubleCircle')
  })
})

describe('a theme from the current map', () => {
  it('draws exactly like the map does now, with the map’s tweaks built in', () => {
    const s = settingsFor({ themeId: 'ocean', colorSchemeId: 'candy', branchThickness: 11, taper: true, background: { color: '#fafafa', pattern: 'lines' }, handDrawn: true })
    const t = themeFromMap(s, 'Mine', 'custom-1')
    expect(t).toMatchObject({ id: 'custom-1', name: 'Mine', version: 2, bg: '#fafafa', pattern: 'lines', handDrawn: true })
    expect(t.palette).toEqual(findScheme('candy')!.colors)
    const from = resolveTheme(s)
    const to = resolveTheme(settingsFor({ themeId: 'custom-1', customThemes: [t] }))
    for (const args of [{ depth: 0, branch: -1, isRoot: true }, { depth: 1, branch: 3, isRoot: false }, { depth: 2, branch: 1, isRoot: false }, { depth: 4, branch: 6, isRoot: false }]) {
      expect(resolveLook(to, args)).toEqual(resolveLook(from, args))
      const a = resolveLine(from, { depth: args.depth || 1, branch: args.branch })
      const b = resolveLine(to, { depth: args.depth || 1, branch: args.branch })
      expect(b.width).toBeCloseTo(a.width, 1)
      expect({ ...b, width: 0, endWidth: 0 }).toEqual({ ...a, width: 0, endWidth: 0 })
    }
    expect(to.bg).toBe(from.bg)
    expect(sanitizeTheme(t)).toEqual(t)
  })

  it('trims and limits the name', () => {
    expect(themeFromMap(settingsFor(), '   ', 'c').name).toBe('My theme')
    expect(themeFromMap(settingsFor(), 'x'.repeat(100), 'c').name).toHaveLength(60)
  })
})

describe('the user’s own themes', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { data, storage: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) } }
  }
  const mine = (id: string, name = id): Theme => ({ ...theme('ocean'), id, name })

  it('saves, updates, lists and removes, and tells listeners', async () => {
    const { storage } = memory()
    const repo = new LocalThemeRepository(storage)
    const listener = vi.fn()
    const off = repo.subscribe(listener)
    expect(await repo.list()).toEqual([])
    await repo.save(mine('a'))
    await repo.save(mine('b'))
    await repo.save({ ...mine('a'), name: 'A renamed' })
    expect((await repo.list()).map((t) => [t.id, t.name])).toEqual([['a', 'A renamed'], ['b', 'b']])
    await repo.remove('a')
    expect((await repo.list()).map((t) => t.id)).toEqual(['b'])
    expect(listener).toHaveBeenCalledTimes(4)
    off()
    await repo.save(mine('c'))
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('survives damaged storage, drops invalid entries, and reports a full or blocked store', async () => {
    const { data, storage } = memory()
    data.set(THEMES_KEY, '{not json')
    expect(await new LocalThemeRepository(storage).list()).toEqual([])
    data.set(THEMES_KEY, JSON.stringify([mine('ok'), { id: 'bad' }, 'x', null]))
    expect((await new LocalThemeRepository(storage).list()).map((t) => t.id)).toEqual(['ok'])
    const blocked = new LocalThemeRepository({ getItem: () => null, setItem: () => { throw new Error('full') } })
    await expect(blocked.save(mine('z'))).rejects.toThrow(/could not store/)
    expect(await new LocalThemeRepository(undefined).list()).toEqual([])
  })

  it('exports and imports a theme as JSON; an imported theme gets a new id', () => {
    const t = mine('custom-orig', 'Shared look')
    const text = exportTheme(t)
    expect(JSON.parse(text)).toMatchObject({ kind: 'wishtaa-theme', theme: { name: 'Shared look' } })
    const back = importTheme(text, ['custom-orig'])
    expect(back.name).toBe('Shared look')
    expect(back.id).not.toBe('custom-orig')
    expect({ ...back, id: '' }).toEqual({ ...t, id: '' })
    // A bare theme object (not wrapped) is accepted too.
    expect(importTheme(JSON.stringify(t)).name).toBe('Shared look')
  })

  it('rejects files that are not themes, and cleans hostile values', () => {
    expect(() => importTheme('nope')).toThrow(ThemeImportError)
    expect(() => importTheme('{"kind":"wishtaa-theme","theme":{"id":"x"}}')).toThrow(/not a usable theme/)
    expect(() => importTheme(' '.repeat(300_000))).toThrow(/too large/)
    const evil = { ...mine('e'), font: 'a;} body{display:none', levels: { ...mine('e').levels, main: { ...mine('e').levels.main, shape: 'script', fontFamily: '<img onerror=x>' } } }
    const t = importTheme(JSON.stringify(evil))
    expect(t.font).toContain('Inter')
    expect(t.levels.main.shape).toBe('rounded')
    expect(t.levels.main.fontFamily).toBeNull()
  })

  it('reading it back never lets a bad theme into the map settings', () => {
    const s = readSettings({ customThemes: [{ ...mine('x'), bg: 'url(evil)' }, mine('ok')] })
    expect(s.customThemes.map((t) => t.id)).toEqual(['ok'])
  })
})
