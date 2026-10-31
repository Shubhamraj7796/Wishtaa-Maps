import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/ui/icons'
import { useBusyWhile } from '../panel/busy'

/**
 * A compact settings row: a label, and a button showing the current value (with a small picture) that opens a popover. On a
 * phone the popover is a sheet along the bottom. Esc closes it and puts focus back on the button. While it is open the
 * settings panel stays open (it counts as "busy").
 */
export function PopoverRow({
  label,
  thumb,
  value,
  children,
  wide,
  testId,
}: {
  label: string
  thumb?: React.ReactNode
  value: string
  children: (close: () => void) => React.ReactNode
  wide?: boolean
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; maxH: number } | null>(null)
  const labelId = useId()
  useBusyWhile(open)

  useLayoutEffect(() => {
    if (!open) return
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const w = box.current?.offsetWidth ?? (wide ? 360 : 300)
    const h = Math.min(box.current?.offsetHeight ?? 360, window.innerHeight - 16)
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))
    const below = r.bottom + 6
    const top = below + h <= window.innerHeight - 8 ? below : Math.max(8, Math.min(window.innerHeight - h - 8, r.top - h - 6))
    setPos({ left, top, maxH: window.innerHeight - 16 })
  }, [open, wide])

  useEffect(() => {
    if (!open) return
    const first = box.current?.querySelector<HTMLElement>('[aria-selected="true"],[aria-pressed="true"],button,input,select')
    first?.focus({ preventScroll: true })
  }, [open])

  const close = (restore = true) => {
    setOpen(false)
    if (restore) trigger.current?.focus()
  }

  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span id={labelId} className="shrink-0">
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
        aria-describedby={undefined}
        title={`${label}: ${value}`}
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-0 max-w-[13rem] items-center gap-2 rounded-ui border border-line bg-surface px-2 py-1 hover:bg-bg"
      >
        {thumb && <span className="shrink-0">{thumb}</span>}
        <span className="truncate">{value}</span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-muted" />
      </button>
      {open &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[60]" onPointerDown={() => close(false)} />
            <div
              ref={box}
              role="dialog"
              aria-label={label}
              data-no-wheel
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  close()
                }
              }}
              className={`fixed inset-x-0 bottom-0 z-[61] max-h-[80vh] overflow-y-auto rounded-t-ui border border-line bg-surface p-3 text-sm shadow-2xl sm:inset-x-auto sm:bottom-auto sm:rounded-ui ${wide ? 'sm:w-[22rem]' : 'sm:w-[19rem]'}`}
              style={pos && window.innerWidth >= 640 ? { left: pos.left, top: pos.top, maxHeight: pos.maxH } : undefined}
            >
              {children(() => close())}
            </div>
          </>,
          document.body
        )}
    </div>
  )
}
