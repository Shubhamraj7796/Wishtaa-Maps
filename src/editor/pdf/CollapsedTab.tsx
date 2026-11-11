import { useEffect, useRef } from 'react'
import { Icon } from '@/ui/icons'
import { flashTip, Tooltip } from '@/ui/Tooltip'
import { restorePdf, takeFocusTab, takeTipTab } from './actions'

/**
 * The PDF panel while it is collapsed. On a computer: a slim 36 px edge tab on the side where the PDF sits, with the PDF icon, the file
 * name written downwards and, when two or more PDFs are open, a badge with their number. On a touch screen or a narrow window (the panel is
 * a bottom sheet there): a floating round button, never smaller than 44 px. Either way one click opens the PDF exactly as it was.
 */
export function CollapsedTab({ mode, name, tabs }: { mode: 'side' | 'sheet'; name: string; tabs: number }) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (takeFocusTab()) button.current?.focus() // the person collapsed it from the keyboard or the bar: focus follows to the tab
    if (takeTipTab() && button.current) flashTip(button.current, 'Open PDF') // and from the keyboard it also says what the tab is
  }, [])
  const label = `Open PDF: ${name}${tabs > 1 ? ` (${tabs} PDFs open)` : ''}`
  const badge = tabs > 1 && (
    <span data-tab-badge aria-hidden="true" className="absolute grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-4 text-brand-ink" style={mode === 'side' ? { top: 30, right: 2 } : { top: -3, right: -3 }}>
      {tabs}
    </span>
  )
  if (mode === 'sheet') {
    return (
      <aside aria-label="PDF source (collapsed)" data-pdf-panel={mode} data-pdf-size="collapsed" className="absolute bottom-3 right-3 z-30" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
        <Tooltip label="Open PDF">
          <button ref={button} type="button" data-collapsed-tab aria-label={label} onClick={() => restorePdf(true)} className="relative grid h-12 w-12 select-none place-items-center rounded-full border border-line bg-surface text-ink shadow-lg hover:bg-bg [@media(pointer:coarse)]:h-12 [@media(pointer:coarse)]:w-12">
            <Icon name="pdf" size={22} />
            {badge}
          </button>
        </Tooltip>
      </aside>
    )
  }
  return (
    <aside aria-label="PDF source (collapsed)" data-pdf-panel={mode} data-pdf-size="collapsed" className="relative z-10 flex w-9 shrink-0 flex-col border-r border-line bg-surface">
      <Tooltip label="Open PDF">
        <button ref={button} type="button" data-collapsed-tab aria-label={label} onClick={() => restorePdf(true)} className="relative flex min-h-0 flex-1 select-none flex-col items-center gap-2 py-2 text-ink hover:bg-bg focus-visible:bg-bg">
          <Icon name="pdf" size={20} />
          <span className="max-h-48 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-muted [writing-mode:vertical-rl]">{name}</span>
          <span className="mt-auto text-muted">
            <Icon name="chevronRight" size={16} />
          </span>
          {badge}
        </button>
      </Tooltip>
    </aside>
  )
}
