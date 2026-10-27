import type { Decor, LaidOut, SceneEdge, Side } from '@/core/layout/types'
import { mix } from '@/core/theme/color'
import type { Pattern } from '@/core/theme/themes'

export interface Pt {
  x: number
  y: number
}

/** Point on a box where a connector attaches. */
export function anchor(b: LaidOut, side: Side, dx?: number, fromRight?: boolean): Pt {
  const topBottomX = dx === undefined ? b.x + b.w / 2 : fromRight ? b.x + b.w - dx : b.x + dx
  switch (side) {
    case 'l':
      return { x: b.x, y: b.y + b.h / 2 }
    case 'r':
      return { x: b.x + b.w, y: b.y + b.h / 2 }
    case 't':
      return { x: topBottomX, y: b.y }
    case 'b':
      return { x: topBottomX, y: b.y + b.h }
    default:
      return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
  }
}

const f = (n: number) => Math.round(n * 100) / 100

/** Polyline with rounded corners. */
export function roundedPolyline(pts: Pt[], radius: number): string {
  if (pts.length < 2) return ''
  const first = pts[0] as Pt
  let d = `M${f(first.x)} ${f(first.y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1] as Pt
    const v = pts[i] as Pt
    const n = pts[i + 1] as Pt
    const l1 = Math.hypot(v.x - p.x, v.y - p.y)
    const l2 = Math.hypot(n.x - v.x, n.y - v.y)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    if (r < 0.5) {
      d += `L${f(v.x)} ${f(v.y)}`
      continue
    }
    const a = { x: v.x + ((p.x - v.x) / l1) * r, y: v.y + ((p.y - v.y) / l1) * r }
    const b = { x: v.x + ((n.x - v.x) / l2) * r, y: v.y + ((n.y - v.y) / l2) * r }
    d += `L${f(a.x)} ${f(a.y)}Q${f(v.x)} ${f(v.y)} ${f(b.x)} ${f(b.y)}`
  }
  const last = pts[pts.length - 1] as Pt
  return d + `L${f(last.x)} ${f(last.y)}`
}

const horizontal = (s: Side) => s === 'l' || s === 'r'
const vertical = (s: Side) => s === 't' || s === 'b'

/** SVG path between two topics for the given connector style. */
export function edgePath(a: LaidOut, b: LaidOut, e: SceneEdge): string {
  const p1 = anchor(a, e.fromSide, e.fromDx, e.dxFromRight)
  const p2 = anchor(b, e.toSide)
  if (e.kind === 'straight' || e.fromSide === 'c' || e.toSide === 'c') return `M${f(p1.x)} ${f(p1.y)}L${f(p2.x)} ${f(p2.y)}`

  if (e.kind === 'curve') {
    if (horizontal(e.fromSide) && horizontal(e.toSide)) {
      const m = (p2.x - p1.x) / 2
      return `M${f(p1.x)} ${f(p1.y)}C${f(p1.x + m)} ${f(p1.y)} ${f(p2.x - m)} ${f(p2.y)} ${f(p2.x)} ${f(p2.y)}`
    }
    if (vertical(e.fromSide) && vertical(e.toSide)) {
      const m = (p2.y - p1.y) / 2
      return `M${f(p1.x)} ${f(p1.y)}C${f(p1.x)} ${f(p1.y + m)} ${f(p2.x)} ${f(p2.y - m)} ${f(p2.x)} ${f(p2.y)}`
    }
    return vertical(e.fromSide)
      ? `M${f(p1.x)} ${f(p1.y)}Q${f(p1.x)} ${f(p2.y)} ${f(p2.x)} ${f(p2.y)}`
      : `M${f(p1.x)} ${f(p1.y)}Q${f(p2.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)}`
  }

  // elbow
  const r = 10
  if (horizontal(e.fromSide) && horizontal(e.toSide)) {
    const mx = (p1.x + p2.x) / 2
    return roundedPolyline([p1, { x: mx, y: p1.y }, { x: mx, y: p2.y }, p2], r)
  }
  if (vertical(e.fromSide) && vertical(e.toSide)) {
    const my = (p1.y + p2.y) / 2
    return roundedPolyline([p1, { x: p1.x, y: my }, { x: p2.x, y: my }, p2], r)
  }
  return vertical(e.fromSide)
    ? roundedPolyline([p1, { x: p1.x, y: p2.y }, p2], r)
    : roundedPolyline([p1, { x: p2.x, y: p1.y }, p2], r)
}

/** Curly brace grouping a parent's children (bracket map). */
export function bracePath(d: Extract<Decor, { kind: 'brace' }>): string {
  const dir = d.dir === 'r' ? 1 : -1
  const gap = Math.abs(d.x1 - d.x0)
  const xb = d.x0 + dir * gap * 0.45
  const tipX = xb - dir * 12
  const parts: string[] = [`M${f(d.x0)} ${f(d.ym)}L${f(tipX)} ${f(d.ym)}`]
  if (d.y1 - d.y0 > 8) {
    const r = Math.min(14, (d.y1 - d.y0) / 4)
    const end = 8 * dir
    parts.push(
      `M${f(xb + end)} ${f(d.y0)}Q${f(xb)} ${f(d.y0)} ${f(xb)} ${f(d.y0 + r)}L${f(xb)} ${f(d.ym - r)}Q${f(xb)} ${f(d.ym)} ${f(tipX)} ${f(d.ym)}`,
      `M${f(tipX)} ${f(d.ym)}Q${f(xb)} ${f(d.ym)} ${f(xb)} ${f(d.ym + r)}L${f(xb)} ${f(d.y1 - r)}Q${f(xb)} ${f(d.y1)} ${f(xb + end)} ${f(d.y1)}`
    )
    d.ys.forEach((y) => parts.push(`M${f(xb + (y === d.y0 || y === d.y1 ? end : 0))} ${f(y)}L${f(d.x1)} ${f(y)}`))
  } else {
    parts.push(`M${f(tipX)} ${f(d.ym)}L${f(d.x1)} ${f(d.ys[0] ?? d.ym)}`)
  }
  return parts.join('')
}

/** One slice of a ring (sector map). */
export function wedgePath(d: Extract<Decor, { kind: 'wedge' }>): string {
  const p = (r: number, a: number) => `${f(d.cx + r * Math.cos(a))} ${f(d.cy + r * Math.sin(a))}`
  const large = d.a1 - d.a0 > Math.PI ? 1 : 0
  return `M${p(d.r0, d.a0)}L${p(d.r1, d.a0)}A${f(d.r1)} ${f(d.r1)} 0 ${large} 1 ${p(d.r1, d.a1)}L${p(d.r0, d.a1)}A${f(d.r0)} ${f(d.r0)} 0 ${large} 0 ${p(d.r0, d.a0)}Z`
}

/** CSS background for the canvas pattern, scaled with the zoom. */
export function patternStyle(pattern: Pattern, bg: string, ink: string, k: number): React.CSSProperties {
  const line = mix(ink, bg, 0.13)
  const s = 24 * k
  switch (pattern) {
    case 'dots':
      return { backgroundImage: `radial-gradient(${line} 1.2px, transparent 1.2px)`, backgroundSize: `${s}px ${s}px` }
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: `${s}px ${s}px`,
      }
    case 'lines':
      return { backgroundImage: `linear-gradient(${line} 1px, transparent 1px)`, backgroundSize: `100% ${s}px` }
    case 'cross':
      return {
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px), radial-gradient(${line} 2px, transparent 2px)`,
        backgroundSize: `${s * 2}px ${s * 2}px, ${s * 2}px ${s * 2}px, ${s}px ${s}px`,
      }
    default:
      return {}
  }
}
