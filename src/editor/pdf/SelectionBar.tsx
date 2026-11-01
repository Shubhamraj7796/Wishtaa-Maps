import { useEffect, useState } from 'react'
import { useEditor } from '../store'
import { readSelection, type PdfSelection } from './selection'
import { addPdfTopics } from './topics'

export const SOURCE_DRAG = 'application/x-wishtaa-source'

const act = 'h-9 rounded-ui border border-line bg-surface px-2.5 text-sm font-medium hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:px-3'

/**
 * Appears over the PDF when some text is selected: make it a topic, a sub-topic, or drag it onto the Outline. The selection is kept
 * when a button is pressed (the buttons do not take the focus), and the bar goes away when it is cleared.
 */
export function SelectionBar({ sourceId, root }: { sourceId: string; root: React.RefObject<HTMLElement> }) {
  const edits = useEditor((s) => s.pdf.pageEdits)
  const readOnly = useEditor((s) => s.readOnly)
  const [sel, setSel] = useState<PdfSelection | null>(null)
  const [perLine, setPerLine] = useState(false)

  useEffect(() => {
    let frame = 0
    const look = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setSel(readSelection(root.current, sourceId, edits)))
    }
    document.addEventListener('selectionchange', look)
    return () => {
      document.removeEventListener('selectionchange', look)
      cancelAnimationFrame(frame)
    }
  }, [root, sourceId, edits])

  if (!sel || readOnly) return null
  const done = (place: 'topic' | 'sub') => {
    addPdfTopics(sel, place, { perLine })
    window.getSelection()?.removeAllRanges()
    setSel(null)
  }
  const keep = (e: React.SyntheticEvent) => e.preventDefault()
  return (
    <div role="toolbar" aria-label="Use the selected text" className="absolute inset-x-2 bottom-2 z-10 flex flex-wrap items-center gap-1.5 rounded-ui border border-line bg-surface p-1.5 shadow-lg" onMouseDown={keep} onPointerDown={(e) => e.pointerType === 'mouse' && keep(e)}>
      <button type="button" className={act} onClick={() => done('topic')}>Add as topic</button>
      <button type="button" className={act} onClick={() => done('sub')}>Add as sub-topic</button>
      <label className="flex items-center gap-1 px-1 text-xs text-muted" title="Make a topic from each line of the selection">
        <input type="checkbox" checked={perLine} onChange={(e) => setPerLine(e.target.checked)} />
        One per line
      </label>
      <span
        draggable
        title="Drag onto a row of the Outline"
        className="ml-auto cursor-grab select-none rounded-ui border border-dashed border-line px-2 py-1 text-xs text-muted"
        onDragStart={(e) => {
          e.dataTransfer.setData(SOURCE_DRAG, JSON.stringify({ ...sel, perLine }))
          e.dataTransfer.setData('text/plain', sel.text)
          e.dataTransfer.effectAllowed = 'copy'
        }}
      >
        ⠿ Drag to Outline
      </span>
    </div>
  )
}
