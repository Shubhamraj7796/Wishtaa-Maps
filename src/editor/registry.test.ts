import { describe, expect, it } from 'vitest'
import { COMMANDS, chordOf, commandFor } from './registry'

const ev = (key: string, mods: Partial<KeyboardEventInit> = {}) => ({ key, ...mods }) as KeyboardEvent

describe('shortcuts', () => {
  it('normalises chords', () => {
    expect(chordOf(ev('Tab'))).toBe('Tab')
    expect(chordOf(ev('z', { ctrlKey: true }))).toBe('Ctrl+Z')
    expect(chordOf(ev('Z', { ctrlKey: true, shiftKey: true }))).toBe('Ctrl+Shift+Z')
    expect(chordOf(ev('?', { shiftKey: true }))).toBe('?')
    expect(chordOf(ev('ArrowUp', { altKey: true }))).toBe('Alt+ArrowUp')
    expect(chordOf(ev('k', { metaKey: true }))).toBe('Ctrl+K')
  })

  it('maps the documented keys to commands', () => {
    expect(commandFor(ev('Tab'))?.id).toBe('child')
    expect(commandFor(ev('Enter'))?.id).toBe('sibling')
    expect(commandFor(ev('Delete'))?.id).toBe('delete')
    expect(commandFor(ev('F2'))?.id).toBe('rename')
    expect(commandFor(ev('ArrowUp', { altKey: true }))?.id).toBe('up')
    expect(commandFor(ev('y', { ctrlKey: true }))?.id).toBe('redo')
    expect(commandFor(ev('z', { ctrlKey: true, shiftKey: true }))?.id).toBe('redo')
    expect(commandFor(ev('k', { ctrlKey: true }))?.id).toBe('palette')
    expect(commandFor(ev('?', { shiftKey: true }))?.id).toBe('help')
    expect(commandFor(ev('q'))).toBeUndefined()
  })

  it('has no chord bound to two commands', () => {
    const seen = new Set<string>()
    for (const c of COMMANDS)
      for (const k of c.keys ?? []) {
        expect(seen.has(k.toUpperCase())).toBe(false)
        seen.add(k.toUpperCase())
      }
  })
})
