import { useEffect, useState } from 'react'
import { useSettings, type TouchControls } from '@/stores/settings'

const query = (q: string) => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q).matches : false)

/**
 * Touch-friendly controls are decided by the device, not by the width of the window: a tablet or phone asking for the
 * "Desktop site" is still a touch screen, with no hover. A preference can force it on or off.
 */
export function isTouchFriendly(pref: TouchControls = useSettings.getState().touchControls): boolean {
  if (pref === 'on') return true
  if (pref === 'off') return false
  return query('(pointer: coarse)') || query('(hover: none)')
}

export function useTouchFriendly(): boolean {
  const pref = useSettings((s) => s.touchControls)
  const [touch, setTouch] = useState(() => isTouchFriendly(pref))
  useEffect(() => {
    setTouch(isTouchFriendly(pref))
    if (!window.matchMedia) return
    const lists = ['(pointer: coarse)', '(hover: none)'].map((q) => window.matchMedia(q))
    const on = () => setTouch(isTouchFriendly(pref))
    lists.forEach((m) => m.addEventListener?.('change', on))
    return () => lists.forEach((m) => m.removeEventListener?.('change', on))
  }, [pref])
  return touch
}

/** Smallest tap target (px) on a touch screen. */
export const TOUCH_TARGET = 44
