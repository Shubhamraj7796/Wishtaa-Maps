import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, readSettings, resolveTheme } from '../settings'
import golden from './golden-v1.json'
import { accentFor, resolveLine, resolveLook, type LookArgs } from './resolve'
import { THEMES } from './themes'

/**
 * `golden-v1.json` was recorded from the theme code as it was BEFORE the theme model was reworked (three levels, one line
 * width). Every existing theme, and every theme an old map saved inside itself, must still resolve to exactly the same
 * colours, shapes, fonts and line widths, so maps made earlier open unchanged.
 */
const contexts: { name: string; args: LookArgs }[] = [
  { name: 'root', args: { depth: 0, branch: -1, isRoot: true } },
  { name: 'main0', args: { depth: 1, branch: 0, isRoot: false } },
  { name: 'main3', args: { depth: 1, branch: 3, isRoot: false } },
  { name: 'sub1', args: { depth: 2, branch: 1, isRoot: false } },
  { name: 'deep3', args: { depth: 3, branch: 2, isRoot: false } },
  { name: 'deep5', args: { depth: 5, branch: 9, isRoot: false } },
  { name: 'fill', args: { depth: 1, branch: 1, isRoot: false, style: { fill: '#123456' } } },
  { name: 'textcolor', args: { depth: 2, branch: 1, isRoot: false, style: { textColor: '#abcdef', fontSize: 20, italic: true, fontWeight: 700, fontFamily: 'Georgia' } } },
  { name: 'border', args: { depth: 1, branch: 2, isRoot: false, style: { border: '#ff0000', borderWidth: 5, shape: 'diamond' } } },
  { name: 'layoutShape', args: { depth: 1, branch: 0, isRoot: false, layoutShape: 'ellipse' } },
  { name: 'rootStyle', args: { depth: 0, branch: -1, isRoot: true, style: { fill: '#222222', shape: 'pill' } } },
]

/** The look fields that existed when the golden file was recorded. */
const OLD = ['fill', 'border', 'borderWidth', 'text', 'shape', 'fontSize', 'fontWeight', 'italic', 'fontFamily', 'handDrawn'] as const
const oldFields = (look: object) => Object.fromEntries(OLD.map((k) => [k, (look as Record<string, unknown>)[k]]))

type Row = { look: unknown; line: { color: string; width: number; style: string }; accent: string }
const resolved = golden.resolved as unknown as Record<string, Record<string, Row> & { lineStyled: { color: string; width: number; style: string } }>

function check(settings: Parameters<typeof resolveTheme>[0], key: string) {
  const theme = resolveTheme(settings)
  const rows = resolved[key] as Record<string, Row> & { lineStyled: { color: string; width: number; style: string } }
  for (const c of contexts) {
    const want = rows[c.name] as Row
    expect(oldFields(resolveLook(theme, c.args)), `${key} ${c.name} look`).toEqual(want.look)
    const line = resolveLine(theme, { depth: c.args.depth, branch: c.args.branch, style: c.args.style })
    expect({ color: line.color, width: line.width, style: line.style }, `${key} ${c.name} line`).toEqual(want.line)
    expect(accentFor(theme, c.args.branch), `${key} ${c.name} accent`).toBe(want.accent)
  }
  const styled = resolveLine(theme, { depth: 2, branch: 0, style: { lineWidth: 6, lineStyle: 'dashed' } })
  expect({ color: styled.color, width: styled.width, style: styled.style }).toEqual(rows.lineStyled)
}

describe('maps made before the theme rework look the same', () => {
  const ids = (golden.themes as { id: string }[]).map((t) => t.id)

  it('covers every theme that existed', () => {
    expect(ids).toHaveLength(26)
    for (const id of ids) expect(THEMES.some((t) => t.id === id), id).toBe(true)
  })

  it.each(ids)('built-in theme %s (rainbow on and off)', (id) => {
    check({ ...DEFAULT_SETTINGS, themeId: id, rainbow: true }, `${id}:rainbow`)
    check({ ...DEFAULT_SETTINGS, themeId: id, rainbow: false }, `${id}:single`)
  })

  it.each(ids)('a version 1 copy of %s saved inside an old map', (id) => {
    const v1 = (golden.themes as { id: string }[]).find((t) => t.id === id)
    // An old map stores the theme in its own settings, in the old shape, under the same id.
    const settings = readSettings({ themeId: id, customThemes: [v1] })
    expect(settings.customThemes[0]?.version).toBe(2)
    check({ ...settings, rainbow: true }, `${id}:rainbow`)
  })

  it('keeps a map’s own palette, background and hand-drawn overrides', () => {
    const settings = { ...DEFAULT_SETTINGS, themeId: 'ocean', palette: ['#111111', '#222222', '#333333'], background: { color: '#fafafa', pattern: 'grid' as const }, handDrawn: true }
    const theme = resolveTheme(settings)
    const want = resolved['ocean:custom'] as unknown as { look: unknown; bg: string; pattern: string; hand: boolean; accent: string }
    expect(oldFields(resolveLook(theme, { depth: 1, branch: 4, isRoot: false }))).toEqual(want.look)
    expect(theme.bg).toBe(want.bg)
    expect(theme.pattern).toBe(want.pattern)
    expect(theme.handDrawn).toBe(want.hand)
    expect(accentFor(theme, 5)).toBe(want.accent)
  })

  it('a map saved with none of the new settings opens with the defaults', () => {
    const old = readSettings({ layout: 'org:down', themeId: 'midnight', rainbow: false, palette: ['#112233'] })
    expect(old).toMatchObject({ layout: 'org:down', themeId: 'midnight', rainbow: false, palette: ['#112233'], colorSchemeId: null, branchThickness: null, taper: null })
  })
})
