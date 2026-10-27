import { useEffect, useRef, type ReactNode } from 'react'
import { X } from './icons'

/** A centered dialog: closes on Escape or a click outside, keeps focus inside, returns focus when closed. */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const node = ref.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea, button:not([data-close])')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Tab' && node) {
        const items = [...node.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex="0"]')]
        if (!items.length) return
        const firstEl = items[0] as HTMLElement
        const last = items[items.length - 1] as HTMLElement
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      before?.focus?.()
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-ui border border-line bg-surface p-5 shadow-2xl ${wide ? 'max-w-2xl' : 'max-w-md'}`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" title="Close" className="grid h-8 w-8 place-items-center rounded-ui hover:bg-bg">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export const buttonPrimary =
  'inline-flex items-center justify-center gap-2 rounded-ui bg-brand px-3.5 py-2 text-sm font-semibold text-brand-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50'
export const buttonSecondary =
  'inline-flex items-center justify-center gap-2 rounded-ui border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50'
export const buttonDanger =
  'inline-flex items-center justify-center gap-2 rounded-ui bg-bad px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50'
