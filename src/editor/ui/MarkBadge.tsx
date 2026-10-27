import { lazy, Suspense } from 'react'
import { Flag, Star, User } from 'lucide-react'
import { MARK_COLORS, SYMBOLS, parseMark, priorityColor, type ColorName } from '@/core/marks'
import { ARROW_ICONS, SYMBOL_ICONS } from '@/ui/icons'

const SYMBOL_COLORS = Object.values(MARK_COLORS)
const ClipartIcon = lazy(() => import('./ClipartIcon'))

/** A mark drawn as a small badge. */
export function MarkBadge({ mark, size = 18 }: { mark: string; size?: number }) {
  const m = parseMark(mark)
  if (!m) return null
  const box = { width: size, height: size }

  switch (m.kind) {
    case 'priority':
      return (
        <span
          role="img"
          aria-label={`Priority ${m.value}`}
          className="inline-grid shrink-0 place-items-center rounded-full font-bold leading-none text-white"
          style={{ ...box, background: priorityColor(Number(m.value)), fontSize: size * 0.58 }}
        >
          {m.value}
        </span>
      )
    case 'progress': {
      const pct = Number(m.value)
      const a = (pct / 100) * Math.PI * 2 - Math.PI / 2
      const x = 10 + 8 * Math.cos(a)
      const y = 10 + 8 * Math.sin(a)
      return (
        <svg role="img" aria-label={`Progress ${pct}%`} viewBox="0 0 20 20" className="shrink-0" {...box}>
          <circle cx="10" cy="10" r="8" fill="none" stroke="#2563eb" strokeWidth="1.6" />
          {pct === 100 ? (
            <>
              <circle cx="10" cy="10" r="8.6" fill="#16a34a" />
              <path d="M6 10.3l2.6 2.6L14 7.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </>
          ) : pct > 0 ? (
            <path d={`M10 10L10 2A8 8 0 ${pct > 50 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} fill="#2563eb" />
          ) : null}
        </svg>
      )
    }
    case 'emoji':
      return (
        <span role="img" aria-label="Emoji" className="inline-grid shrink-0 place-items-center leading-none" style={{ ...box, fontSize: size * 0.85 }}>
          {m.value}
        </span>
      )
    case 'portrait':
      return (
        <span role="img" aria-label={`Portrait, ${m.value}`} className="inline-grid shrink-0 place-items-center rounded-full text-white" style={{ ...box, background: MARK_COLORS[m.value as ColorName] }}>
          <User size={size * 0.62} strokeWidth={2.2} />
        </span>
      )
    case 'star':
      return <Star role="img" aria-label={`Star, ${m.value}`} size={size} fill={MARK_COLORS[m.value as ColorName]} stroke={MARK_COLORS[m.value as ColorName]} className="shrink-0" />
    case 'flag':
      return <Flag role="img" aria-label={`Flag, ${m.value}`} size={size} fill={MARK_COLORS[m.value as ColorName]} stroke={MARK_COLORS[m.value as ColorName]} className="shrink-0" />
    case 'arrow': {
      const A = ARROW_ICONS[m.value]
      return A ? (
        <span role="img" aria-label={`Arrow ${m.value}`} className="inline-grid shrink-0 place-items-center rounded-full text-white" style={{ ...box, background: '#e11d48' }}>
          <A size={size * 0.66} strokeWidth={2.6} />
        </span>
      ) : null
    }
    case 'symbol': {
      const S = SYMBOL_ICONS[m.value]
      const i = SYMBOLS.indexOf(m.value as (typeof SYMBOLS)[number])
      return S ? (
        <span role="img" aria-label={m.value} className="inline-grid shrink-0 place-items-center rounded-md text-white" style={{ ...box, background: SYMBOL_COLORS[Math.max(0, i) % SYMBOL_COLORS.length] }}>
          <S size={size * 0.66} strokeWidth={2.4} />
        </span>
      ) : null
    }
    case 'clipart': {
      const [name, color] = m.value.split(':')
      return (
        <span role="img" aria-label={`Clipart ${name}`} className="inline-grid shrink-0 place-items-center" style={box}>
          <Suspense fallback={<span style={box} />}>
            <ClipartIcon name={name as string} size={size} color={color} />
          </Suspense>
        </span>
      )
    }
  }
}
