import { Icon } from '@/ui/icons'
import { TipButton } from '@/ui/IconButton'
import { useEditor } from '../store'
import { toggleList } from './state'

/**
 * The small notes icon of a topic, with the number of notes when there are several. It shows only when the topic has a note. A click
 * opens the topic's list of notes (a popover). The same button is used on the map and in the Outline.
 */
export function NotesChip({ id, className = '', size = 14, stop = false }: { id: string; className?: string; size?: number; stop?: boolean }) {
  const n = useEditor((s) => s.itemCounts[id]?.notes ?? 0)
  if (!n) return null
  const label = n === 1 ? 'Note' : `${n} notes`
  return (
    <TipButton
      tip={label}
      type="button"
      data-action
      data-notes-chip={id}
      aria-label={`${label}. Open the list`}
      aria-haspopup="menu"
      onClick={(e) => {
        if (stop) e.stopPropagation()
        toggleList('notes', id, e.currentTarget)
      }}
      className={`inline-flex items-center gap-0.5 rounded px-0.5 text-[10px] leading-none hover:bg-black/10 ${className}`}
    >
      <Icon name="notes" size={size} />
      {n > 1 && <span>{n}</span>}
    </TipButton>
  )
}
