import { useEffect, useLayoutEffect, useState } from 'react'
import { useEditor } from '../store'

export interface PanelBox {
  /** How far from the right edge of the window the side panel reaches (0 when it is not showing, or is a bottom sheet). */
  right: number
  /** How tall the bottom sheet is, measured from the bottom edge (0 when the panel is beside the map, or not showing). */
  bottom: number
}

/**
 * Where the side panel is, in px from the window edges: beside the map on the right (768 px wide or more), or a bottom sheet (narrower).
 * A popup uses `right` to stay beside the panel instead of over it, so the Notes list stays in view while a note is written; the tray of
 * minimized notes uses `bottom` to stay above a bottom sheet. It follows the real panel (floating or pinned, the settings panel or the Read
 * mode details panel) and is re-measured while it opens, closes or the window changes.
 */
export function usePanelBox(): PanelBox {
  const settingsOpen = useEditor((s) => s.panelOpen)
  const readOpen = useEditor((s) => s.readPanelOpen)
  const [box, setBox] = useState<PanelBox>({ right: 0, bottom: 0 })
  const measure = () => {
    const wide = window.matchMedia?.('(min-width: 768px)').matches ?? false
    const el = document.querySelector('#settings-panel, #read-panel')
    const r = el?.getBoundingClientRect()
    const next: PanelBox = !el || !r || r.width <= 0 || r.height <= 0 ? { right: 0, bottom: 0 } : wide ? { right: Math.max(0, Math.round(window.innerWidth - r.left)), bottom: 0 } : { right: 0, bottom: Math.max(0, Math.round(window.innerHeight - r.top)) }
    setBox((b) => (b.right === next.right && b.bottom === next.bottom ? b : next))
  }
  useLayoutEffect(measure, [settingsOpen, readOpen])
  useEffect(() => {
    const id = window.setInterval(measure, 200)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
    }
  }, [])
  return box
}

/** The width the side panel takes on the right (see `usePanelBox`). */
export const usePanelInset = (): number => usePanelBox().right
