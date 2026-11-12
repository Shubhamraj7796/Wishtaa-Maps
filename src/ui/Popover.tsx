import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeTip } from './Tooltip'

/**
 * A small popover under a button, drawn in a layer of its own on the page (a portal), so a bar, a menu or a panel never clips it. It flips
 * above the button when there is no room below, stays inside the window, and closes with Escape (the focus goes back to the button), an
 * outside press, Tab, a scroll or resize that moves the button, or the button leaving the page. The arrow keys move between its items
 * (anything with role="menuitem" or role="button"); the first one has the focus when it opens, so Enter chooses it.
 */
export function Popover({ anchor, onClose, label, children, className = '' }: { anchor: HTMLElement; onClose: () => void; label: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  // Measured once it is on the page, then placed under the button.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const p = placeTip(anchor.getBoundingClientRect(), { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, 6, 8)
    setAt({ left: p.left, top: p.top })
  }, [anchor])
  // The first choice takes the focus once the popover is visible (a hidden element cannot be focused).
  const placed = at !== null
  useLayoutEffect(() => {
    if (placed) (box.current?.querySelector<HTMLElement>('[data-autofocus]') ?? box.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])'))?.focus()
  }, [placed])

  useEffect(() => {
    const items = () => [...(box.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled]), [role="menuitemradio"]:not([disabled]), [role="menuitemcheckbox"]:not([disabled])') ?? [])]
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (box.current?.contains(t) || anchor.contains(t)) return
      close.current()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation() // closes this and nothing else (not the panel behind it)
        close.current()
        anchor.focus()
        return
      }
      if (e.key === 'Tab') return close.current()
      const move = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!move) return
      const list = items()
      if (!list.length) return
      e.preventDefault()
      const at = list.indexOf(document.activeElement as HTMLElement)
      list[(at + move + list.length) % list.length]?.focus()
    }
    const moved = () => {
      const r = anchor.getBoundingClientRect()
      if (!anchor.isConnected) return close.current()
      // The button moved (the panel was resized, collapsed or scrolled under it): the popover would be in the wrong place.
      if (Math.abs(r.top - start.top) > 1 || Math.abs(r.left - start.left) > 1) close.current()
    }
    const start = anchor.getBoundingClientRect()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key, true)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    const watch = window.setInterval(moved, 300)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', moved)
      window.clearInterval(watch)
    }
  }, [anchor])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div ref={box} role="menu" aria-label={label} data-popover className={`fixed z-[900] max-w-[92vw] rounded-ui border border-line bg-surface p-1 text-ink shadow-xl ${className}`} style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? 'visible' : 'hidden' }}>
      {children}
    </div>,
    document.body
  )
}
