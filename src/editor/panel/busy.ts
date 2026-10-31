import { useEffect } from 'react'
import { useEditor } from '../store'

/**
 * While this is true the settings panel will not close by itself: a dropdown, a colour picker or a gallery is open. Every
 * such component calls it with its open state, so the panel never disappears from under a popover.
 */
export function useBusyWhile(on: boolean) {
  useEffect(() => {
    if (!on) return
    useEditor.setState((s) => ({ panelBusy: s.panelBusy + 1 }))
    return () => useEditor.setState((s) => ({ panelBusy: Math.max(0, s.panelBusy - 1) }))
  }, [on])
}

/** True when the panel must stay put: something inside it is open, or the person is dragging or resizing. */
export function isPanelBusy(s: Pick<ReturnType<typeof useEditor.getState>, 'panelBusy' | 'imageLive' | 'widthLive' | 'dragging' | 'editingId'>): boolean {
  return s.panelBusy > 0 || s.imageLive !== null || s.widthLive !== null || s.dragging
}
