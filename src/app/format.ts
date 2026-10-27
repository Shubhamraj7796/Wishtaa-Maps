const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 days ago", then a date. */
export function timeAgo(then: number, now: number = Date.now()): string {
  const d = now - then
  if (d < 45_000) return 'Just now'
  if (d < HOUR) return `${Math.max(1, Math.round(d / MINUTE))} min ago`
  if (d < DAY) return `${Math.round(d / HOUR)} h ago`
  const days = Math.floor(d / DAY)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(then).toLocaleDateString([], { day: 'numeric', month: 'short', year: new Date(then).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' })
}

export function fileSize(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
