import { PRIORITIES } from '@/core/model/tasks'
import { ICON_BOX, SELECTED, UNSELECTED } from '@/ui/iconSize'
import { TipButton } from '@/ui/IconButton'

/** Priority 1 (highest) to 5 as five numbered tiles (a number is the clearest symbol for it). The chosen one is highlighted; pressing it again clears it. */
export function PriorityTiles({ value, onChange, disabled = false, label = 'Priority' }: { value: number | null; onChange: (p: number | null) => void; disabled?: boolean; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {PRIORITIES.map((p) => (
        <TipButton
          key={p}
          type="button"
          role="radio"
          aria-checked={value === p}
          aria-label={`Priority ${p}${p === 1 ? ' (highest)' : p === 5 ? ' (lowest)' : ''}`}
          tip={`Priority ${p}${p === 1 ? ' (highest)' : p === 5 ? ' (lowest)' : ''}`}
          data-priority={p}
          disabled={disabled}
          onClick={() => onChange(value === p ? null : p)}
          className={`grid select-none place-items-center rounded-ui text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${ICON_BOX} ${value === p ? SELECTED : UNSELECTED}`}
        >
          {p}
        </TipButton>
      ))}
    </div>
  )
}
