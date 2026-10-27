import { describe, expect, it } from 'vitest'
import { isWebLink, linkedTopicId, normalizeLink, topicLink } from './links'

describe('links', () => {
  it('accepts web addresses and fills in https', () => {
    expect(normalizeLink('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(normalizeLink('http://example.com')).toBe('http://example.com/')
    expect(normalizeLink('example.com/page')).toBe('https://example.com/page')
    expect(normalizeLink('  www.wishtaa.com  ')).toBe('https://www.wishtaa.com/')
  })

  it('accepts mail links and links to another topic', () => {
    expect(normalizeLink('mailto:me@example.com')).toBe('mailto:me@example.com')
    const id = '123e4567-e89b-12d3-a456-426614174000'
    expect(normalizeLink(topicLink(id))).toBe(`#topic:${id}`)
    expect(linkedTopicId(`#topic:${id}`)).toBe(id)
    expect(linkedTopicId('https://example.com')).toBeNull()
    expect(linkedTopicId(null)).toBeNull()
  })

  it('rejects dangerous or meaningless input', () => {
    for (const bad of ['', '   ', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://x.com', 'vbscript:x', 'not a link', 'localhost', '#topic:<script>', 'mailto:bad']) {
      expect(normalizeLink(bad), bad).toBeNull()
    }
  })

  it('tells web links from topic links', () => {
    expect(isWebLink('https://a.com')).toBe(true)
    expect(isWebLink('mailto:a@b.co')).toBe(true)
    expect(isWebLink('#topic:abc12345')).toBe(false)
    expect(isWebLink(null)).toBe(false)
  })
})
