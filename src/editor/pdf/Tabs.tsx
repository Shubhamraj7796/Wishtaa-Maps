import { useEffect, useState } from 'react'
import { Icon } from '@/ui/icons'
import { useEditor } from '../store'
import { closePdfTab, focusPdfPane, openPdfTab, reorderPdfTab, splitPdf, unsplitPdf } from './actions'
import { OpenPdfButton } from './OpenPdf'

export const TAB_TYPE = 'application/x-wishtaa-pdf-tab'

/**
 * The tab strip: every PDF open in this map. Click to show, x to close the tab (the PDF stays in the map), drag to reorder, and drop a
 * tab on the left or right half of the PDF area to split (see Panes). "+" opens another PDF, with a Recent PDFs list.
 */
export function Tabs() {
  const tabs = useEditor((s) => s.pdfPanel.tabs)
  const sources = useEditor((s) => s.pdf.sources)
  const active = useEditor((s) => s.pdfPanel.sourceId)
  const other = useEditor((s) => s.pdfPanel.other)
  const readOnly = useEditor((s) => s.readOnly)
  const [over, setOver] = useState<number | null>(null)
  if (!tabs.length) return null

  const dropAt = (e: React.DragEvent, index: number) => {
    const id = e.dataTransfer.getData(TAB_TYPE)
    if (!id) return
    e.preventDefault()
    e.stopPropagation()
    setOver(null)
    // Dropped on the strip: back to one pane (merge) showing that tab, and in the place it was dropped.
    if (other) unsplitPdf(id)
    reorderPdfTab(id, index > tabs.indexOf(id) ? index - 1 : index)
  }

  return (
    <div role="tablist" aria-label="Open PDFs" data-pdf-tabs className="relative flex shrink-0 items-stretch gap-0.5 overflow-x-auto border-b border-line bg-bg px-1 pt-1" onDragOver={(e) => e.dataTransfer.types.includes(TAB_TYPE) && e.preventDefault()} onDrop={(e) => dropAt(e, tabs.length)}>
      {tabs.map((id, i) => {
        const s = sources[id]
        if (!s) return null
        const isActive = id === active
        const showing = isActive || id === other
        return (
          <div
            key={id}
            role="tab"
            aria-selected={isActive}
            data-pdf-tab={id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_TYPE, id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => e.dataTransfer.types.includes(TAB_TYPE) && (e.preventDefault(), setOver(i))}
            onDragLeave={() => setOver((o) => (o === i ? null : o))}
            onDrop={(e) => dropAt(e, i)}
            className={`group flex min-w-0 max-w-[12rem] shrink-0 items-center gap-1 rounded-t border border-b-0 px-2 py-1 text-xs ${isActive ? 'border-line bg-surface font-semibold' : showing ? 'border-line bg-surface/70' : 'border-transparent hover:bg-surface/60'} ${over === i ? 'outline outline-2 outline-brand' : ''}`}
          >
            <button type="button" className="min-w-0 flex-1 truncate text-left [@media(pointer:coarse)]:min-h-9" onClick={() => (showing ? focusPdfPane(id) : openPdfTab(id))} title={s.name}>
              {s.name}
            </button>
            <button type="button" aria-label={`Close ${s.name}`} title="Close this tab (the PDF stays in the map)" className="grid h-5 w-5 shrink-0 place-items-center rounded hover:bg-line [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8" onClick={() => closePdfTab(id)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        )
      })}
      {!readOnly && (
        <div className="shrink-0 self-center">
          <OpenPdfButton small />
        </div>
      )}
    </div>
  )
}

/** The two drop targets that appear while a tab is being dragged over the PDF area: left half, right half. */
export function SplitDropZones() {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const on = (e: DragEvent) => e.dataTransfer?.types.includes(TAB_TYPE) && setDragging(true)
    const off = () => setDragging(false)
    window.addEventListener('dragenter', on)
    window.addEventListener('dragend', off)
    window.addEventListener('drop', off)
    return () => {
      window.removeEventListener('dragenter', on)
      window.removeEventListener('dragend', off)
      window.removeEventListener('drop', off)
    }
  }, [])
  if (!dragging) return null
  const zone = (side: 'left' | 'right') => (
    <div
      data-split-drop={side}
      className={`flex flex-1 items-center justify-center border-2 border-dashed border-brand bg-brand/15 text-sm font-semibold text-ink ${side === 'left' ? 'rounded-l' : 'rounded-r'}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(TAB_TYPE)
        e.preventDefault()
        setDragging(false)
        if (id) splitPdf(id, side)
      }}
    >
      Open on the {side}
    </div>
  )
  return (
    <div className="absolute inset-0 z-30 flex gap-1 bg-black/10 p-1">
      {zone('left')}
      {zone('right')}
    </div>
  )
}
