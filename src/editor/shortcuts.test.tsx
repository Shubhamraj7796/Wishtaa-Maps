// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installKeyboard } from './keyboard'
import { COMMANDS, chordOf, commandFor, isReservedChord } from './registry'
import { useEditor } from './store'

/** A key press for a chord such as "Alt+Shift+Q" or "Ctrl+Z". */
function press(chord: string, target: EventTarget = window): { handled: boolean; prevented: boolean } {
  const parts = chord.split('+')
  const key = parts.pop() as string
  const init: KeyboardEventInit = {
    key: key.length === 1 ? key.toLowerCase() : key,
    code: key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key,
    ctrlKey: parts.includes('Ctrl'),
    altKey: parts.includes('Alt'),
    shiftKey: parts.includes('Shift'),
    cancelable: true,
    bubbles: true,
  }
  const e = new KeyboardEvent('keydown', init)
  target.dispatchEvent(e)
  return { handled: !!commandFor(e), prevented: e.defaultPrevented }
}

describe('every shortcut leaves the browser its own keys', () => {
  const chords = COMMANDS.flatMap((c) => (c.keys ?? []).map((k) => ({ id: c.id, chord: k })))

  it('no shortcut is a combination the browser keeps (reload, tabs, developer tools, history...) or uses Ctrl+Alt (AltGr)', () => {
    const bad = chords.filter((c) => isReservedChord(c.chord))
    expect(bad).toEqual([])
    expect(chords.filter((c) => /^Ctrl\+Alt/i.test(c.chord))).toEqual([])
  })

  it('no two commands share a chord', () => {
    const seen = new Map<string, string>()
    for (const c of chords) {
      const k = c.chord.toUpperCase()
      expect(seen.get(k), `${c.chord} is used by ${seen.get(k)} and ${c.id}`).toBeUndefined()
      seen.set(k, c.id)
    }
  })

  it('every one still works when pressed (the physical key counts under Alt, so Option+R on a Mac is Alt+R)', () => {
    for (const c of chords) {
      const e = new KeyboardEvent('keydown', {
        key: c.chord.endsWith('+') ? '+' : (c.chord.split('+').pop() as string),
        code: (() => {
          const k = c.chord.split('+').pop() as string
          return k.length === 1 ? (/\d/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`) : k
        })(),
        ctrlKey: /Ctrl/.test(c.chord),
        altKey: /Alt/.test(c.chord),
        shiftKey: /Shift/.test(c.chord) && !/^Ctrl\+\+$|\+\+$/.test(c.chord),
      })
      // Skip the two chords whose character itself needs Shift ("?" and "+"): they are matched by the character.
      if (['?', 'Ctrl++'].includes(c.chord)) continue
      expect(chordOf(e).toUpperCase(), c.id).toBe(c.chord.toUpperCase())
    }
  })

  it('the browser combinations are never handled, whatever is pressed', () => {
    for (const chord of ['Ctrl+R', 'Ctrl+Shift+R', 'F5', 'Ctrl+F5', 'Ctrl+T', 'Ctrl+W', 'Ctrl+N', 'Ctrl+Shift+N', 'Ctrl+L', 'Ctrl+TAB', 'Ctrl+1', 'Alt+1', 'Ctrl+Shift+I', 'Ctrl+Shift+J', 'Ctrl+Shift+C', 'Ctrl+Shift+DELETE', 'Ctrl+Alt+R', 'Ctrl+Alt+I']) {
      expect(isReservedChord(chord), chord).toBe(true)
    }
  })
})

describe('shortcuts wait while typing, in a dialog, or while a topic is being edited', () => {
  let off = () => undefined as void
  beforeEach(() => {
    off = installKeyboard()
    useEditor.setState({ editingId: null, readOnly: false })
  })
  afterEach(() => {
    off()
    cleanup()
    document.body.innerHTML = ''
    useEditor.setState({ editingId: null })
  })

  const readMode = () => useEditor.getState().readOnly

  it('Alt+R works on the page', async () => {
    const e = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(e)
    await new Promise((r) => setTimeout(r, 30))
    expect(e.defaultPrevented).toBe(true) // it was ours
  })

  it('does nothing in a text box, a text area or an editable topic', () => {
    for (const make of [() => document.createElement('input'), () => document.createElement('textarea'), () => Object.assign(document.createElement('div'), { contentEditable: 'true' })]) {
      const el = make()
      document.body.appendChild(el)
      if (el instanceof HTMLDivElement) Object.defineProperty(el, 'isContentEditable', { value: true })
      const e = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true, cancelable: true })
      el.dispatchEvent(e)
      expect(e.defaultPrevented).toBe(false)
    }
    expect(readMode()).toBe(false)
  })

  it('does nothing inside a dialog (except Escape, which still closes things)', () => {
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    const button = document.createElement('button')
    dialog.appendChild(button)
    document.body.appendChild(dialog)
    const e = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true, cancelable: true })
    button.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    const esc = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
    button.dispatchEvent(esc)
    expect(esc.defaultPrevented).toBe(true)
  })

  it('does nothing while a topic is being edited', () => {
    useEditor.setState({ editingId: 'x' })
    const e = new KeyboardEvent('keydown', { key: 'r', code: 'KeyR', altKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  it('never calls preventDefault on Ctrl+R or Ctrl+Shift+R', () => {
    const spy = vi.fn()
    for (const init of [{ ctrlKey: true }, { ctrlKey: true, shiftKey: true }, { metaKey: true }, { metaKey: true, shiftKey: true }]) {
      const e = new KeyboardEvent('keydown', { key: 'R', code: 'KeyR', bubbles: true, cancelable: true, ...init })
      e.preventDefault = spy
      window.dispatchEvent(e)
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('press() helper agrees', () => {
    expect(press('Ctrl+Shift+R').handled).toBe(false)
    expect(press('Ctrl+R').handled).toBe(false)
  })
})

