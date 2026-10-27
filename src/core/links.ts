const TOPIC_LINK = /^#topic:[0-9a-f-]{8,40}$/i

export const topicLink = (id: string) => `#topic:${id}`

export function linkedTopicId(link: string | null | undefined): string | null {
  return link && TOPIC_LINK.test(link) ? link.slice('#topic:'.length) : null
}

/**
 * Cleans what a user typed into a link box. Allows http, https and mailto addresses and links to another topic;
 * anything else (javascript:, data:, file:...) is rejected. Bare domains get https://.
 */
export function normalizeLink(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (TOPIC_LINK.test(raw)) return raw
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(raw)) return raw
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname.includes('.')) return null
    return u.toString()
  } catch {
    return null
  }
}

export const isWebLink = (link: string | null | undefined): link is string => !!link && /^(https?:|mailto:)/i.test(link)
