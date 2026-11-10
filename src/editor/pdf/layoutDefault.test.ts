import { describe, expect, it } from 'vitest'
import { isWideScreen, loadDefaultLayout, resetDefaultLayout, saveDefaultLayout, startingLayout, WIDE_SCREEN } from './layoutDefault'

const store = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

describe('the starting layout of new PDFs', () => {
  it('is empty until a layout is chosen', () => {
    expect(loadDefaultLayout(store())).toEqual({})
  })

  it('remembers the layout fields and nothing else', () => {
    const s = store()
    saveDefaultLayout({ two: true, cover: true, fit: 'height', page: 9, zoom: 2 } as never, s)
    expect(loadDefaultLayout(s)).toEqual({ two: true, cover: true, fit: 'height' })
  })

  it('remembers the document colour and 1-page flipping; Light is the default and is not stored', () => {
    const s = store()
    saveDefaultLayout({ color: 'dark', flip1: true }, s)
    expect(loadDefaultLayout(s)).toEqual({ color: 'dark', flip1: true })
    saveDefaultLayout({ color: 'light' }, s)
    expect(loadDefaultLayout(s)).toEqual({})
    s.setItem('wishtaamaps:pdf-default-layout', '{"color":"neon","flip1":"yes"}')
    expect(loadDefaultLayout(s)).toEqual({})
  })

  it('ignores a damaged or odd value', () => {
    const s = store()
    s.setItem('wishtaamaps:pdf-default-layout', '{"two":"yes","fit":"huge","rtl":true}')
    expect(loadDefaultLayout(s)).toEqual({ rtl: true })
    s.setItem('wishtaamaps:pdf-default-layout', 'not json')
    expect(loadDefaultLayout(s)).toEqual({})
  })

  it('Reset forgets it', () => {
    const s = store()
    saveDefaultLayout({ two: true }, s)
    resetDefaultLayout(s)
    expect(loadDefaultLayout(s)).toEqual({})
  })

  it('is used only on a wide screen', () => {
    expect(WIDE_SCREEN).toBe(900)
    expect(isWideScreen(900)).toBe(true)
    expect(isWideScreen(899)).toBe(false)
    const s = store()
    saveDefaultLayout({ two: true }, s)
    expect(startingLayout(1366, s)).toEqual({ two: true })
    expect(startingLayout(600, s)).toEqual({})
  })
})
