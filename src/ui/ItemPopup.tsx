import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

/**
 * The popup a note or a task is written in. One shell for both, so they behave the same: centred on a computer or tablet, a full-screen
 * sheet on a phone (under 640 px); the keyboard stays inside it (Tab goes round); Escape or a press on the dim background closes it
 * (what was typed is saved by the content, which autosaves); the focus goes back to where it was; the map behind it keeps its keys
 * (the role "dialog" makes the global shortcuts wait). A small popover opened inside it (a menu, a date) takes Escape first.
 *
 * `header` is the title area (a title field, for example). Mark the control that should have the focus first with `data-autofocus`.
 */
export type PopupSize = 'normal' | 'wide' | 'full'
/** The window classes for each size. Under 640 px every size is the full-screen sheet; from 640 px: normal and wide are centred, full fills the window. */
const SIZE_CLASS: Record<PopupSize, string> = {
  normal: 'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-h-[86vh] sm:min-h-[320px] sm:w-[min(640px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-ui sm:border sm:border-line',
  wide: 'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[86vh] sm:max-h-[86vh] sm:w-[min(1040px,96vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-ui sm:border sm:border-line',
  full: 'sm:inset-0',
}

export function ItemPopup({ label, header, actions, children, onClose, size = 'normal', wide = false }: { label: string; header?: ReactNode; actions?: ReactNode; children: ReactNode; onClose: () => void; size?: PopupSize; wide?: boolean }) {
  const kind: PopupSize = wide && size === 'normal' ? 'wide' : size
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null))

  // The first control that asks for it takes the focus (otherwise the Close button), and the focus goes back on closing.
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>('[data-close]')
    first?.focus()
    const from = opener.current
    return () => {
      if (from && from.isConnected) from.focus()
    }
  }, [])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = panel.current
      if (!el) return
      if (e.key === 'Escape') {
        if (document.querySelector('[data-popover]')) return // a popover inside the popup closes first
        e.preventDefault()
        e.stopImmediatePropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab' || !el.contains(document.activeElement)) return
      const list = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest('[hidden], [aria-hidden="true"]'))
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      data-item-popup-backdrop
      className="fixed inset-0 z-[800] bg-black/40"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close.current()
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-item-popup
        data-popup-size={kind}
        className={`absolute inset-0 flex flex-col overflow-hidden bg-surface text-ink shadow-2xl ${SIZE_CLASS[kind]}`}
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
          <div className="min-w-0 flex-1">{header}</div>
          {actions}
          <IconButton icon="close" label="Close" data-close onClick={() => close.current()} className="[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>,
    document.body
  )
}
