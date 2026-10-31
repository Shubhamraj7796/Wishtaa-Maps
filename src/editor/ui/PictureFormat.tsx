import { useState } from 'react'
import { IMAGE_POSITIONS, type ImagePosition } from '@/core/model/topic'
import { Icon, PositionIcon } from '@/ui/icons'
import { applyPictureSizeToAll, setPictureAlt, setPicturePosition, showPreview } from '../content'
import { commitImageSize, copyImage, downloadImage, removeImage, replaceImage, resetImageSize } from '../images'
import { useEditor } from '../store'
import { Section, field } from './panelKit'

/** Pictures are kept between these sizes (px), the same rule the resize handles follow. */
export const MIN_PICTURE = 40
export const MAX_PICTURE = 1200

const clampSize = (n: number) => Math.min(MAX_PICTURE, Math.max(MIN_PICTURE, Math.round(n)))

const POSITION_LABEL: Record<ImagePosition, string> = {
  above: 'Above the text',
  left: 'Left of the text',
  below: 'Below the text',
  right: 'Right of the text',
  behind: 'Behind the text',
}

const iconBtn = 'grid h-8 w-8 shrink-0 place-items-center rounded-ui border border-line hover:bg-bg disabled:opacity-40'

/**
 * Picture format: size (always in step with the resize handles), proportions, original size, position next to the text, a
 * description for screen readers, replacing the picture, and giving every picture the same width.
 */
export function PictureFormat() {
  const selected = useEditor((s) => s.selected)
  const id = selected.length === 1 ? (selected[0] as string) : null
  const topic = useEditor((s) => (id ? s.topics[id] : undefined))
  const live = useEditor((s) => s.imageLive)
  const count = useEditor((s) => Object.values(s.topics).filter((t) => t.image).length)
  const [keep, setKeep] = useState(true)
  const [draft, setDraft] = useState<{ w?: string; h?: string }>({})
  const [confirm, setConfirm] = useState(false)
  const [alt, setAlt] = useState<{ id: string; text: string } | null>(null)

  const image = topic?.image
  if (!id || !topic || !image) {
    return (
      <Section title="Picture format">
        <p className="text-sm text-muted">Click a picture inside a topic to change its size, position and description.</p>
      </Section>
    )
  }
  // While a corner is dragged the handles show the live size, and these fields follow it.
  const shown = live && live.topicId === id ? { w: live.width, h: live.height } : { w: image.width, h: image.height }
  const ratio = image.height / image.width

  const commit = (which: 'w' | 'h') => {
    const raw = Number(draft[which])
    setDraft({})
    if (!Number.isFinite(raw) || raw <= 0) return
    const v = clampSize(raw)
    if (keep) {
      const w = which === 'w' ? v : clampSize(v / ratio)
      const h = which === 'h' ? v : clampSize(v * ratio)
      commitImageSize(id, which === 'w' ? w : clampSize(h / ratio), which === 'w' ? clampSize(w * ratio) : h)
    } else {
      commitImageSize(id, which === 'w' ? v : image.width, which === 'h' ? v : image.height)
    }
  }
  const field2 = (which: 'w' | 'h', label: string) => (
    <label className="flex items-center gap-1">
      <span className="text-muted">{which.toUpperCase()}</span>
      <input
        type="number"
        min={MIN_PICTURE}
        max={MAX_PICTURE}
        aria-label={label}
        value={draft[which] ?? String(shown[which])}
        onChange={(e) => setDraft({ ...draft, [which]: e.target.value })}
        onBlur={() => draft[which] !== undefined && commit(which)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={`${field} w-20`}
      />
    </label>
  )
  const pos = image.position ?? 'above'
  const altText = alt?.id === id ? alt.text : (image.alt ?? '')

  return (
    <>
      <Section title="Picture format">
        <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Picture size">
          {field2('w', 'Picture width')}
          <button type="button" aria-pressed={keep} aria-label="Keep aspect ratio" title="Keep aspect ratio" onClick={() => setKeep(!keep)} className={`${iconBtn} ${keep ? 'border-brand bg-brand/15' : ''}`}>
            <Icon name={keep ? 'link' : 'unlink'} size={15} />
          </button>
          {field2('h', 'Picture height')}
          <span className="text-xs text-muted">px ({MIN_PICTURE} to {MAX_PICTURE})</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void resetImageSize(id)} className={`${field} flex items-center gap-1.5 hover:bg-bg`}>
            <Icon name="reset" size={15} /> Reset to original size
          </button>
        </div>
        {count > 1 &&
          (confirm ? (
            <div role="alert" className="space-y-2 rounded-ui border border-line p-2 text-sm">
              <p>
                Give all {count} pictures this width ({shown.w} px)? Their proportions stay the same.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    applyPictureSizeToAll(id)
                    setConfirm(false)
                  }}
                  className="rounded-ui bg-brand px-3 py-1 text-xs font-semibold text-brand-ink"
                >
                  Apply to all
                </button>
                <button type="button" onClick={() => setConfirm(false)} className="rounded-ui border border-line px-3 py-1 text-xs hover:bg-bg">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className={`${field} flex w-full items-center gap-1.5 hover:bg-bg`}>
              <Icon name="details" size={15} /> Apply this size to all pictures
            </button>
          ))}
      </Section>
      <Section title="Position">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Picture position">
          {IMAGE_POSITIONS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={pos === p} aria-label={POSITION_LABEL[p]} title={POSITION_LABEL[p]} onClick={() => setPicturePosition(id, p)} className={`${iconBtn} h-9 w-9 ${pos === p ? 'border-brand bg-brand/15' : ''}`}>
              <PositionIcon position={p} />
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{POSITION_LABEL[pos]}</p>
      </Section>
      <Section title="Description and file">
        <label className="block space-y-1 text-sm">
          <span>Alt text (read aloud by screen readers)</span>
          <input
            value={altText}
            maxLength={300}
            placeholder={topic.text.trim() || 'Describe the picture'}
            onChange={(e) => setAlt({ id, text: e.target.value })}
            onBlur={() => {
              if (alt?.id === id) setPictureAlt(id, alt.text)
              setAlt(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={`${field} w-full`}
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" aria-label="Replace the picture" title="Replace the picture" onClick={() => void replaceImage(id)} className={`${field} flex items-center gap-1.5 hover:bg-bg`}>
            <Icon name="replace" size={15} /> Replace
          </button>
          <button type="button" aria-label="Preview the picture" title="Preview" onClick={() => showPreview(image.imageId)} className={iconBtn}>
            <Icon name="preview" size={16} />
          </button>
          <button type="button" aria-label="Download the original picture" title="Download the original" onClick={() => void downloadImage(image.imageId, topic.text)} className={iconBtn}>
            <Icon name="download" size={16} />
          </button>
          <button type="button" aria-label="Copy the picture" title="Copy" onClick={() => void copyImage(image.imageId)} className={iconBtn}>
            <Icon name="copy" size={16} />
          </button>
          <button type="button" aria-label="Delete the picture" title="Delete the picture" onClick={() => removeImage(id)} className={`${iconBtn} text-bad`}>
            <Icon name="trash" size={16} />
          </button>
        </div>
        {/* TODO: AI picture tools and reading text from a picture (OCR) are left out here on purpose. */}
      </Section>
    </>
  )
}
