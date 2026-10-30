/**
 * MindMaster / EdrawMind colours are written `#AARRGGBB` (alpha first). Returns `#rrggbb`, or null when the value is
 * missing, unreadable or fully transparent.
 */
export function parseEmmxColor(value: string | undefined | null): string | null {
  if (!value) return null
  const v = value.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{8}$/.test(v)) {
    if (parseInt(v.slice(0, 2), 16) === 0) return null
    return `#${v.slice(2).toLowerCase()}`
  }
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toLowerCase()}`
  return null
}
