import { useEffect, useMemo, useState } from 'react'
import { useTouchFriendly } from '../pictures/touch'
import { useEditor } from '../store'

export const formatBytes = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function useBlobUrl(blob: Blob | undefined) {
  const url = useMemo(() => (blob && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null), [blob])
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url])
  return url
}

/** The segmented choice: "Compressed (readable) - 180 KB" and "Original - 1.2 MB", with a check box to stop being asked. */
export function ChoiceControl({
  value,
  onChange,
  compressed,
  original,
  originalDisabled,
}: {
  value: 'compressed' | 'original'
  onChange: (v: 'compressed' | 'original') => void
  compressed: number
  original: number | null
  originalDisabled?: string | null
}) {
  const touch = useTouchFriendly()
  const seg = (on: boolean) => `flex-1 rounded-ui border px-3 text-left text-sm ${touch ? 'min-h-11 py-2' : 'py-1.5'} ${on ? 'border-brand bg-brand/15 font-medium' : 'border-line hover:bg-bg'} disabled:opacity-50`
  return (
    <div role="radiogroup" aria-label="Picture size" className="flex flex-col gap-2 sm:flex-row">
      <button type="button" role="radio" aria-checked={value === 'compressed'} onClick={() => onChange('compressed')} className={seg(value === 'compressed')}>
        Compressed (readable) - {formatBytes(compressed)}
      </button>
      <button type="button" role="radio" aria-checked={value === 'original'} disabled={!!originalDisabled} title={originalDisabled ?? undefined} onClick={() => onChange('original')} className={seg(value === 'original')}>
        Original - {original === null ? 'too large' : formatBytes(original)}
      </button>
    </div>
  )
}

/** Asked for plain uploads, several files at once, and imports: ONE dialog with the totals. */
export function PictureChoiceDialog() {
  const req = useEditor((s) => s.pictureChoice)
  const [choice, setChoice] = useState<'compressed' | 'original'>('compressed')
  const [remember, setRemember] = useState(false)
  const [zoom, setZoom] = useState(false)
  const before = useBlobUrl(req?.preview?.original)
  const after = useBlobUrl(req?.preview?.compressed)
  const touch = useTouchFriendly()
  useEffect(() => {
    setChoice('compressed')
    setRemember(false)
    setZoom(false)
  }, [req])
  if (!req) return null

  const totalOriginal = req.items.reduce((n, i) => n + i.original, 0)
  const totalCompressed = req.items.reduce((n, i) => n + i.compressed, 0)
  const many = req.items.length > 1
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 p-0 sm:place-items-center sm:p-4" onPointerDown={() => req.resolve(null)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Picture size"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') req.resolve(null)
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'BUTTON') req.resolve({ choice, remember })
        }}
        className="max-h-[90dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-ui border border-line bg-surface p-4 shadow-2xl sm:rounded-ui"
      >
        <h2 className="text-base font-semibold">{many ? `${req.items.length} pictures` : 'Make the picture smaller?'}</h2>
        <p className="text-sm text-muted" data-testid="choice-summary">
          {many ? `${req.items.length} pictures: ${formatBytes(totalOriginal)} to ${formatBytes(totalCompressed)}` : `This picture is ${formatBytes(totalOriginal)}. Compressed it is ${formatBytes(totalCompressed)} and still easy to read.`}
        </p>
        <ChoiceControl value={choice} onChange={setChoice} compressed={totalCompressed} original={totalOriginal} />
        {req.preview && before && after && (
          <div>
            <button type="button" onClick={() => setZoom(!zoom)} className="mb-1 text-xs text-brand underline">
              {zoom ? 'Smaller preview' : 'Zoom to check the text'}
            </button>
            <div className={`grid grid-cols-2 gap-2 overflow-auto rounded-ui border border-line bg-bg p-1 ${zoom ? 'max-h-72' : ''}`}>
              {[
                ['Original', before],
                ['Compressed', after],
              ].map(([label, src]) => (
                <figure key={label} className="min-w-0">
                  <img src={src} alt={`${label} picture`} className={zoom ? 'max-w-none' : 'h-28 w-full object-contain'} style={zoom ? { width: '200%' } : undefined} draggable={false} />
                  <figcaption className="text-center text-xs text-muted">{label}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
        <label className={`flex items-center gap-2 text-sm ${touch ? 'min-h-11' : ''}`}>
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
          Don&apos;t ask me again, always use this choice
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => req.resolve(null)} className={`rounded-ui border border-line px-3 text-sm hover:bg-bg ${touch ? 'min-h-11' : 'py-1.5'}`}>
            Cancel
          </button>
          <button type="button" data-autofocus onClick={() => req.resolve({ choice, remember })} className={`rounded-ui bg-brand px-4 text-sm font-semibold text-brand-ink ${touch ? 'min-h-11' : 'py-1.5'}`}>
            Add
          </button>
        </div>
      </div>
    </div>
  )
}
