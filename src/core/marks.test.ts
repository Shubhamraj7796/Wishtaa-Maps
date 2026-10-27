import { describe, expect, it } from 'vitest'
import { ARROWS, COLOR_NAMES, EMOJIS, PRIORITY_COUNT, PROGRESS_STEPS, SYMBOLS, countMarks, makeMark, parseMark, priorityColor, toggleMark } from './marks'
import { contrast } from './theme/color'

describe('marks', () => {
  it('round-trips every kind of mark', () => {
    for (let n = 1; n <= PRIORITY_COUNT; n++) expect(parseMark(makeMark('priority', n))).toEqual({ kind: 'priority', value: String(n) })
    for (const p of PROGRESS_STEPS) expect(parseMark(makeMark('progress', p))?.kind).toBe('progress')
    for (const e of EMOJIS) expect(parseMark(makeMark('emoji', e))?.kind).toBe('emoji')
    for (const c of COLOR_NAMES) {
      expect(parseMark(makeMark('portrait', c))?.kind).toBe('portrait')
      expect(parseMark(makeMark('star', c))?.kind).toBe('star')
      expect(parseMark(makeMark('flag', c))?.kind).toBe('flag')
    }
    for (const a of ARROWS) expect(parseMark(makeMark('arrow', a))?.kind).toBe('arrow')
    for (const s of SYMBOLS) expect(parseMark(makeMark('symbol', s))?.kind).toBe('symbol')
    expect(parseMark('c:rocket')?.kind).toBe('clipart')
    expect(parseMark('c:arrow-big-up:#aabbcc')?.value).toBe('arrow-big-up:#aabbcc')
  })

  it('offers 30 priorities, flags, stars, portraits, arrows and many symbols', () => {
    expect(PRIORITY_COUNT).toBe(30)
    expect(COLOR_NAMES.length).toBeGreaterThanOrEqual(6)
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(30)
    expect(EMOJIS.length).toBeGreaterThanOrEqual(40)
  })

  it('rejects anything that is not a known mark', () => {
    for (const bad of ['', 'x', 'p:0', 'p:31', 'p:abc', 'g:33', 'e:<script>', 'u:pink', 'a:sideways', 'y:nope', 'c:../../etc', 'c:Rocket', 'c:rocket:red', 'z:1', 42, null, undefined]) {
      expect(parseMark(bad)).toBeNull()
    }
  })

  it('keeps one priority and one progress per topic, and toggles others', () => {
    let m: string[] = []
    m = toggleMark(m, 'p:1')
    m = toggleMark(m, 'p:2')
    expect(m).toEqual(['p:2']) // replaced
    m = toggleMark(m, 'g:50')
    m = toggleMark(m, 'g:100')
    expect(m).toEqual(['p:2', 'g:100'])
    m = toggleMark(m, 'e:🔥')
    m = toggleMark(m, 's:red')
    expect(m).toEqual(['p:2', 'g:100', 'e:🔥', 's:red'])
    expect(toggleMark(m, 'e:🔥')).toEqual(['p:2', 'g:100', 's:red']) // click again removes
    expect(toggleMark(m, 'p:2')).toEqual(['g:100', 'e:🔥', 's:red'])
    expect(toggleMark(m, 'junk')).toEqual(m)
  })

  it('counts only valid marks (for layout)', () => {
    expect(countMarks(['p:1', 'junk', 'e:🔥'])).toBe(2)
    expect(countMarks(undefined)).toBe(0)
  })

  it('gives every priority a colour that is readable behind a white number', () => {
    const seen = new Set<string>()
    for (let n = 1; n <= PRIORITY_COUNT; n++) {
      const c = priorityColor(n)
      expect(c).toMatch(/^#[0-9a-f]{6}$/)
      expect(contrast('#ffffff', c), `priority ${n}`).toBeGreaterThanOrEqual(4.5)
      seen.add(c)
    }
    expect(seen.size).toBe(PRIORITY_COUNT)
  })
})
