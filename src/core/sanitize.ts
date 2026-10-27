import DOMPurify from 'dompurify'

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'hr']

/** Rich-text notes are saved as HTML, so they are cleaned first: only basic formatting and safe links survive. */
export function sanitizeNote(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#)/i,
  })
  // Links open in a new tab without access to this page.
  return clean.replace(/<a\s/g, '<a target="_blank" rel="noopener noreferrer nofollow" ')
}

/** Plain text of a note (for search and "has a note" checks). */
export function noteText(html: string | undefined | null): string {
  if (!html) return ''
  return html
    .replace(/<\/(p|li|h[1-3]|blockquote|pre)>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
