import { useEffect, useRef, useState } from 'react'
import { IconTile } from '@/ui/IconButton'
import type { IconName } from '@/ui/icons'
import { Tooltip } from '@/ui/Tooltip'
import { useEditor, type CaptureMode } from '../store'
import { beginPickTarget, cancelPickTarget, leaveCapture, setCaptureKeep, setCaptureMode, setCaptureOption, setCaptureTarget, topicLabel } from './capture'

const MODES: { id: CaptureMode; label: string; icon: IconName }[] = [
  { id: 'sub', label: 'Sub-topic', icon: 'subTopic' },
  { id: 'sibling', label: 'Next sibling', icon: 'siblingAfter' },
  { id: 'branch', label: 'New branch', icon: 'newBranch' },
]

/**
 * The bar shown while Capture area is on: where captures go ("Into"), how ("Add as"), and whether capture stays on. Every capture makes a
 * NEW topic; nothing here can change an existing picture. The target is pinned when capture starts and moves only with "Change".
 */
export function CaptureBar() {
  const cap = useEditor((s) => s.pdfPanel.capture)
  const label = useEditor(() => topicLabel(cap.targetId))
  const [menu, setMenu] = useState(false)
  const menuOpen = useRef(false)
  menuOpen.current = menu

  // Escape: first cancels "Change", then ends capture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement | null)?.closest?.('textarea,select,[contenteditable="true"],input:not([type="checkbox"]):not([type="radio"])') || document.querySelector('[role="dialog"][aria-modal="true"]') || document.querySelector('[data-view-menu],[data-pdf-menu]')) return // an open menu closes first
      e.preventDefault()
      e.stopImmediatePropagation()
      if (menuOpen.current) setMenu(false)
      else if (useEditor.getState().pdfPanel.capture.picking) cancelPickTarget()
      else leaveCapture()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // "Change": the next topic chosen in the map or the Outline is the new target.
  useEffect(() => {
    if (!cap.picking) return
    return useEditor.subscribe((s, prev) => {
      const chosen = s.selected[s.selected.length - 1]
      if (chosen && chosen !== prev.selected[prev.selected.length - 1]) setCaptureTarget(chosen)
    })
  }, [cap.picking])

  return (
    <div data-capture-bar role="group" aria-label="Capture settings" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-2 py-1.5 text-xs">
      {cap.picking ? (
        <span role="status" className="font-medium text-brand">
          Choose a topic in the map or the Outline… <button type="button" className="ml-1 underline" onClick={cancelPickTarget}>Cancel (Esc)</button>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-muted">Into:</span>
          <Tooltip label={label}>
            <b data-capture-into className="max-w-[14rem] truncate">{label}</b>
          </Tooltip>
          <button type="button" className="rounded border border-line px-1.5 py-0.5 hover:bg-bg [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3" onClick={beginPickTarget}>
            Change
          </button>
        </span>
      )}
      <span role="radiogroup" aria-label="Add as" className="flex items-center gap-1">
        <span className="text-muted">Add as:</span>
        {MODES.map((m) => (
          <IconTile key={m.id} role="radio" icon={m.icon} label={m.label} selected={cap.mode === m.id} onClick={() => setCaptureMode(m.id)} />
        ))}
      </span>
      <IconTile role="checkbox" icon="repeat" label="Keep capturing" selected={cap.keep} onClick={() => setCaptureKeep(!cap.keep)} />
      <span className="relative">
        <IconTile icon="more" label="More capture options" aria-haspopup="true" aria-expanded={menu} selected={menu} onClick={() => setMenu(!menu)} />
        {menu && (
          <div data-capture-menu role="group" aria-label="Topic titles" className="absolute left-0 top-full z-50 mt-1 w-64 rounded-ui border border-line bg-surface p-2 text-xs shadow-xl">
            <p className="mb-1 font-semibold">Give the new topic a title</p>
            <label className="flex items-start gap-1.5 py-1 [@media(pointer:coarse)]:min-h-11">
              <input type="checkbox" className="mt-0.5" checked={cap.nameFromPage} onChange={(e) => setCaptureOption('nameFromPage', e.target.checked)} />
              <span>Name the topic from the page <span className="text-muted">(for example "Audit may 24, p. 3")</span></span>
            </label>
            <label className="flex items-start gap-1.5 py-1 [@media(pointer:coarse)]:min-h-11">
              <input type="checkbox" className="mt-0.5" checked={cap.textAsTitle} onChange={(e) => setCaptureOption('textAsTitle', e.target.checked)} />
              <span>Add the text inside the rectangle as the title <span className="text-muted">(when the PDF has text; otherwise no title)</span></span>
            </label>
            <p className="mt-1 text-muted">Both are off by default and remembered on this device.</p>
          </div>
        )}
      </span>
      <span className="text-muted">Drag a rectangle on a page. Each one becomes a new topic.</span>
    </div>
  )
}
