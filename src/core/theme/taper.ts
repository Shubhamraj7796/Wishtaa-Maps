export interface Pt {
  x: number
  y: number
}

const f = (n: number) => Math.round(n * 100) / 100

/**
 * Turns an SVG path made of M, L, C and Q commands (all our branch paths) into points along it, `perSegment` points on
 * each curve. Pure maths, so branches can be thickened the same way on screen and in tests.
 */
export function samplePath(d: string, perSegment = 18): Pt[] {
  const tokens = d.match(/[MLCQ]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []
  const pts: Pt[] = []
  let i = 0
  let cmd = ''
  const read = () => Number(tokens[i++])
  while (i < tokens.length) {
    const t = tokens[i] as string
    if (/^[MLCQ]$/i.test(t)) {
      cmd = t.toUpperCase()
      i++
    }
    if (cmd === 'M' || cmd === 'L') {
      const p = { x: read(), y: read() }
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push(p)
      cmd = 'L'
    } else if (cmd === 'C' || cmd === 'Q') {
      const from = pts[pts.length - 1]
      if (!from) return pts
      const ctrl: Pt[] = cmd === 'C' ? [{ x: read(), y: read() }, { x: read(), y: read() }] : [{ x: read(), y: read() }]
      const to = { x: read(), y: read() }
      for (let s = 1; s <= perSegment; s++) {
        const u = s / perSegment
        const v = 1 - u
        if (ctrl.length === 2) {
          const [c1, c2] = ctrl as [Pt, Pt]
          pts.push({
            x: v * v * v * from.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * to.x,
            y: v * v * v * from.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * to.y,
          })
        } else {
          const [c1] = ctrl as [Pt]
          pts.push({ x: v * v * from.x + 2 * v * u * c1.x + u * u * to.x, y: v * v * from.y + 2 * v * u * c1.y + u * u * to.y })
        }
      }
    } else break
  }
  return pts
}

/** Length of a polyline. */
export function polylineLength(pts: Pt[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += Math.hypot((pts[i] as Pt).x - (pts[i - 1] as Pt).x, (pts[i] as Pt).y - (pts[i - 1] as Pt).y)
  return n
}

/** Width of a tapered stroke at distance `t` (0 to 1) along it: linear from `w0` to `w1`. */
export const widthAt = (t: number, w0: number, w1: number) => w0 + (w1 - w0) * Math.min(1, Math.max(0, t))

/** The two edges of a stroke that is `w0` thick at the start and `w1` at the end: points offset to each side of the centre line. */
export function taperEdges(pts: Pt[], w0: number, w1: number): { left: Pt[]; right: Pt[] } {
  const total = polylineLength(pts)
  const left: Pt[] = []
  const right: Pt[] = []
  if (pts.length < 2 || total === 0) return { left, right }
  let run = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as Pt
    const a = pts[Math.max(0, i - 1)] as Pt
    const b = pts[Math.min(pts.length - 1, i + 1)] as Pt
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    if (i > 0) run += Math.hypot(p.x - (pts[i - 1] as Pt).x, p.y - (pts[i - 1] as Pt).y)
    const half = widthAt(run / total, w0, w1) / 2
    const nx = -dy / len
    const ny = dx / len
    left.push({ x: p.x + nx * half, y: p.y + ny * half })
    right.push({ x: p.x - nx * half, y: p.y - ny * half })
  }
  return { left, right }
}

/**
 * A filled outline of a stroke that is `w0` thick at the start of the path and `w1` thick at the end (like a brush
 * stroke), with round ends. Fill it with the branch colour; there is no stroke.
 */
export function taperedOutline(pts: Pt[], w0: number, w1: number): string {
  const { left, right } = taperEdges(pts, w0, w1)
  if (!left.length) return ''
  const last = pts.length - 1
  const r0 = w0 / 2
  const r1 = w1 / 2
  const path = [`M${f((left[0] as Pt).x)} ${f((left[0] as Pt).y)}`]
  for (let i = 1; i <= last; i++) path.push(`L${f((left[i] as Pt).x)} ${f((left[i] as Pt).y)}`)
  // Round cap at the far end, then back along the other side, then a round cap at the start.
  path.push(`A${f(r1)} ${f(r1)} 0 0 1 ${f((right[last] as Pt).x)} ${f((right[last] as Pt).y)}`)
  for (let i = last - 1; i >= 0; i--) path.push(`L${f((right[i] as Pt).x)} ${f((right[i] as Pt).y)}`)
  path.push(`A${f(r0)} ${f(r0)} 0 0 1 ${f((left[0] as Pt).x)} ${f((left[0] as Pt).y)}Z`)
  return path.join('')
}

/** A branch path (SVG path text) as a tapered filled outline. */
export const taperedBranchPath = (d: string, w0: number, w1: number) => taperedOutline(samplePath(d), w0, w1)
