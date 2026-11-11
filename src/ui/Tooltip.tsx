import { cloneElement, isValidElement, useEffect, useRef, useSyncExternalStore, type ReactElement, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'

/**
 * The one tooltip of the whole app. Every icon-only control uses it, so the name of a control is always one hover, one long-press or one
 * keyboard focus away, and it is never cut off by a menu or a panel (it is drawn in a layer of its own on the page, above everything).
 *
 *  - Mouse or pen hover: after HOVER_MS; at once when moving from one control to the next (within QUICK_MS).
 *  - Keyboard focus (focus-visible): at once. Escape, leaving, blurring, scrolling and resizing take it away.
 *  - Touch: a long press (LONG_PRESS_MS) shows it and does NOT run the control; a short tap runs the control as usual.
 * The control keeps its own `aria-label`: the tooltip is for people who can see it, the label is for everyone else.
 */
export const HOVER_MS = 500
export const QUICK_MS = 400
export const LONG_PRESS_MS = 450
export const TOUCH_HIDE_MS = 2500

export interface TipState {
  text: string
  keys?: string
  anchor: DOMRect
  el: Element
  at: number
}

let current: TipState | null = null
let lastShownAt = -Infinity
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
const snapshot = () => current

let hoverTimer = 0
let touchTimer = 0

function show(el: Element, text: string, keys: string | undefined) {
  window.clearTimeout(hoverTimer)
  current = { text, keys, anchor: el.getBoundingClientRect(), el, at: Date.now() }
  lastShownAt = Date.now()
  emit()
}

/** Takes the tooltip away (and any that is waiting to appear). */
export function hideTip() {
  window.clearTimeout(hoverTimer)
  window.clearTimeout(touchTimer)
  if (current) {
    lastShownAt = Date.now()
    current = null
    emit()
  }
}

/** For tests: forget everything. */
export function resetTips() {
  window.clearTimeout(hoverTimer)
  window.clearTimeout(touchTimer)
  current = null
  lastShownAt = -Infinity
  emit()
}

const prefersCoarse = (e: { pointerType?: string }) => e.pointerType === 'touch'

/** Where the tooltip goes: centred below the control, above it when there is no room below, and always inside the window. */
export function placeTip(anchor: { left: number; top: number; width: number; height: number }, size: { width: number; height: number }, view: { width: number; height: number }, gap = 8, margin = 6): { left: number; top: number; side: 'below' | 'above' } {
  const below = anchor.top + anchor.height + gap
  const above = anchor.top - gap - size.height
  const side = below + size.height + margin <= view.height || above < margin ? 'below' : 'above'
  const top = side === 'below' ? Math.min(below, Math.max(margin, view.height - size.height - margin)) : above
  const left = Math.min(Math.max(margin, anchor.left + anchor.width / 2 - size.width / 2), Math.max(margin, view.width - size.width - margin))
  return { left, top, side }
}

/** Mounted once, near the root of the app: draws the tooltip that is showing. */
export function TooltipLayer() {
  const tip = useSyncExternalStore(subscribe, snapshot, snapshot)
  const box = useRef<HTMLDivElement>(null)

  // Anything that makes the tooltip stale takes it away.
  useEffect(() => {
    if (!tip) return
    const away = () => hideTip()
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && hideTip()
    const down = (e: PointerEvent) => !(e.target as Element | null)?.closest?.('[data-tip-anchor]') && hideTip()
    window.addEventListener('scroll', away, true)
    window.addEventListener('resize', away)
    window.addEventListener('keydown', esc, true)
    window.addEventListener('pointerdown', down, true)
    // A control that was taken off the page (a menu that closed) cannot keep its tooltip.
    const watch = window.setInterval(() => !tip.el.isConnected && hideTip(), 250)
    return () => {
      window.removeEventListener('scroll', away, true)
      window.removeEventListener('resize', away)
      window.removeEventListener('keydown', esc, true)
      window.removeEventListener('pointerdown', down, true)
      window.clearInterval(watch)
    }
  }, [tip])

  if (!tip || typeof document === 'undefined') return null
  const size = { width: box.current?.offsetWidth ?? 120, height: box.current?.offsetHeight ?? 28 }
  const at = placeTip(tip.anchor, size, { width: window.innerWidth, height: window.innerHeight })
  return createPortal(
    <div
      ref={box}
      role="tooltip"
      data-tooltip
      data-side={at.side}
      className="pointer-events-none fixed z-[1000] max-w-[min(18rem,92vw)] rounded-md bg-ink px-2 py-1 text-xs font-medium leading-snug text-surface shadow-lg motion-safe:animate-[fadein_120ms_ease-out]"
      style={{ left: at.left, top: at.top }}
    >
      {tip.text}
      {tip.keys && <span className="ml-1.5 opacity-70">({tip.keys})</span>}
    </div>,
    document.body
  )
}

type Handlers = {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => void
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => void
  onFocus: (e: React.FocusEvent<HTMLElement>) => void
  onBlur: (e: React.FocusEvent<HTMLElement>) => void
  onClickCapture: (e: SyntheticEvent<HTMLElement>) => void
  onContextMenu: (e: React.MouseEvent<HTMLElement>) => void
  'data-tip-anchor': ''
}

/** The tooltip behaviour for one control: spread the result on the button (or use <Tooltip>). */
export function useTooltip(text: string, keys?: string): Handlers {
  // Whether the press that is going on turned into a long press (so the click that follows must not run the control).
  const longPressed = useRef(false)
  const touching = useRef(false)
  return {
    'data-tip-anchor': '',
    onPointerEnter: (e) => {
      if (prefersCoarse(e)) return
      const el = e.currentTarget
      window.clearTimeout(hoverTimer)
      const wait = Date.now() - lastShownAt < QUICK_MS ? 0 : HOVER_MS
      if (wait === 0) show(el, text, keys)
      else hoverTimer = window.setTimeout(() => show(el, text, keys), wait)
    },
    onPointerLeave: (e) => {
      if (prefersCoarse(e)) return
      hideTip()
    },
    onPointerDown: (e) => {
      longPressed.current = false
      if (!prefersCoarse(e)) {
        hideTip() // pressing a control runs it: the tooltip has done its job
        return
      }
      touching.current = true
      const el = e.currentTarget
      window.clearTimeout(touchTimer)
      touchTimer = window.setTimeout(() => {
        longPressed.current = true
        show(el, text, keys)
        touchTimer = window.setTimeout(hideTip, TOUCH_HIDE_MS)
      }, LONG_PRESS_MS)
    },
    onPointerUp: () => {
      window.clearTimeout(touchTimer)
      if (longPressed.current) touchTimer = window.setTimeout(hideTip, TOUCH_HIDE_MS)
    },
    onPointerCancel: () => {
      window.clearTimeout(touchTimer)
      touching.current = false
    },
    onFocus: (e) => {
      let visible = true
      try {
        visible = e.currentTarget.matches(':focus-visible')
      } catch {
        visible = true
      }
      if (visible) show(e.currentTarget, text, keys)
    },
    onBlur: () => hideTip(),
    onClickCapture: (e) => {
      // A long press only shows the name: it must not also press the control.
      if (longPressed.current) {
        longPressed.current = false
        e.preventDefault()
        e.stopPropagation()
      }
    },
    onContextMenu: (e) => {
      if (touching.current || longPressed.current) e.preventDefault() // the long press is ours, not the browser's menu
    },
  }
}

/** The same behaviour around any single element that can take the handlers (a button, a link, a swatch). */
export function Tooltip({ label, keys, children }: { label: string; keys?: string; children: ReactElement<Record<string, unknown>> }) {
  const handlers = useTooltip(label, keys)
  if (!isValidElement(children)) return children
  const own = children.props as Record<string, (e: never) => void>
  const merged: Record<string, unknown> = { ...handlers }
  for (const k of Object.keys(handlers) as (keyof Handlers)[]) {
    const mine = own[k]
    const ours = handlers[k] as unknown as (e: never) => void
    if (typeof mine === 'function') merged[k] = (e: never) => (ours(e), mine(e))
  }
  return cloneElement(children, merged)
}
