import { describe, expect, it } from 'vitest'
import { COMMANDS, chordOf, commandFor, isReservedChord } from './registry'

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

  it('maps the image shortcuts and lists image paste in the shortcut sheet', () => {
    expect(commandFor(ev('i'))?.id).toBe('selectImage')
    expect(commandFor(ev('ArrowRight', { shiftKey: true }))?.id).toBe('imgBigger')
    expect(commandFor(ev('ArrowUp', { shiftKey: true }))?.id).toBe('imgBigger')
    expect(commandFor(ev('ArrowLeft', { shiftKey: true }))?.id).toBe('imgSmaller')
    expect(commandFor(ev('ArrowDown', { shiftKey: true }))?.id).toBe('imgSmaller')
    // Plain arrows still navigate.
    expect(commandFor(ev('ArrowRight'))?.id).toBe('nav-right')
    const sheet = COMMANDS.filter((c) => c.hint === 'Ctrl+V').map((c) => c.label)
    expect(sheet.some((l) => /image/i.test(l))).toBe(true)
    expect(COMMANDS.find((c) => c.id === 'addImage')?.palette).not.toBe(false)
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

describe('"Copy with notes and tasks" is a command-palette entry only', () => {
  it('has no shortcut and no hint of its own; Ctrl+K still opens the palette and Ctrl+C still copies', () => {
    const c = COMMANDS.find((x) => x.id === 'copyItems')
    expect(c).toBeTruthy()
    expect(c?.keys).toBeUndefined()
    expect(c?.hint).toBeUndefined()
    expect(c?.palette).not.toBe(false) // it is in the palette
    expect(commandFor(ev('k', { ctrlKey: true }))?.id).toBe('palette')
    expect(commandFor(ev('c', { ctrlKey: true }))?.id).toBe('copy')
  })

  it('no command uses a reserved chord, and no chord belongs to two commands', () => {
    const seen = new Map<string, string>()
    for (const cmd of COMMANDS)
      for (const k of cmd.keys ?? []) {
        expect(isReservedChord(k), `${cmd.id} uses the reserved chord ${k}`).toBe(false)
        expect(seen.get(k), `${k} is used by ${seen.get(k)} and ${cmd.id}`).toBeUndefined()
        seen.set(k, cmd.id)
      }
  })
})
