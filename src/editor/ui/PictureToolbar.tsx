import { useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '@/ui/icons'
import * as A from '../actions'
import { showPreview } from '../content'
import { copyImage, downloadImage, removeImage, replaceImage, resetImageSize } from '../images'
import { selectionKind } from '../panel/behaviour'
import { placeToolbar } from '../quickToolbarPlace'
import { useEditor } from '../store'

const btn = 'grid h-9 min-w-9 shrink-0 place-items-center rounded-ui border border-transparent px-1.5 text-sm hover:bg-bg [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11'

/**
 * A small toolbar that floats above the selected picture: preview (full screen, with zoom), download the original, replace,
 * delete, copy, and more. Stays inside the canvas, every button is reachable with the keyboard, and it is hidden in Read mode.
 */
export function PictureToolbar() {
  const kind = useEditor((s) => selectionKind(s))
  const id = useEditor((s) => s.imageSelected)
  const topic = useEditor((s) => (s.imageSelected ? s.topics[s.imageSelected] : undefined))
  useEditor((s) => s.viewport) // re-measure whenever the canvas moves or zooms
  const live = useEditor((s) => s.imageLive)
  const readOnly = useEditor((s) => s.readOnly)
  const area = useEditor((s) => s.canvasSize)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [more, setMore] = useState(false)
  const image = topic?.image

  // Where the picture is on screen, measured from the page so it is exact whatever the layout or zoom.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar || !id) return
    const pic = bar.parentElement?.querySelector<HTMLElement>(`[data-image="${CSS.escape(id)}"]`)
    const host = bar.parentElement?.getBoundingClientRect()
    if (!pic || !host) return
    const r = pic.getBoundingClientRect()
    const target = { x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height }
    const p = placeToolbar(target, { w: bar.offsetWidth, h: bar.offsetHeight }, { w: area.w || host.width, h: area.h || host.height })
    setPos((cur) => (cur && cur.left === p.left && cur.top === p.top ? cur : { left: p.left, top: p.top }))
  })

  if (readOnly || kind !== 'picture' || !id || !image) return null

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Picture tools"
      className="absolute z-20 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-0.5 rounded-ui border border-line bg-surface px-1 py-1 shadow-lg"
      style={{ left: pos?.left ?? 8, top: pos?.top ?? 8, visibility: live ? 'hidden' : undefined }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setMore(false)
          return
        }
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
        const items = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])]
        const i = items.indexOf(document.activeElement as HTMLElement)
        if (i < 0) return
        e.preventDefault()
        items[(i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.focus()
      }}
    >
      <button type="button" aria-label="Preview" title="Preview full screen" onClick={() => showPreview(image.imageId)} className={btn}>
        <Icon name="preview" size={17} />
      </button>
      <button type="button" aria-label="Download original" title="Download the original" onClick={() => void downloadImage(image.imageId, topic?.text ?? '')} className={btn}>
        <Icon name="download" size={17} />
      </button>
      <button type="button" aria-label="Replace" title="Replace the picture" onClick={() => void replaceImage(id)} className={btn}>
        <Icon name="replace" size={17} />
      </button>
      <button type="button" aria-label="Copy" title="Copy the picture" onClick={() => void copyImage(image.imageId)} className={btn}>
        <Icon name="copy" size={17} />
      </button>
      <button type="button" aria-label="Delete picture" title="Delete the picture" onClick={() => removeImage(id)} className={`${btn} text-bad`}>
        <Icon name="trash" size={17} />
      </button>
      <div className="relative">
        <button type="button" aria-label="More" aria-haspopup="menu" aria-expanded={more} title="More" onClick={() => setMore(!more)} className={btn}>
          ⋯
        </button>
        {more && (
          <>
            <div className="fixed inset-0 z-30" onPointerDown={() => setMore(false)} />
            <div role="menu" aria-label="More picture tools" className="absolute right-0 top-full z-40 mt-1 w-56 rounded-ui border border-line bg-surface py-1 text-sm shadow-xl">
              {[
                ['Back to original size', () => void resetImageSize(id)],
                ['Picture format…', () => A.togglePanel('picture')],
              ].map(([label, run]) => (
                <button
                  key={label as string}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMore(false)
                    ;(run as () => void)()
                  }}
                  className="block w-full px-3 py-2 text-left hover:bg-brand/15"
                >
                  {label as string}
                </button>
              ))}
              {/* TODO: AI picture tools and reading text from a picture (OCR) are left out on purpose. */}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
