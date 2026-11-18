import { useEffect, useLayoutEffect, useState } from 'react'
import { useEditor } from '../store'

/**
 * How far from the right edge of the window the side panel reaches, in px (0 when it is not showing, or when it is a bottom sheet: under
 * 768 px wide). A popup uses it to stay beside the panel instead of over it, so the Notes list stays in view while a note is written.
 * It follows the real panel (a floating or a pinned one, the settings panel or the Read mode details panel) and is re-measured while it
 * opens, closes or the window changes.
 */
export function usePanelInset(): number {
  const settingsOpen = useEditor((s) => s.panelOpen)
  const readOpen = useEditor((s) => s.readPanelOpen)
  const [inset, setInset] = useState(0)
  const measure = () => {
    const wide = window.matchMedia?.('(min-width: 768px)').matches ?? false
    const el = document.querySelector('#settings-panel, #read-panel')
    if (!wide || !el) return setInset(0)
    const r = el.getBoundingClientRect()
    setInset(r.width > 0 ? Math.max(0, Math.round(window.innerWidth - r.left)) : 0)
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
  return inset
}
