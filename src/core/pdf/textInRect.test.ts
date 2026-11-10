import { describe, expect, it } from 'vitest'
import { textInRect, type PageLines } from './text'

const page = (lines: PageLines['lines']): PageLines => ({ page: 1, w: 600, h: 800, lines })
const line = (text: string, x: number, y: number, w = 200, h = 12) => ({ text, x, y, w, h })
const rect = { x: 0.1, y: 0.25, w: 0.5, h: 0.25 } // x 60..360, y 200..400

describe('the text inside a capture rectangle', () => {
  it('takes the lines whose middle is inside, in reading order, and leaves the rest', () => {
    const p = page([line('Above the box', 70, 100), line('First line inside', 70, 210), line('Second line inside', 70, 230), line('Below the box', 70, 600)])
    expect(textInRect(p, rect)).toBe('First line inside Second line inside')
  })

  it('leaves out a line that is mostly outside the rectangle sideways', () => {
    const p = page([line('Inside', 70, 210), line('Mostly to the right', 340, 230, 200)])
    expect(textInRect(p, rect)).toBe('Inside')
    expect(textInRect(page([line('Just poking in', 300, 210, 200)]), rect)).toBe('') // under half of its width is inside
  })

  it('mends a hyphenated line break and gives nothing for a scan (no text)', () => {
    expect(textInRect(page([line('Absorp-', 70, 210), line('tion of light', 70, 230)]), rect)).toBe('Absorption of light')
    expect(textInRect(page([]), rect)).toBe('')
    expect(textInRect({ page: 1, w: 0, h: 0, lines: [line('x', 0, 0)] }, rect)).toBe('')
  })

  it('shortens a very long selection', () => {
    const long = Array.from({ length: 30 }, (_, i) => line(`Sentence number ${i} of a long paragraph.`, 70, 205 + i * 5, 250, 4))
    const text = textInRect(page(long), { x: 0, y: 0, w: 1, h: 1 }, 100)
    expect(text.length).toBeLessThanOrEqual(100)
    expect(text.endsWith('…')).toBe(true)
  })
})
