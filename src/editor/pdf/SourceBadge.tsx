import type { SourceRef } from '@/core/pdf/types'
import { showSource } from './actions'
import { TipButton } from '@/ui/IconButton'

/** "p. 12": where the topic came from. Clicking it shows that passage in the PDF. */
export function SourceBadge({ source, className = '' }: { source: SourceRef; className?: string }) {
  return (
    <TipButton
      type="button"
      data-source-badge
      aria-label={`Show page ${source.page} of the PDF`}
      tip={`Show page ${source.page} of the PDF`}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        showSource(source)
      }}
      className={`inline-flex h-5 shrink-0 items-center rounded-full border border-line bg-surface px-1.5 text-[11px] font-medium leading-none text-muted hover:border-brand hover:text-ink [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:px-2.5 ${className}`}
    >
      p. {source.page}
    </TipButton>
  )
}
