import { useEffect, useId, useRef, useState } from 'react'
import { optsOfLook, shapeGeometry } from '@/core/shapes'
import { ShapePaint } from '@/ui/ShapePaint'
import type { Theme } from '@/core/theme/model'
import { asResolved, resolveLine, resolveLook, type Look, type ResolvedTheme } from '@/core/theme/resolve'
import { taperedBranchPath } from '@/core/theme/taper'

const W = 148
const H = 92

interface Node {
  x: number
  y: number
  w: number
  h: number
  depth: number
  branch: number
  root?: boolean
}

// A small fixed map: a central topic, three main topics and five sub topics.
const CENTRAL: Node = { x: 8, y: 33, w: 34, h: 26, depth: 0, branch: -1, root: true }
const MAINS: Node[] = [
  { x: 60, y: 11, w: 30, h: 13, depth: 1, branch: 0 },
  { x: 60, y: 39.5, w: 30, h: 13, depth: 1, branch: 1 },
  { x: 60, y: 68, w: 30, h: 13, depth: 1, branch: 2 },
]
const SUBS: { n: Node; parent: number }[] = [
  { parent: 0, n: { x: 108, y: 4, w: 32, h: 9, depth: 2, branch: 0 } },
  { parent: 0, n: { x: 108, y: 20, w: 32, h: 9, depth: 2, branch: 0 } },
  { parent: 1, n: { x: 108, y: 41.5, w: 32, h: 9, depth: 2, branch: 1 } },
  { parent: 2, n: { x: 108, y: 63, w: 32, h: 9, depth: 2, branch: 2 } },
  { parent: 2, n: { x: 108, y: 78, w: 32, h: 9, depth: 2, branch: 2 } },
]

/** One topic drawn as a small shape: the same geometry and painting the real topic gets, scaled down. */
function MiniShape({ n, look, id, uid }: { n: Node; look: Look; id: string; uid: string }) {
  const { x, y, w, h } = n
  const bw = Math.round(Math.max(0.8, Math.min(2, look.borderWidth * 0.6)) * 100) / 100
  const mini = { ...look, borderWidth: bw, ringWidth: 2.2, ringGap: 1.4 }
  const geo = shapeGeometry(look.shape, w, h, optsOfLook(mini))
  const cx = w / 2
  const cy = h / 2
  const bar = look.shape === 'doubleCircle' ? Math.min(w, h) * 0.5 : w * 0.55
  return (
    <g data-node={id} data-shape={look.shape} transform={`translate(${x} ${y})`}>
      <ShapePaint geo={geo} look={mini} uid={`${uid}-${id}`} />
      <rect x={cx - bar / 2} y={cy - 0.9} width={bar} height={1.8} rx={0.9} fill={look.text} opacity={0.75} />
    </g>
  )
}

function branchPath(from: Node, to: Node, line: ReturnType<typeof resolveLine>) {
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x
  const y2 = to.y + to.h / 2
  const m = (x2 - x1) / 2
  const w = line.curve === 'straight'
  const d = w ? `M${x1} ${y1}L${x2} ${y2}` : line.curve === 'elbow' || line.curve === 'roundedElbow' ? `M${x1} ${y1}L${x1 + m} ${y1}L${x1 + m} ${y2}L${x2} ${y2}` : `M${x1} ${y1}C${x1 + m} ${y1} ${x2 - m} ${y2} ${x2} ${y2}`
  const sw = Math.round(Math.max(0.8, Math.min(5.5, line.width * 0.6)) * 100) / 100
  return { d, sw, taper: line.taper }
}

/**
 * A live preview of a theme as a small SVG mini-map, drawn from the theme's own data (shapes, colours, branch thickness
 * and taper), so what the gallery shows is what the theme gives.
 */
export function ThemeThumb({ theme, label }: { theme: ResolvedTheme; label?: string }) {
  const uid = useId().replace(/:/g, '')
  const look = (n: Node) => resolveLook(theme, { depth: n.depth, branch: n.branch, isRoot: !!n.root })
  const line = (n: Node) => resolveLine(theme, { depth: n.depth, branch: n.branch })
  const edges: { key: string; from: Node; to: Node; depth: number; branch: number }[] = [
    ...MAINS.map((m, i) => ({ key: `m${i}`, from: CENTRAL, to: m, depth: 1, branch: m.branch })),
    ...SUBS.map((s, i) => ({ key: `s${i}`, from: MAINS[s.parent] as Node, to: s.n, depth: 2, branch: s.n.branch })),
  ]
  return (
    <svg role="img" aria-label={label ?? `${theme.name} preview`} viewBox={`0 0 ${W} ${H}`} className="block w-full" preserveAspectRatio="xMidYMid meet">
      <rect width={W} height={H} fill={theme.bg} />
      {edges.map((e) => {
        const l = line(e.to)
        const p = branchPath(e.from, e.to, l)
        return p.taper ? (
          <path key={e.key} d={taperedBranchPath(p.d, p.sw, Math.max(0.6, p.sw * 0.3))} fill={l.color} />
        ) : (
          <path key={e.key} d={p.d} fill="none" stroke={l.color} strokeWidth={p.sw} strokeLinecap="round" strokeLinejoin="round" />
        )
      })}
      <MiniShape n={CENTRAL} look={look(CENTRAL)} id="central" uid={uid} />
      {MAINS.map((m, i) => (
        <MiniShape key={i} n={m} look={look(m)} id={`main${i}`} uid={uid} />
      ))}
      {SUBS.map((s, i) => (
        <MiniShape key={i} n={s.n} look={look(s.n)} id={`sub${i}`} uid={uid} />
      ))}
    </svg>
  )
}

/** Renders the preview only once it scrolls into view (a gallery of 30 themes should not draw 30 previews at once). */
export function LazyThemeThumb({ theme, resolved }: { theme: Theme; resolved?: Partial<Pick<ResolvedTheme, 'palette' | 'rainbow'>> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen || !ref.current) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true)
        io.disconnect()
      }
    })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [seen])
  return (
    <div ref={ref} style={{ aspectRatio: `${W} / ${H}` }} className="overflow-hidden bg-bg">
      {seen && <ThemeThumb theme={asResolved(theme, resolved)} label={`${theme.name} preview`} />}
    </div>
  )
}
