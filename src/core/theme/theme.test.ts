import { describe, expect, it } from 'vitest'
import { addChild, replaceTopicStyle, setBranchDir, setBranchOffset, setTopicStyle } from '../model/commands'
import { createMapDoc, ensureRoot } from '../model/doc'
import {
  DEFAULT_SETTINGS,
  MAX_CUSTOM_THEMES,
  MAX_SPACING,
  MIN_SPACING,
  readSettings,
  resolveTheme,
  sanitizeTheme,
  setSetting,
  snapshotSettings,
} from '../settings'
import golden from './golden-v1.json'
import { contrast, hexToRgb, isHex, luminance, mix, readableText } from './color'
import { centralFill, centralText } from './model'
import { accentFor, DASH, levelOf, resolveLine, resolveLook, shapeFor } from './resolve'
import { DEFAULT_THEME_ID, PATTERNS, THEMES, findTheme, type Theme } from './themes'

describe('colour helpers', () => {
  it('validates hex colours', () => {
    expect(isHex('#0f766e')).toBe(true)
    expect(isHex('#ABCDEF')).toBe(true)
    for (const bad of ['red', '#fff', '#12345', '#gggggg', 12, null, 'javascript:alert(1)']) expect(isHex(bad)).toBe(false)
  })
  it('computes contrast like WCAG', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(luminance('#ffffff')).toBeCloseTo(1)
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0])
  })
  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#ff0000', '#0000ff', 1)).toBe('#ff0000')
  })
  it('readableText always reaches 4.5:1 on any background', () => {
    let worst = 99
    for (let r = 0; r <= 255; r += 17)
      for (let g = 0; g <= 255; g += 17)
        for (let b = 0; b <= 255; b += 17) {
          const bg = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
          worst = Math.min(worst, contrast(readableText(bg), bg))
        }
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })
})

describe('theme gallery', () => {
  it('has at least 20 distinct, well-formed themes', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(THEMES.length)
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length)
    for (const t of THEMES) {
      expect(sanitizeTheme(t)).toEqual(t) // passes its own validation unchanged
      expect(t.palette.length).toBeGreaterThanOrEqual(6)
      expect(PATTERNS).toContain(t.pattern)
    }
  })
  it('includes light, dark and hand-drawn options', () => {
    expect(THEMES.some((t) => t.dark)).toBe(true)
    expect(THEMES.some((t) => !t.dark)).toBe(true)
    expect(THEMES.some((t) => t.handDrawn)).toBe(true)
  })
  it('keeps every text colour readable (4.5:1) on its background in every theme', () => {
    for (const t of THEMES) {
      expect(contrast(t.text, t.bg), `${t.id} text on background`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(centralText(t), centralFill(t)), `${t.id} root`).toBeGreaterThanOrEqual(4.5)
      const rt = resolveTheme({ ...DEFAULT_SETTINGS, themeId: t.id })
      t.palette.forEach((_, branch) => {
        for (const depth of [1, 2, 3]) {
          const look = resolveLook(rt, { depth, branch, isRoot: false })
          const bg = look.fill === 'transparent' ? t.bg : look.fill
          expect(contrast(look.text, bg), `${t.id} branch ${branch} depth ${depth}`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }
  })
  it('falls back to the default theme for unknown ids', () => {
    expect(findTheme('nope').id).toBe(DEFAULT_THEME_ID)
  })
})

describe('resolving how a topic looks', () => {
  const theme = resolveTheme(DEFAULT_SETTINGS)

  it('follows the theme by level', () => {
    expect(levelOf(0, true)).toBe('central')
    expect(levelOf(1, false)).toBe('main')
    expect(levelOf(2, false)).toBe('sub')
    expect(levelOf(4, false)).toBe('deeper')
    const root = resolveLook(theme, { depth: 0, branch: -1, isRoot: true })
    expect(root.fill).toBe(centralFill(theme))
    const l1 = resolveLook(theme, { depth: 1, branch: 0, isRoot: false })
    expect(l1.fill).toBe(theme.palette[0]) // solid
    const l2 = resolveLook(theme, { depth: 2, branch: 0, isRoot: false })
    expect(l2.fill).not.toBe(theme.palette[0]) // tinted
    expect(l2.border).toBe(theme.palette[0])
  })

  it('rainbow gives each branch its own colour; off uses one accent', () => {
    expect(accentFor(theme, 0)).not.toBe(accentFor(theme, 1))
    const plain = resolveTheme({ ...DEFAULT_SETTINGS, rainbow: false })
    expect(accentFor(plain, 0)).toBe(accentFor(plain, 3))
    expect(accentFor(theme, 9)).toBe(theme.palette[9 % theme.palette.length]) // wraps
  })

  it('topic overrides win, and a custom fill keeps its text readable', () => {
    const look = resolveLook(theme, { depth: 1, branch: 0, isRoot: false, style: { fill: '#ffee00', shape: 'diamond', fontSize: 22, italic: true, borderWidth: 4 } })
    expect(look.fill).toBe('#ffee00')
    expect(contrast(look.text, '#ffee00')).toBeGreaterThanOrEqual(4.5)
    expect(look).toMatchObject({ shape: 'diamond', fontSize: 22, italic: true, borderWidth: 4 })
    const explicit = resolveLook(theme, { depth: 1, branch: 0, isRoot: false, style: { fill: '#ffee00', textColor: '#123456' } })
    expect(explicit.text).toBe('#123456')
  })

  it('a layout shape (bubbles) beats the theme but not the topic', () => {
    expect(resolveLook(theme, { depth: 1, branch: 0, isRoot: false, layoutShape: 'ellipse' }).shape).toBe('ellipse')
    expect(resolveLook(theme, { depth: 1, branch: 0, isRoot: false, layoutShape: 'ellipse', style: { shape: 'rect' } }).shape).toBe('rect')
    expect(shapeFor(theme, 'central')).toBe(theme.levels.central.shape)
  })

  it('connector lines take colour from the branch and width/style from the topic or theme', () => {
    const a = resolveLine(theme, { depth: 1, branch: 2 })
    expect(a.color).toBe(theme.palette[2])
    expect(a.width).toBeGreaterThan(resolveLine(theme, { depth: 4, branch: 2 }).width) // thinner when deeper
    expect(resolveLine(theme, { depth: 1, branch: 2, style: { lineWidth: 7, lineStyle: 'dashed' } })).toMatchObject({ width: 7, style: 'dashed' })
    expect(DASH.solid).toBeUndefined()
    expect(DASH.dashed).toBeTruthy()
  })
})

describe('map settings', () => {
  it('start with sensible defaults', () => {
    expect(readSettings({})).toEqual(DEFAULT_SETTINGS)
  })

  it('reject invalid values instead of passing them on', () => {
    const s = readSettings({
      layout: 'evil',
      connector: 'zigzag',
      spacing: 99,
      themeId: 42,
      rainbow: 'yes',
      background: { color: 'url(javascript:x)', pattern: 'confetti' },
      palette: ['#112233', 'nope', '<script>'],
      customThemes: [{ id: 'x' }, 'str', null],
    })
    expect(s.layout).toBe(DEFAULT_SETTINGS.layout)
    expect(s.connector).toBe('auto')
    expect(s.spacing).toBe(MAX_SPACING)
    expect(s.themeId).toBe(DEFAULT_THEME_ID)
    expect(s.rainbow).toBe(true)
    expect(s.background).toEqual({ color: null, pattern: null })
    expect(s.palette).toEqual(['#112233'])
    expect(s.customThemes).toEqual([])
    expect(readSettings({ spacing: 0 }).spacing).toBe(MIN_SPACING)
  })

  it('sanitise custom themes (colours, fonts, shapes, sizes) and cap how many are kept', () => {
    const base = THEMES[1] as Theme
    const t = sanitizeTheme({ ...base, id: 'c1', name: 'Mine', font: 'x; background: url(evil)', levels: { ...base.levels, central: { ...base.levels.central, shape: 'star', branch: { ...base.levels.central.branch, thickness: 500 } } } })
    expect(t?.font).toContain('Inter') // unsafe font string replaced
    expect(t?.levels.central.shape).toBe('rounded')
    expect(t?.levels.central.branch.thickness).toBe(20)
    expect(sanitizeTheme({ ...base, bg: 'red' })).toBeNull()
    const many = Array.from({ length: 50 }, (_, i) => ({ ...base, id: `c${i}`, name: `T${i}` }))
    expect(readSettings({ customThemes: many }).customThemes).toHaveLength(MAX_CUSTOM_THEMES)
  })

  it('still accepts a theme saved in the old format (version 1)', () => {
    const v1 = (golden.themes as unknown[])[1]
    const t = sanitizeTheme(v1)
    expect(t?.version).toBe(2)
    expect(t?.levels.central.fillColor).toBe((v1 as { root: { fill: string } }).root.fill)
    expect(readSettings({ customThemes: [v1] }).customThemes[0]?.version).toBe(2)
  })

  it('apply the map’s overrides on top of the chosen theme', () => {
    const t = resolveTheme({ ...DEFAULT_SETTINGS, themeId: 'ocean', palette: ['#111111', '#222222'], background: { color: '#abcdef', pattern: 'grid' }, handDrawn: true, rainbow: false })
    expect(t.palette).toEqual(['#111111', '#222222'])
    expect(t.bg).toBe('#abcdef')
    expect(t.pattern).toBe('grid')
    expect(t.handDrawn).toBe(true)
    expect(t.rainbow).toBe(false)
    expect(t.name).toBe('Ocean')
  })

  it('use a custom theme by id', () => {
    const custom: Theme = { ...(THEMES[3] as Theme), id: 'custom-1', name: 'Mine' }
    expect(resolveTheme({ ...DEFAULT_SETTINGS, themeId: 'custom-1', customThemes: [custom] }).name).toBe('Mine')
  })

  it('are stored in the document and each change is one undo step', () => {
    const doc = createMapDoc()
    ensureRoot(doc)
    expect(snapshotSettings(doc)).toEqual(DEFAULT_SETTINGS)
    setSetting(doc, 'layout', 'org:down')
    setSetting(doc, 'themeId', 'midnight')
    expect(snapshotSettings(doc).layout).toBe('org:down')
    doc.undo.undo()
    expect(snapshotSettings(doc).themeId).toBe(DEFAULT_THEME_ID)
    expect(snapshotSettings(doc).layout).toBe('org:down')
    doc.undo.undo()
    expect(snapshotSettings(doc).layout).toBe(DEFAULT_SETTINGS.layout)
    doc.undo.redo()
    expect(snapshotSettings(doc).layout).toBe('org:down')
  })
})

describe('style commands', () => {
  const setup = () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'A')
    const a1 = addChild(doc, a, 'a1')
    const b = addChild(doc, root, 'B')
    return { doc, root, a, a1, b }
  }

  it('merges style changes, clears with undefined, and undoes in one step', () => {
    const { doc, a } = setup()
    setTopicStyle(doc, [a], { fill: '#ff0000', fontSize: 20 })
    setTopicStyle(doc, [a], { fontSize: undefined, italic: true })
    expect(doc.topics.get(a)?.style).toEqual({ fill: '#ff0000', italic: true })
    doc.undo.undo()
    expect(doc.topics.get(a)?.style).toEqual({ fill: '#ff0000', fontSize: 20 })
  })

  it('can apply to a whole branch', () => {
    const { doc, a, a1, b } = setup()
    setTopicStyle(doc, [a], { textColor: '#00ff00' }, true)
    expect(doc.topics.get(a1)?.style.textColor).toBe('#00ff00')
    expect(doc.topics.get(b)?.style.textColor).toBeUndefined()
    doc.undo.undo()
    expect(doc.topics.get(a1)?.style.textColor).toBeUndefined()
  })

  it('replaces a whole style (format painter) without sharing references', () => {
    const { doc, a, b } = setup()
    setTopicStyle(doc, [a], { fill: '#123456', shape: 'pill', lineStyle: 'dashed' })
    const copied = { ...doc.topics.get(a)?.style }
    replaceTopicStyle(doc, [b], copied)
    expect(doc.topics.get(b)?.style).toEqual(copied)
    expect(doc.topics.get(b)?.style).not.toBe(doc.topics.get(a)?.style)
    replaceTopicStyle(doc, [b], {})
    expect(doc.topics.get(b)?.style).toEqual({})
  })

  it('sets and clears a branch direction and offset (undoable); the root cannot be offset', () => {
    const { doc, root, a } = setup()
    setBranchDir(doc, a, 'down')
    expect(doc.topics.get(a)?.branchDir).toBe('down')
    setBranchDir(doc, a, null)
    expect(doc.topics.get(a)?.branchDir).toBeNull()
    setBranchOffset(doc, a, { x: 30, y: -10 })
    expect(doc.topics.get(a)?.offset).toEqual({ x: 30, y: -10 })
    doc.undo.undo()
    expect(doc.topics.get(a)?.offset ?? null).toBeNull()
    setBranchOffset(doc, root, { x: 5, y: 5 })
    expect(doc.topics.get(root)?.offset ?? null).toBeNull()
  })

  it('ignores unknown topics', () => {
    const { doc } = setup()
    const before = doc.undo.undoStack.length
    setTopicStyle(doc, ['ghost'], { fill: '#000000' })
    setBranchDir(doc, 'ghost', 'left')
    expect(doc.undo.undoStack.length).toBe(before)
  })
})
