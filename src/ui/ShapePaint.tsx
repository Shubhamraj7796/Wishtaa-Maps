import type { FillKind, FillPattern, LineStyle, Shape } from '@/core/model/types'
import { optsOfLook, shapeGeometry, type Geometry } from '@/core/shapes'
import type { Look } from '@/core/theme/resolve'

/** What the painting of a shape needs from a topic's look. */
export type PaintLook = Pick<Look, 'fill' | 'fill2' | 'fillKind' | 'pattern' | 'border' | 'borderWidth' | 'borderDash' | 'ringColor' | 'innerFill'> & { fillOpacity?: number }

/** Dash pattern for a border: the topic's choice, else the shape's own (dashed and dotted boxes). */
export function dashFor(choice: LineStyle, own: string | undefined, bw: number): string | undefined {
  if (choice === 'dashed') return `${6 + bw * 1.5} ${4 + bw}`
  if (choice === 'dotted') return `1 ${3 + bw * 1.5}`
  return own
}

const none = (c: string) => (c === 'transparent' ? 'none' : c)

function PatternDefs({ uid, kind, look }: { uid: string; kind: FillKind; look: PaintLook }) {
  if (kind === 'gradient') {
    return (
      <linearGradient id={`${uid}-g`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={look.fill} />
        <stop offset="1" stopColor={look.fill2} />
      </linearGradient>
    )
  }
  if (kind === 'pattern') {
    const ink = look.fill2
    const p: FillPattern = look.pattern
    return (
      <pattern id={`${uid}-p`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill={look.fill} />
        {p === 'dots' && <circle cx="4" cy="4" r="1.3" fill={ink} />}
        {p === 'stripes' && <path d="M-1 9L9 -1M-1 5L5 -1M3 9L9 3" stroke={ink} strokeWidth="1.3" />}
        {p === 'grid' && <path d="M0 0.5H8M0.5 0V8" stroke={ink} strokeWidth="1" />}
        {p === 'cross' && <path d="M4 1.5V6.5M1.5 4H6.5" stroke={ink} strokeWidth="1.2" strokeLinecap="round" />}
      </pattern>
    )
  }
  return null
}

/**
 * The painted layers of a shape: filling (solid, gradient or pattern), border (any dash), double border, ring and inner
 * circle. Used for topics on the canvas, the shape picker and the theme previews, so they always match.
 */
export function ShapePaint({ geo, look, uid }: { geo: Geometry; look: PaintLook; uid: string }) {
  const kind = look.fill === 'transparent' ? 'none' : look.fillKind
  const fill = kind === 'none' ? 'none' : kind === 'gradient' ? `url(#${uid}-g)` : kind === 'pattern' ? `url(#${uid}-p)` : look.fill
  const bw = look.borderWidth
  const stroke = bw > 0 ? look.border : 'none'
  const fo = look.fillOpacity !== undefined && look.fillOpacity < 1 ? look.fillOpacity : undefined
  return (
    <>
      <defs>
        <PatternDefs uid={uid} kind={kind} look={look} />
      </defs>
      {geo.layers.map((l, i) => {
        const dash = dashFor(look.borderDash, l.dash, bw)
        switch (l.kind) {
          case 'body':
            return <path key={i} d={l.d} fill={fill} fillOpacity={fo} stroke={stroke} strokeWidth={bw} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
          case 'fillOnly':
            return <path key={i} d={l.d} fill={fill} fillOpacity={fo} stroke="none" />
          case 'stroke':
            return <path key={i} d={l.d} fill="none" stroke={stroke} strokeWidth={bw} strokeDasharray={dash} strokeLinecap="round" strokeLinejoin="round" />
          case 'ring':
            return <path key={i} d={l.d} fill={none(look.ringColor)} fillOpacity={fo} fillRule={l.evenodd ? 'evenodd' : 'nonzero'} />
          default:
            return <path key={i} d={l.d} fill={none(look.innerFill)} fillOpacity={fo} />
        }
      })}
    </>
  )
}

/** A shape on its own, as an SVG sized `w` by `h`. */
export function ShapeSvg({ uid, shape, w, h, look, ringWidth, ringGap, corner, cornerPx, className, style }: { uid: string; shape: Shape; w: number; h: number; look: Look; ringWidth?: number; ringGap?: number; corner?: Look['corner']; cornerPx?: number | null; className?: string; style?: React.CSSProperties }) {
  const geo = shapeGeometry(shape, w, h, optsOfLook({ ...look, ringWidth: ringWidth ?? look.ringWidth, ringGap: ringGap ?? look.ringGap, corner: corner ?? look.corner, cornerPx: cornerPx ?? look.cornerPx }))
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={className} style={style} aria-hidden="true" focusable="false">
      <ShapePaint geo={geo} look={look} uid={uid} />
    </svg>
  )
}
