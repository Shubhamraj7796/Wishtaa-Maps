import { memo, useEffect, useRef, useState } from 'react'
import type { LaidOut } from '@/core/layout/types'
import { liveOffset, resizeImage, type Corner } from '@/core/images/resize'
import type { TopicData, TopicImage } from '@/core/model/topic'
import type { Shape } from '@/core/model/types'
import { readableText } from '@/core/theme/color'
import { noteText } from '@/core/sanitize'
import { tagColor } from '@/core/settings'
import { resolveLook, type Look, type ResolvedTheme } from '@/core/theme/resolve'
import { Icon } from '@/ui/icons'
import { cancelEdit, cmdAddChild, commitEdit, selectOnly } from '../actions'
import { followLink, openTab, toggleTaskDone } from '../content'
import { commitImageSize, removeImage, setImageLive, useImageUrl } from '../images'
import { useEditor, type ImageLive } from '../store'
import { Formula } from '../ui/Formula'
import { MarkBadge } from '../ui/MarkBadge'

export interface TopicViewProps {
  box: LaidOut
  topic: TopicData
  /** Branch number such as "1.2" (empty when numbering is off). */
  number: string
  theme: ResolvedTheme
  tagColors: Record<string, string>
  /** Shape the layout prefers (bubbles). */
  layoutShape: Shape | null
  imageSelected: boolean
  live: ImageLive | null
  isRoot: boolean
  selected: boolean
  editing: boolean
  match: boolean
  current: boolean
  /** Faded because it doesn't match the tag filter. */
  dim: boolean
  hidden: number
}

const HAND_RADII = [
  '255px 18px 225px 18px / 18px 225px 18px 255px',
  '18px 255px 18px 225px / 255px 18px 225px 18px',
  '225px 16px 255px 20px / 20px 255px 16px 225px',
  '16px 225px 20px 255px / 225px 20px 255px 16px',
]

function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** CSS for the box of a topic: shape, fill, border and text from its resolved look. */
function boxStyle(look: Look, id: string, gap: string): React.CSSProperties {
  const hand = look.handDrawn
  const base: React.CSSProperties = {
    color: look.text,
    fontFamily: look.fontFamily,
    fontSize: look.fontSize,
    fontWeight: look.fontWeight,
    fontStyle: look.italic ? 'italic' : 'normal',
    background: look.fill,
    borderColor: look.border,
    borderWidth: look.borderWidth,
    borderStyle: 'solid',
  }
  switch (look.shape) {
    case 'rect':
      return { ...base, borderRadius: hand ? HAND_RADII[hash(id) % 4] : 4 }
    case 'pill':
      return { ...base, borderRadius: hand ? HAND_RADII[hash(id) % 4] : 9999 }
    case 'ellipse':
      return { ...base, borderRadius: hand ? HAND_RADII[hash(id) % 4] : '50%' }
    case 'doubleCircle': {
      // An outer ring, a gap, then the inner circle holding the text (the ring and the inner circle share the topic's colour).
      const ring = Math.max(3, Math.round(look.borderWidth * 3))
      return { ...base, borderRadius: '50%', borderWidth: ring, boxShadow: `inset 0 0 0 4px ${gap}` }
    }
    case 'diamond':
      return {
        ...base,
        borderStyle: 'none',
        background: look.fill === 'transparent' ? `${look.border}33` : look.fill,
        clipPath: 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
      }
    case 'underline':
      return { ...base, borderStyle: 'none none solid none', borderRadius: 0, background: look.fill }
    default:
      return { ...base, borderRadius: hand ? HAND_RADII[hash(id) % 4] : 12 }
  }
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
      className={`${inRow ? 'h-[22px]' : 'h-full'} min-w-0 flex-1 bg-transparent text-center outline-none`}
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
  behind?: boolean
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
    drag.current = { corner, x: e.clientX, y: e.clientY, w: image.width, h: image.height, k: useEditor.getState().viewport.k }
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
          <div role="img" aria-label={missing ? 'Image missing' : 'Loading image'} className="grid h-full w-full place-items-center rounded-md bg-black/10 text-[11px] text-current opacity-70">
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
              className="absolute -right-3 -top-9 grid h-6 w-6 place-items-center rounded-full border border-line bg-surface text-ink shadow"
            >
              <Icon name="close" size={13} />
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

const formatDue = (d: string) => {
  const date = new Date(`${d}T00:00:00`)
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Small round action button inside a topic (does not start a drag). */
function Mini({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-action
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="inline-flex h-[18px] items-center gap-0.5 rounded px-0.5 text-[10px] leading-none hover:bg-black/10"
    >
      {children}
    </button>
  )
}

export const TopicView = memo(function TopicView(p: TopicViewProps) {
  const { box, topic, isRoot } = p
  const image = topic.image
  const look = resolveLook(p.theme, { depth: box.depth, branch: box.branch, isRoot, style: topic.style, layoutShape: p.layoutShape })
  const marks = topic.marks ?? []
  const tags = topic.tags ?? []
  const inline = topic.inlineNote?.trim() ?? ''
  const latex = topic.latex?.trim() ?? ''
  const table = topic.table?.length ? topic.table : null
  const attachments = topic.attachments ?? []
  const hasNote = noteText(topic.note) !== ''
  const hasMeta = tags.length > 0 || !!topic.task || !!topic.link || attachments.length > 0 || hasNote
  const hasTitle = p.editing || topic.text.trim().length > 0 || p.number !== '' || marks.length > 0
  const extra = !!inline || !!latex || !!table || hasMeta
  const simple = !image && !extra
  const pos = image?.position ?? 'above'
  const behind = pos === 'behind'

  const style: React.CSSProperties = { left: box.x, top: box.y, width: box.w, height: box.h, ...boxStyle(look, box.id, p.theme.bg), opacity: p.dim ? 0.25 : 1 }
  const ringColor = p.current ? '#f59e0b' : p.selected ? 'rgb(var(--c-brand))' : p.match ? '#f59e0b' : null
  const diamond = look.shape === 'diamond'
  const ring = ringColor && !diamond ? `0 0 0 3px ${ringColor}${p.selected && !p.current ? ', 0 0 0 5px rgb(var(--c-surface))' : ''}` : undefined
  const glow = diamond && ringColor ? { filter: `drop-shadow(0 0 3px ${ringColor}) drop-shadow(0 0 2px ${ringColor})` } : undefined
  const backdrop = behind ? { background: `${p.theme.bg}d0`, borderRadius: 6, padding: '0 6px' } : undefined

  const title = hasTitle && (
    <div className={`flex min-w-0 max-w-full items-center justify-center gap-1 ${simple ? 'h-full w-full' : 'h-[22px]'}`} style={backdrop}>
      {marks.map((m, i) => (
        <MarkBadge key={`${m}-${i}`} mark={m} />
      ))}
      {p.number && <span className="shrink-0 opacity-70">{p.number}</span>}
      {p.editing ? <Editor id={box.id} text={topic.text} inRow={!simple} /> : <span className="min-w-0 truncate">{topic.text || ' '}</span>}
    </div>
  )

  const content = (
    <>
      {title}
      {inline && (
        <div className="max-w-full truncate text-[11px] italic opacity-85" style={{ height: 16, lineHeight: '16px', ...backdrop }}>
          {inline}
        </div>
      )}
      {latex && (
        <div className="flex max-w-full items-center justify-center overflow-hidden text-[13px]" style={{ height: 36, ...backdrop }}>
          <Formula latex={latex} />
        </div>
      )}
      {table && (
        <table className="shrink-0 border-collapse text-[11px]" style={{ height: table.length * 26 + 4 }}>
          <tbody>
            {table.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="overflow-hidden truncate border border-current/40 px-1 text-center" style={{ width: 84, maxWidth: 84, height: 26, background: i === 0 ? 'rgba(127,127,127,.18)' : undefined }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasMeta && (
        <div className="flex h-[22px] max-w-full items-center justify-center gap-1" style={backdrop}>
          {tags.map((t) => {
            const c = tagColor(t, { tagColors: p.tagColors }, p.theme.palette)
            return (
              <span key={t} className="inline-flex h-[18px] items-center rounded-full px-1.5 text-[10px] font-medium leading-none" style={{ background: c, color: readableText(c) }}>
                {t}
              </span>
            )
          })}
          {topic.task && (
            <Mini label={topic.task.done ? 'Task done. Click to reopen' : 'Task open. Click to mark done'} onClick={() => toggleTaskDone(box.id)}>
              <Icon name={topic.task.done ? 'taskDone' : 'task'} size={14} />
              {topic.task.dueDate && <span>{formatDue(topic.task.dueDate)}</span>}
            </Mini>
          )}
          {topic.link && (
            <Mini label="Open link" onClick={() => followLink(box.id)}>
              <Icon name="link" size={14} />
            </Mini>
          )}
          {attachments.length > 0 && (
            <Mini
              label={`${attachments.length} attached file${attachments.length > 1 ? 's' : ''}`}
              onClick={() => {
                selectOnly(box.id)
                openTab('details', 'attachments')
              }}
            >
              <Icon name="attachment" size={14} />
              {attachments.length > 1 && <span>{attachments.length}</span>}
            </Mini>
          )}
          {hasNote && (
            <Mini
              label="Open note"
              onClick={() => {
                selectOnly(box.id)
                openTab('notes')
              }}
            >
              <Icon name="notes" size={14} />
            </Mini>
          )}
        </div>
      )}
    </>
  )

  const picture = image && (
    <TopicPicture topicId={box.id} image={image} alt={topic.text.trim() || 'Image'} selected={p.imageSelected} live={p.live} />
  )
  const sideBySide = pos === 'left' || pos === 'right'

  return (
    <div
      data-topic={box.id}
      role="treeitem"
      aria-selected={p.selected}
      aria-label={topic.text || (image ? 'Image topic' : 'Empty topic')}
      className={`absolute flex select-none items-center justify-center px-3 leading-none ${simple ? '' : sideBySide ? 'flex-row gap-3 py-2' : 'flex-col gap-1.5 py-2'}`}
      style={{ ...style, ...glow, boxShadow: [style.boxShadow, ring].filter(Boolean).join(', ') || undefined }}
    >
      {behind && picture && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">{picture}</div>}
      {!behind && pos !== 'below' && pos !== 'right' && picture}
      {behind ? (
        <div className="relative z-10 flex flex-col items-center gap-1.5">{content}</div>
      ) : sideBySide ? (
        <div className="flex min-w-0 flex-col items-center gap-1.5">{content}</div>
      ) : (
        content
      )}
      {!behind && (pos === 'below' || pos === 'right') && picture}
      {p.hidden > 0 && (
        <button
          type="button"
          data-badge={box.id}
          aria-label={`Show ${p.hidden} hidden topics`}
          className="absolute top-1/2 -translate-y-1/2 rounded-full border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink shadow-sm"
          style={box.flow === 'l' ? { left: -12 } : box.flow === 'b' ? { bottom: -12, top: 'auto', transform: 'none' } : box.flow === 't' ? { top: -12, transform: 'none' } : { right: -12 }}
        >
          {p.hidden}
        </button>
      )}
    </div>
  )
})
