import { useEffect, useRef } from 'react'
import { Icon, type IconName } from '@/ui/icons'
import { cmdAddFloating } from '../actions'
import { toggleInsert, toggleNumbering } from '../content'
import { commandById, displayKeys } from '../registry'
import { useEditor } from '../store'

interface Item {
  icon: IconName
  label: string
  keys?: string
  run: () => void
  checked?: boolean
}

/** Everything that can be put into a map, each with its icon and shortcut. */
export function InsertMenu() {
  const open = useEditor((s) => s.insertOpen)
  const numbering = useEditor((s) => s.settings.numbering)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open])

  if (!open) return null
  const by = (id: string, icon: IconName, label: string): Item => {
    const cmd = commandById(id)
    return { icon, label, keys: cmd ? displayKeys(cmd) : undefined, run: () => cmd?.run() }
  }
  const items: (Item | 'sep')[] = [
    by('mark', 'mark', 'Mark'),
    by('clipart', 'clipart', 'Clipart'),
    by('addImage', 'image', 'Picture…'),
    'sep',
    by('notes', 'notes', 'Notes'),
    by('inlineNote', 'inlineNote', 'Short note'),
    by('tag', 'tag', 'Tag'),
    by('task', 'task', 'Task'),
    by('link', 'link', 'Hyperlink'),
    by('attachment', 'attachment', 'Attachment'),
    'sep',
    by('latex', 'latex', 'Formula (LaTeX)'),
    by('table', 'table', 'Table'),
    { icon: 'numbering', label: 'Branch numbers', run: toggleNumbering, checked: numbering },
    'sep',
    { icon: 'floating', label: 'Floating topic', run: () => cmdAddFloating() },
  ]
  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    e.preventDefault()
    const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = btns.indexOf(document.activeElement as HTMLButtonElement)
    btns[(i + dir + btns.length) % btns.length]?.focus()
  }
  return (
    <>
      <div className="fixed inset-0 z-30" onPointerDown={() => toggleInsert(false)} />
      <div
        ref={ref}
        role="menu"
        aria-label="Insert"
        className="absolute left-0 top-full z-40 mt-1 w-64 rounded-ui border border-line bg-surface py-1 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') move(e, 1)
          else if (e.key === 'ArrowUp') move(e, -1)
          else if (e.key === 'Escape') toggleInsert(false)
        }}
      >
        {items.map((it, i) =>
          it === 'sep' ? (
            <div key={`s${i}`} role="separator" className="my-1 h-px bg-line" />
          ) : (
            <button
              key={it.label}
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={it.checked}
              onClick={() => {
                toggleInsert(false)
                it.run()
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand/15 focus:bg-brand/15"
            >
              <Icon name={it.icon} size={18} />
              <span className="flex-1">{it.label}</span>
              {it.checked && <Icon name="check" size={15} />}
              {it.keys && <kbd className="font-mono text-[11px] text-muted">{it.keys}</kbd>}
            </button>
          )
        )}
      </div>
    </>
  )
}
