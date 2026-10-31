export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** `amount` of `a` mixed into `b` (0 = all b, 1 = all a). */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(br + (ar - br) * amount, bg + (ag - bg) * amount, bb + (ab - bb) * amount)
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** WCAG AA asks 4.5:1 for normal text and 3:1 for large text (18 px and up, or 14 px and up in bold). */
export const AA_NORMAL = 4.5
export const AA_LARGE = 3

export const isLargeText = (fontSize: number, fontWeight = 400) => fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700)

export interface ContrastReport {
  ratio: number
  /** Passes WCAG AA for this text size. */
  ok: boolean
  /** A colour that does pass, when the current one does not (the closest of white, soft black, black). */
  suggestion: string | null
}

/** How readable `text` is on `bg`, and a readable alternative when it is not. */
export function contrastReport(text: string, bg: string, large = false): ContrastReport {
  const ratio = Math.round(contrast(text, bg) * 100) / 100
  const ok = ratio >= (large ? AA_LARGE : AA_NORMAL)
  return { ratio, ok, suggestion: ok ? null : readableText(bg) }
}

/** `#rrggbb` from what a person may type: `abc`, `#abc`, `AABBCC`, with or without the `#`. Null when it is not a colour. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(v)) return `#${v.split('').map((c) => c + c).join('').toLowerCase()}`
  if (/^[0-9a-f]{6}$/i.test(v)) return `#${v.toLowerCase()}`
  return null
}

/** White, soft black or pure black: whichever reads best (always at least 4.5:1) on `bg`. */
export function readableText(bg: string): string {
  if (contrast('#ffffff', bg) >= 4.5) return '#ffffff'
  if (contrast('#111827', bg) >= 4.5) return '#111827'
  return '#000000'
}
