import { useEffect, useState } from 'react'
import type { StoredPdf } from '@/core/pdf/store'
import { IconTile, TipButton } from '@/ui/IconButton'
import { Popover } from '@/ui/Popover'
import { useEditor } from '../store'
import { addPdf, openPdfFromDrive, openPdfTab, pickPdfFromDevice } from './actions'
import { pdfStore } from './runtime'

/**
 * Open a PDF: ONE popover for the top bar and for the "+" of the tab row. Two icon choices, a laptop ("From this device") and a cloud
 * ("From Google Drive"), then a short Recent PDFs list (file names): the PDFs of this map that are closed, and PDFs this device kept.
 * The choices call exactly what the "..." menu calls (the file chooser; the separate Drive Picker for PDFs, with its Brave notice).
 */
export function OpenPdfChoices({ onClose }: { onClose: () => void }) {
  const tabs = useEditor((s) => s.pdfPanel.tabs)
  const sources = useEditor((s) => s.pdf.sources)
  const [device, setDevice] = useState<StoredPdf[]>([])
  useEffect(() => {
    let live = true
    void pdfStore.list().then((l) => live && setDevice(l), () => undefined)
    return () => {
      live = false
    }
  }, [])
  const closed = Object.values(sources).filter((s) => !tabs.includes(s.id)).sort((a, b) => b.addedAt - a.addedAt)
  const inMap = new Set(Object.values(sources).map((s) => s.hash))
  const recent = device.filter((d) => !inMap.has(d.hash)).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, 6)
  const row = 'flex w-full min-w-0 items-center gap-1 rounded px-3 py-2 text-left text-sm hover:bg-brand/15 [@media(pointer:coarse)]:min-h-11'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-center gap-1">
        <IconTile role="menuitem" icon="laptop" label="From this device" data-open-device="" onClick={() => (pickPdfFromDevice(), onClose())} />
        <IconTile role="menuitem" icon="cloud" label="From Google Drive" data-open-drive="" onClick={() => (void openPdfFromDrive(), onClose())} />
      </div>
      {(closed.length > 0 || recent.length > 0) && (
        <div className="w-64 max-w-full border-t border-line pt-1" role="group" aria-label="Recent PDFs">
          <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Recent PDFs</p>
          {closed.map((s) => (
            <TipButton key={s.id} tip={s.name} role="menuitem" className={row} onClick={() => (openPdfTab(s.id), onClose())}>
              <span className="truncate">{s.name}</span> <span className="shrink-0 text-xs text-muted">· in this map</span>
            </TipButton>
          ))}
          {recent.map((d) => (
            <TipButton
              key={d.hash}
              tip={d.name}
              role="menuitem"
              className={row}
              onClick={() => {
                onClose()
                void pdfStore.get(d.hash).then((bytes) => {
                  if (bytes) void addPdf(bytes, d.name)
                })
              }}
            >
              <span className="truncate">{d.name}</span> <span className="shrink-0 text-xs text-muted">· on this device</span>
            </TipButton>
          ))}
        </div>
      )}
    </div>
  )
}

/** The Open a PDF icon (a document with a plus) and its popover. Used in the PDF top bar and as the "+" of the tab row (`small`). */
export function OpenPdfButton({ small = false }: { small?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <IconTile
        icon="filePlus"
        label="Open a PDF"
        data-open-pdf=""
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        selected={!!anchor}
        size={small ? 16 : 20}
        className={small ? '!h-8 !w-8' : ''}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      />
      {anchor && (
        <Popover anchor={anchor} label="Open a PDF" onClose={() => setAnchor(null)}>
          <OpenPdfChoices onClose={() => setAnchor(null)} />
        </Popover>
      )}
    </>
  )
}
