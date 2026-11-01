import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTouchFriendly } from '../pictures/touch'
import { placeMenu, SHEET_BELOW, type MenuPlacement } from './placeMenu'
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

  const touch = useTouchFriendly()
  const [place, setPlace] = useState<MenuPlacement | null>(null)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < SHEET_BELOW)
  const sheet = touch || narrow

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [open, place])

  // Measured after it is drawn (at its natural height), then placed so that all of it is inside the window, above everything.
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      setNarrow(window.innerWidth < SHEET_BELOW)
      const el = ref.current
      const anchor = document.querySelector('[aria-haspopup="menu"][aria-label^="Insert"]')?.getBoundingClientRect()
      if (!el) return
      const natural = { width: el.scrollWidth, height: el.scrollHeight }
      setPlace(placeMenu(anchor ? { left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height } : { left: 8, top: 0, width: 0, height: 44 }, natural, { width: window.innerWidth, height: window.innerHeight }))
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, sheet])

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
    by('insertPdf', 'pdf', 'PDF from this device…'),
    by('insertPdfDrive', 'pdf', 'PDF from Google Drive…'),
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
  const style: React.CSSProperties = sheet
    ? { left: 0, right: 0, bottom: 0, maxHeight: '75vh', paddingBottom: 'env(safe-area-inset-bottom)' }
    : place
      ? { left: place.left, top: place.top, maxHeight: place.maxHeight, width: 256 }
      : { left: 0, top: 0, width: 256, visibility: 'hidden' }
  return createPortal(
    <>
      <div className={`fixed inset-0 z-[90] ${sheet ? 'bg-black/30' : ''}`} onPointerDown={() => toggleInsert(false)} />
      <div
        ref={ref}
        role="menu"
        aria-label="Insert"
        data-insert-menu={sheet ? 'sheet' : 'popover'}
        className={`fixed z-[91] overflow-y-auto overscroll-contain border border-line bg-surface py-1 shadow-xl ${sheet ? 'rounded-t-2xl' : 'rounded-ui'}`}
        style={style}
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
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand/15 focus:bg-brand/15 [@media(pointer:coarse)]:min-h-11"
            >
              <Icon name={it.icon} size={18} />
              <span className="flex-1">{it.label}</span>
              {it.checked && <Icon name="check" size={15} />}
              {it.keys && <kbd className="font-mono text-[11px] text-muted">{it.keys}</kbd>}
            </button>
          )
        )}
      </div>
    </>,
    document.body
  )
}
