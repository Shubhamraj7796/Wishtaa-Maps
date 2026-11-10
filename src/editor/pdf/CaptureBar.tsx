import { useEffect } from 'react'
import { useEditor, type CaptureMode } from '../store'
import { beginPickTarget, cancelPickTarget, leaveCapture, setCaptureKeep, setCaptureMode, setCaptureTarget, topicLabel } from './capture'

const MODES: { id: CaptureMode; label: string; hint: string }[] = [
  { id: 'sub', label: 'Sub-topic', hint: 'A new sub-topic after the existing ones' },
  { id: 'sibling', label: 'Next sibling', hint: 'A new topic next to the target, in capture order' },
  { id: 'branch', label: 'New branch', hint: 'A new branch from the central topic' },
]

/**
 * The bar shown while Capture area is on: where captures go ("Into"), how ("Add as"), and whether capture stays on. Every capture makes a
 * NEW topic; nothing here can change an existing picture. The target is pinned when capture starts and moves only with "Change".
 */
export function CaptureBar() {
  const cap = useEditor((s) => s.pdfPanel.capture)
  const label = useEditor(() => topicLabel(cap.targetId))

  // Escape: first cancels "Change", then ends capture.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement | null)?.closest?.('input,textarea,select,[contenteditable="true"]') || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (useEditor.getState().pdfPanel.capture.picking) cancelPickTarget()
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

  const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-xs [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3 ${on ? 'border-brand bg-brand/15 font-semibold text-ink' : 'border-line hover:bg-bg'}`
  return (
    <div data-capture-bar role="group" aria-label="Capture settings" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-2 py-1.5 text-xs">
      {cap.picking ? (
        <span role="status" className="font-medium text-brand">
          Choose a topic in the map or the Outline… <button type="button" className="ml-1 underline" onClick={cancelPickTarget}>Cancel (Esc)</button>
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-muted">Into:</span>
          <b data-capture-into className="max-w-[14rem] truncate" title={label}>{label}</b>
          <button type="button" className="rounded border border-line px-1.5 py-0.5 hover:bg-bg [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3" onClick={beginPickTarget}>
            Change
          </button>
        </span>
      )}
      <span role="radiogroup" aria-label="Add as" className="flex items-center gap-1">
        <span className="text-muted">Add as:</span>
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={cap.mode === m.id} title={m.hint} className={chip(cap.mode === m.id)} onClick={() => setCaptureMode(m.id)}>
            {m.label}
          </button>
        ))}
      </span>
      <label className="flex items-center gap-1.5 [@media(pointer:coarse)]:min-h-11">
        <input type="checkbox" checked={cap.keep} onChange={(e) => setCaptureKeep(e.target.checked)} />
        Keep capturing
      </label>
      <span className="text-muted">Drag a rectangle on a page. Each one becomes a new topic.</span>
    </div>
  )
}
