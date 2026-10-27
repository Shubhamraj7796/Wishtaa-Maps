/** Removes control characters (tabs, line breaks, escapes...) from text. */
export function stripControl(s: string): string {
  return Array.from(s)
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
    .join('')
}
