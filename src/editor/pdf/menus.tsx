import { useEffect } from 'react'

/** The small drop-down menus of the PDF panel's top bar. */
export const btn = 'grid h-8 min-w-8 shrink-0 place-items-center rounded px-1.5 text-sm hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'

export function Menu({ children, onClose, right, label }: { children: React.ReactNode; onClose: () => void; right?: boolean; label?: string }) {
  // Escape closes the menu first and does nothing else (Capture, Focus and the size keep their own Escape for next time).
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])
  return (
    <>
      <div className="fixed inset-0 z-40" onPointerDown={onClose} />
      <div role="menu" aria-label={label} data-pdf-menu className={`absolute top-full z-50 mt-1 max-h-[75vh] min-w-56 max-w-[min(20rem,80vw)] overflow-y-auto rounded-ui border border-line bg-surface py-1 text-sm shadow-xl ${right ? 'right-0' : 'left-0'}`}>
        {children}
      </div>
    </>
  )
}

const item = 'block w-full px-3 py-2 text-left hover:bg-brand/15 [@media(pointer:coarse)]:min-h-11'

export function MenuItem({ children, onClick, active, danger }: { children: React.ReactNode; onClick: () => void; active?: boolean; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`${item} ${active ? 'bg-brand/10 font-semibold' : ''} ${danger ? 'text-bad' : ''}`}>
      {children}
    </button>
  )
}

/** A menu row that is switched on or off (the menu stays open so the effect can be seen). */
export function MenuCheck({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className={`${item} flex items-center gap-2`}>
      <span aria-hidden="true" className="w-4 text-brand">{on ? '✓' : ''}</span>
      {children}
    </button>
  )
}
