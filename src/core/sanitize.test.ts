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

describe('checklists in notes', () => {
  // What the editor stores (TipTap's task list, with the box and the wrappers left out).
  const LIST = '<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><p>Order stock</p></li><li data-checked="true" data-type="taskItem"><p>Call supplier</p></li></ul>'

  it('is kept by the cleaner with its ticks; a live input, script or handler is not', () => {
    expect(sanitizeNote(LIST)).toBe(LIST)
    const out = sanitizeNote('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked onclick="x()"><span></span></label><div><p onclick="y()">Item</p></div><script>alert(1)</script></li></ul>')
    expect(out).not.toMatch(/input|script|onclick|<label|<div/)
    expect(out).toContain('data-checked="true"')
    expect(out).toContain('<p>Item</p>')
  })

  it('reads as text with [ ] and [x], in either attribute order, nested too', () => {
    expect(noteText(LIST)).toBe('[ ] Order stock [x] Call supplier')
    expect(noteText('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>a</p></li></ul>')).toBe('[x] a')
    expect(noteText('<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><p>parent</p><ul data-type="taskList"><li data-checked="true" data-type="taskItem"><p>child</p></li></ul></li></ul>')).toBe('[ ] parent [x] child')
  })

  it('a checklist with no words in it is an empty note, and notes without a checklist read exactly as before', () => {
    expect(noteText('<ul data-type="taskList"><li data-checked="false" data-type="taskItem"><p></p></li></ul>')).toBe('')
    expect(noteText('<p>[x] typed by hand</p>')).toBe('[x] typed by hand')
    expect(noteText('<p>[x]</p>')).toBe('[x]')
    expect(noteText('<h2>Title</h2><p>Some <strong>bold</strong> text</p><ul><li>one</li><li>two</li></ul>')).toBe('Title Some bold text one two')
  })

  it('an older note is untouched by the cleaner (no checklist markup, no change)', () => {
    const old = '<h2>Title</h2><p>Some <strong>bold</strong> and <em>italic</em> text <a target="_blank" rel="noopener noreferrer nofollow" href="https://example.com">link</a></p><ol><li>one</li></ol><blockquote>q</blockquote>'
    expect(sanitizeNote(old)).toBe(old)
  })
})
