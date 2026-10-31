import { usesBothSides } from '@/core/layout/catalog'
import type { BranchDirection } from '@/core/settings'
import * as A from '../actions'
import { useEditor } from '../store'

export const DIRECTION_LABEL: Record<BranchDirection, string> = { balanced: 'Balanced', clockwise: 'Clockwise', reverse: 'Reverse' }

/** What each choice does, in plain words (the tooltip). */
export const DIRECTION_HINT: Record<BranchDirection, string> = {
  balanced: 'Balanced: the first topics fill the right side and the rest go on the left, both reading top to bottom (the usual way).',
  clockwise: 'Clockwise: topics go down the right side, then up the left side, round the centre like a clock. The last topic is at the top left.',
  reverse: 'Reverse (anticlockwise): topics go down the left side, then up the right side. The last topic is at the top right.',
}

export { usesBothSides }

const BLOCK = { w: 10, h: 6 }
const ys = [4, 15, 26]
// An arrowhead at the end of a vertical line at x: pointing down (the line is read from the top) or up.
const line = (x: number, down: boolean) => (down ? `M${x} 6V30M${x - 2.6} 26.6L${x} 30L${x + 2.6} 26.6` : `M${x} 30V6M${x - 2.6} 9.4L${x} 6L${x + 2.6} 9.4`)

/**
 * A small picture of the choice: the central block in the middle, three topics on each side, and an arrow on each side showing
 * which way that side is read. Balanced reads both sides downwards; Clockwise goes down on the right and up on the left (round
 * the clock); Reverse is the other way round.
 */
export function DirectionThumb({ id, size = 56 }: { id: BranchDirection; size?: number }) {
  const rightDown = id !== 'reverse'
  const leftDown = id !== 'clockwise'
  return (
    <svg width={size} height={(size * 36) / 56} viewBox="0 0 56 36" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x={23} y={15} width={BLOCK.w} height={BLOCK.h} rx="1.6" fill="currentColor" />
      {ys.map((y) => (
        <g key={y}>
          <rect x={44} y={y} width={BLOCK.w} height={BLOCK.h} rx="1.6" />
          <rect x={2} y={y} width={BLOCK.w} height={BLOCK.h} rx="1.6" />
        </g>
      ))}
      <path d={line(40, rightDown)} />
      <path d={line(16, leftDown)} />
    </svg>
  )
}

const ORDER: BranchDirection[] = ['balanced', 'clockwise', 'reverse']

/** "Branch direction": three picture buttons. Shown only for the two-sided Mind map, and not while reading. */
export function BranchDirectionRow() {
  const current = useEditor((s) => s.settings.branchDirection)
  return (
    <div className="space-y-1" data-testid="branch-direction">
      <div className="text-sm">Branch direction</div>
      <div role="radiogroup" aria-label="Branch direction" className="flex gap-2">
        {ORDER.map((id) => {
          const on = current === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={DIRECTION_LABEL[id]}
              title={DIRECTION_HINT[id]}
              onClick={() => !on && A.setBranchDirection(id)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-ui border px-1 py-1.5 text-[11px] transition-colors ${on ? 'border-brand bg-brand/15 text-ink' : 'border-line text-muted hover:bg-bg hover:text-ink'}`}
            >
              <DirectionThumb id={id} size={44} />
              {DIRECTION_LABEL[id]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
