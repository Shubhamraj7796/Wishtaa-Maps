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

/** The opening tag of a checklist item (TipTap's task item): `<li data-checked="true" data-type="taskItem">`, in either attribute order. */
const TASK_ITEM = /<li\b[^>]*\bdata-type="taskItem"[^>]*>/gi

/**
 * Plain text of a note (for search, the notes list, and the outline copy). A checklist item reads as "[ ] text" or "[x] text", so the
 * state is not lost in text; a note with no checklist reads exactly as before.
 */
export function noteText(html: string | undefined | null): string {
  if (!html) return ''
  let items = false
  const text = html
    .replace(TASK_ITEM, (tag) => {
      items = true
      return /data-checked="true"/i.test(tag) ? '[x] ' : '[ ] '
    })
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
  // A checklist whose items have no words in them is an empty note, not a note that says "[ ]".
  return items && text.replace(/\[[ x]\]/g, '').trim() === '' ? '' : text
}
