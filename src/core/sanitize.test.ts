// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { noteText, sanitizeNote } from './sanitize'

describe('sanitizeNote', () => {
  it('keeps basic formatting', () => {
    const html = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text</p><ul><li>one</li></ul>'
    expect(sanitizeNote(html)).toBe(html)
  })

  it('removes scripts, event handlers, iframes and styles', () => {
    const out = sanitizeNote('<p onclick="x()">hi</p><script>alert(1)</script><iframe src="https://evil.test"></iframe><img src=x onerror=alert(1)><style>*{display:none}</style>')
    expect(out).toBe('<p>hi</p>')
  })

  it('only allows safe link addresses and opens links safely', () => {
    const out = sanitizeNote('<a href="javascript:alert(1)">bad</a> <a href="https://ok.example/a">good</a> <a href="data:text/html;base64,AAAA">bad2</a>')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('data:')
    expect(out).toContain('href="https://ok.example/a"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
    expect(out).toContain('target="_blank"')
  })

  it('handles empty input', () => {
    expect(sanitizeNote('')).toBe('')
  })
})

describe('noteText', () => {
  it('turns a note into plain text for search', () => {
    expect(noteText('<h1>Hello</h1><p>big &amp; <strong>bold</strong></p><ul><li>a</li><li>b</li></ul>')).toBe('Hello big & bold a b')
    expect(noteText('<p>one</p><p>two</p>')).toBe('one two')
    expect(noteText('')).toBe('')
    expect(noteText(undefined)).toBe('')
  })
  it('does not let tag names match a search', () => {
    expect(noteText('<div class="x">plain</div>')).not.toContain('div')
  })
})
