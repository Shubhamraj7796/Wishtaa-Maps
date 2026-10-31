import { useEffect, useRef, useState } from 'react'
import { outlineToBranches } from '@/core/io/outline'
import { pasteBranches, setText } from '@/core/model/commands'
import { setNote } from '@/core/model/content'
import { sanitizeNote } from '@/core/sanitize'
import { Icon } from '@/ui/icons'
import { showPreview, startOcr } from '../content'
import { loadImageBlob, useImageUrl } from '../images'
import { mapDoc } from '../mapdoc'
import { showNotice } from '../notice'
import { OCR_LANGUAGES, ocrLines, recognizeText } from '../ocr'
import { useScene } from '../scene'
import { useEditor } from '../store'

/** A picture shown full size, with zoom and next / previous through the pictures of the map. */
export function Lightbox() {
  const imageId = useEditor((s) => s.lightbox)
  if (!imageId) return null
  return <LightboxInner imageId={imageId} />
}

/** The pictures of the map in reading order (the order of the topics), each once. */
export function mapImageIds(topics: Record<string, { image?: { imageId: string } | null | undefined }>, order: string[]): string[] {
  const out: string[] = []
  for (const id of order) {
    const img = topics[id]?.image?.imageId
    if (img && !out.includes(img)) out.push(img)
  }
  return out
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4]

function LightboxInner({ imageId }: { imageId: string }) {
  const topics = useEditor((s) => s.topics)
  const order = useScene().order
  const ids = mapImageIds(topics, order)
  const at = Math.max(0, ids.indexOf(imageId))
  const [zoom, setZoom] = useState(1)
  const { url, missing } = useImageUrl(imageId)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => close.current?.focus(), [])
  useEffect(() => setZoom(1), [imageId])

  const step = (dir: 1 | -1) => {
    if (ids.length < 2) return
    showPreview(ids[(at + dir + ids.length) % ids.length] as string)
  }
  const zoomBy = (dir: 1 | -1) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.findIndex((v) => v >= z - 1e-6) + dir))] ?? z)
  const btn = 'grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow disabled:opacity-40'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Picture preview"
      className="absolute inset-0 z-50 flex items-center justify-center overflow-auto bg-black/80 p-4"
      onPointerDown={() => showPreview(null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') showPreview(null)
        else if (e.key === 'ArrowRight') step(1)
        else if (e.key === 'ArrowLeft') step(-1)
        else if (e.key === '+' || e.key === '=') zoomBy(1)
        else if (e.key === '-') zoomBy(-1)
        else if (e.key === '0') setZoom(1)
      }}
    >
      <button ref={close} type="button" aria-label="Close preview" title="Close (Esc)" onClick={() => showPreview(null)} className={`absolute right-4 top-4 ${btn}`}>
        <Icon name="close" size={20} />
      </button>
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-surface/90 px-2 py-1 text-sm shadow" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Previous picture" title="Previous (Left arrow)" disabled={ids.length < 2} onClick={() => step(-1)} className={btn}>‹</button>
        <span aria-live="polite" className="min-w-16 text-center tabular-nums">{ids.length > 1 ? `${at + 1} of ${ids.length}` : '1 picture'}</span>
        <button type="button" aria-label="Next picture" title="Next (Right arrow)" disabled={ids.length < 2} onClick={() => step(1)} className={btn}>›</button>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden="true" />
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" onClick={() => zoomBy(-1)} className={btn}>−</button>
        <button type="button" aria-label="Actual size" title="Reset (0)" onClick={() => setZoom(1)} className="min-w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</button>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" onClick={() => zoomBy(1)} className={btn}>+</button>
      </div>
      {url ? (
        <img src={url} alt="Full-size picture" style={{ maxWidth: zoom === 1 ? '100%' : 'none', maxHeight: zoom === 1 ? '100%' : 'none', width: zoom === 1 ? undefined : `${zoom * 100}%` }} className="rounded-md bg-white object-contain" onPointerDown={(e) => e.stopPropagation()} />
      ) : (
        <p className="text-white">{missing ? 'This picture is no longer stored.' : 'Loading…'}</p>
      )}
    </div>
  )
}

/** Reads the text out of a topic's picture and lets you put it to use. */
export function OcrDialog() {
  const topicId = useEditor((s) => s.ocrTopic)
  if (!topicId) return null
  return <OcrInner key={topicId} topicId={topicId} />
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function OcrInner({ topicId }: { topicId: string }) {
  const image = useEditor((s) => s.topics[topicId]?.image)
  const [lang, setLang] = useState('eng')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [text, setTextValue] = useState('')
  const [error, setError] = useState('')
  const alive = useRef(true)
  // Set on every mount: React's development double-mount runs this cleanup once before the real mount.
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const run = async () => {
    if (!image) return
    setBusy(true)
    setError('')
    setProgress(0)
    try {
      const blob = await loadImageBlob(image.imageId)
      if (!blob) throw new Error('The picture is no longer stored in this browser.')
      const out = await recognizeText(blob, lang, (f, s) => {
        if (!alive.current) return
        setProgress(f)
        setStatus(s)
      })
      if (alive.current) setTextValue(out.trim())
      if (alive.current && !out.trim()) setError('No text was found in this picture.')
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not read the picture.')
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  const lines = ocrLines(text)
  const close = () => startOcr(null)
  const done = (msg: string) => {
    showNotice(msg)
    close()
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onPointerDown={close}>
      <div role="dialog" aria-modal="true" aria-label="Read text from picture" className="flex max-h-full w-[min(560px,100%)] flex-col gap-3 overflow-auto rounded-ui border border-line bg-surface p-4 shadow-2xl" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Escape' && close()}>
        <div className="flex items-center gap-2">
          <Icon name="ocr" size={20} />
          <h2 className="flex-1 text-base font-semibold">Read text from the picture</h2>
          <button type="button" aria-label="Close" onClick={close} className="grid h-8 w-8 place-items-center rounded-ui hover:bg-bg"><Icon name="close" size={18} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-muted">Language</span>
            <select value={lang} disabled={busy} onChange={(e) => setLang(e.target.value)} className="rounded-ui border border-line bg-surface px-2 py-1">
              {OCR_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label}</option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy || !image} onClick={() => void run()} className="flex items-center gap-2 rounded-ui bg-brand px-3 py-1.5 font-medium text-brand-ink disabled:opacity-50">
            <Icon name="ocr" size={16} /> {busy ? 'Reading…' : text ? 'Read again' : 'Read text'}
          </button>
        </div>
        {busy && (
          <div role="progressbar" aria-label="Reading progress" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 overflow-hidden rounded-full bg-bg"><div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
            <p className="mt-1 text-xs text-muted">{status || 'Starting'}… The first time, the reading engine and language data are downloaded (the picture itself never leaves your device).</p>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        {text && (
          <>
            <textarea value={text} onChange={(e) => setTextValue(e.target.value)} rows={8} aria-label="Recognised text" className="w-full resize-y rounded-ui border border-line bg-surface p-2 text-sm" />
            <div className="flex flex-wrap gap-2 text-sm">
              <button type="button" onClick={() => void navigator.clipboard?.writeText(text).then(() => showNotice('Text copied.'))} className="flex items-center gap-2 rounded-ui border border-line px-3 py-1.5 hover:bg-bg"><Icon name="copy" size={15} /> Copy</button>
              <button type="button" onClick={() => { setText(mapDoc, topicId, lines.join(' ').slice(0, 200)); done('Topic text replaced.') }} className="flex items-center gap-2 rounded-ui border border-line px-3 py-1.5 hover:bg-bg"><Icon name="edit" size={15} /> Use as topic text</button>
              <button type="button" onClick={() => { setNote(mapDoc, topicId, sanitizeNote(lines.map((l) => `<p>${escapeHtml(l)}</p>`).join(''))); done('Added to the topic’s note.') }} className="flex items-center gap-2 rounded-ui border border-line px-3 py-1.5 hover:bg-bg"><Icon name="notes" size={15} /> Save as note</button>
              <button type="button" disabled={lines.length === 0} onClick={() => { pasteBranches(mapDoc, outlineToBranches(lines.map((l) => ({ text: l.slice(0, 200), children: [] }))), topicId); done(`${lines.length} sub-topics added.`) }} className="flex items-center gap-2 rounded-ui border border-line px-3 py-1.5 hover:bg-bg"><Icon name="subTopic" size={15} /> Lines as sub-topics</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
