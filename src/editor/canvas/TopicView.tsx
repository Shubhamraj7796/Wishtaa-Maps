import { memo, useEffect, useRef, useState } from 'react'
import { PALETTE, type LaidOut } from '@/core/layout/mindmap'
import { liveOffset, resizeImage, type Corner } from '@/core/images/resize'
import type { TopicImage } from '@/core/model/topic'
import { cancelEdit, cmdAddChild, commitEdit } from '../actions'
import { commitImageSize, removeImage, setImageLive, useImageUrl } from '../images'
import { useEditor, type ImageLive } from '../store'

export interface TopicViewProps {
  box: LaidOut
  text: string
  image: TopicImage | null | undefined
  imageSelected: boolean
  live: ImageLive | null
  isRoot: boolean
  selected: boolean
  editing: boolean
  match: boolean
  current: boolean
  hidden: number
}

export function branchColor(branch: number): string {
  return branch < 0 ? '#1f2937' : (PALETTE[branch % PALETTE.length] ?? '#1f2937')
}

function Editor({ id, text, inRow }: { id: string; text: string; inRow: boolean }) {
  const [v, setV] = useState(text)
  const done = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (done.current) return
    done.current = true
    if (save) commitEdit(id, v)
    else cancelEdit()
  }
  return (
    <input
      ref={ref}
      aria-label="Topic text"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        else if (e.key === 'Escape') finish(false)
        else if (e.key === 'Tab') {
          e.preventDefault()
          finish(true)
          cmdAddChild()
        }
      }}
      className={`${inRow ? 'h-[22px]' : 'h-full'} w-full bg-transparent text-center outline-none`}
      style={{ font: 'inherit', color: 'inherit' }}
    />
  )
}

const CORNERS: { corner: Corner; label: string; style: React.CSSProperties; cursor: string }[] = [
  { corner: 'nw', label: 'top-left', style: { left: -7, top: -7 }, cursor: 'nwse-resize' },
  { corner: 'ne', label: 'top-right', style: { right: -7, top: -7 }, cursor: 'nesw-resize' },
  { corner: 'sw', label: 'bottom-left', style: { left: -7, bottom: -7 }, cursor: 'nesw-resize' },
  { corner: 'se', label: 'bottom-right', style: { right: -7, bottom: -7 }, cursor: 'nwse-resize' },
]

function TopicPicture(props: {
  topicId: string
  image: TopicImage
  alt: string
  selected: boolean
  live: ImageLive | null
}) {
  const { topicId, image, alt, selected, live } = props
  const { url, missing } = useImageUrl(image.imageId)
  const drag = useRef<{ corner: Corner; x: number; y: number; w: number; h: number; k: number } | null>(null)

  const liveSize = live ?? { width: image.width, height: image.height, corner: 'se' as Corner }
  const off = live ? liveOffset(live.corner, image, live) : { left: 0, top: 0 }

  const start = (corner: Corner) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      corner,
      x: e.clientX,
      y: e.clientY,
      w: image.width,
      h: image.height,
      k: useEditor.getState().viewport.k,
    }
    setImageLive({ topicId, width: image.width, height: image.height, corner })
  }
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const r = resizeImage({
      width: d.w,
      height: d.h,
      dx: (e.clientX - d.x) / d.k,
      dy: (e.clientY - d.y) / d.k,
      corner: d.corner,
      lockAspect: !e.shiftKey, // hold Shift to resize freely
    })
    setImageLive({ topicId, width: r.width, height: r.height, corner: d.corner })
  }
  const end = (commit: boolean) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const l = useEditor.getState().imageLive
    setImageLive(null)
    if (commit && l) commitImageSize(topicId, l.width, l.height) // one undo step
  }

  return (
    <div data-image={topicId} className="relative shrink-0" style={{ width: image.width, height: image.height }}>
      <div
        className="absolute"
        style={{
          left: off.left,
          top: off.top,
          width: liveSize.width,
          height: liveSize.height,
          outline: selected ? '2px solid rgb(var(--c-brand))' : undefined,
          outlineOffset: 1,
          borderRadius: 6,
        }}
      >
        {url ? (
          <img src={url} alt={alt} draggable={false} className="block h-full w-full select-none rounded-md object-fill" />
        ) : (
          <div
            role="img"
            aria-label={missing ? 'Image missing' : 'Loading image'}
            className="grid h-full w-full place-items-center rounded-md bg-black/10 text-[11px] text-current opacity-70"
          >
            {missing ? 'Image missing' : '…'}
          </div>
        )}
        {selected && (
          <>
            <button
              type="button"
              data-imgbtn
              aria-label="Remove image"
              title="Remove image"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => removeImage(topicId)}
              className="absolute -right-3 -top-9 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-sm leading-none text-ink shadow"
            >
              ×
            </button>
            {CORNERS.map((c) => (
              <button
                key={c.corner}
                type="button"
                data-handle={c.corner}
                aria-label={`Resize image, ${c.label} corner. Hold Shift to resize freely, or use Shift and the arrow keys.`}
                onPointerDown={start(c.corner)}
                onPointerMove={move}
                onPointerUp={end(true)}
                onPointerCancel={end(false)}
                className="absolute h-3.5 w-3.5 rounded-sm border-2 border-brand bg-surface"
                style={{ ...c.style, cursor: c.cursor, touchAction: 'none' }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

export const TopicView = memo(function TopicView(p: TopicViewProps) {
  const { box, isRoot, image } = p
  const color = branchColor(box.branch)
  const filled = isRoot || box.depth <= 1
  const hasText = p.text.trim().length > 0 || p.editing
  const style: React.CSSProperties = {
    left: box.x,
    top: box.y,
    width: box.w,
    height: box.h,
    borderColor: isRoot ? '#1f2937' : color,
    background: isRoot ? '#1f2937' : box.depth === 1 || box.depth === 0 ? color : `${color}1f`,
    color: filled ? '#fff' : undefined,
    fontSize: isRoot ? 17 : 14,
    fontWeight: isRoot ? 600 : box.depth === 1 ? 600 : 500,
  }
  const ring = p.current
    ? '0 0 0 3px #f59e0b'
    : p.selected
      ? '0 0 0 3px rgb(var(--c-brand)), 0 0 0 5px rgb(var(--c-surface))'
      : p.match
        ? '0 0 0 2px #f59e0b'
        : undefined
  return (
    <div
      data-topic={box.id}
      role="treeitem"
      aria-selected={p.selected}
      aria-label={p.text || (image ? 'Image topic' : 'Empty topic')}
      className={`absolute flex select-none items-center justify-center rounded-xl border-2 px-3 leading-none ${
        image ? 'flex-col gap-1.5 py-2' : ''
      }`}
      style={{ ...style, boxShadow: ring }}
    >
      {image && (
        <TopicPicture
          topicId={box.id}
          image={image}
          alt={p.text.trim() || 'Image'}
          selected={p.imageSelected}
          live={p.live}
        />
      )}
      {hasText &&
        (p.editing ? (
          <Editor id={box.id} text={p.text} inRow={!!image} />
        ) : (
          <span className="max-w-full truncate" style={image ? { height: 22, lineHeight: '22px' } : undefined}>
            {p.text || ' '}
          </span>
        ))}
      {p.hidden > 0 && (
        <button
          type="button"
          data-badge={box.id}
          aria-label={`Show ${p.hidden} hidden topics`}
          className="absolute top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm"
          style={box.side === 'left' ? { left: -12 } : { right: -12 }}
        >
          {p.hidden}
        </button>
      )}
    </div>
  )
})
