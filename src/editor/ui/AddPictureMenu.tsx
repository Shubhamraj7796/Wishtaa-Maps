import { useEffect, useRef } from 'react'
import { Icon, type IconName } from '@/ui/icons'
import { useSettings, type PicturesPref } from '@/stores/settings'
import { useImageUrl } from '../images'
import { closeAddPicture, pictureIdsInMap, recentPictures, reusePicture, startSource } from '../pictures/flow'
import { canCaptureScreen, canReadClipboardImage, canTakePhoto, CAPTURE_UNSUPPORTED } from '../pictures/sources'
import { useTouchFriendly } from '../pictures/touch'
import { useEditor, type PictureSource } from '../store'

interface Item {
  icon: IconName
  label: string
  hint?: string
  source?: PictureSource
  crop?: boolean
  keys?: string
  disabledNote?: string
}

const PREF_LABEL: Record<PicturesPref, string> = { ask: 'Ask each time', compress: 'Always compress', original: 'Always keep original' }

function Thumb({ id, onPick }: { id: string; onPick: () => void }) {
  const { url } = useImageUrl(id)
  return (
    <button type="button" onClick={onPick} aria-label="Use this picture again" title="Use this picture again" className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-ui border border-line bg-bg hover:border-brand">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} /> : null}
    </button>
  )
}

/**
 * Where a picture comes from: a bottom sheet on a touch screen, a popover on a desktop. The same list serves Add and Replace.
 * Every source starts only from a tap or click here; nothing is opened or recorded by itself.
 */
export function AddPictureMenu() {
  const target = useEditor((s) => s.pictureMenu)
  const readOnly = useEditor((s) => s.readOnly)
  const touch = useTouchFriendly()
  const pref = useSettings((s) => s.picturesPref)
  const setPref = useSettings((s) => s.setPicturesPref)
  const topics = useEditor((s) => s.topics)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (target) ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [target])

  if (!target || readOnly) return null
  const replace = target.kind === 'replace'
  const items: Item[] = [
    { icon: 'download', label: 'Upload file', hint: 'Choose a picture from this device', source: 'upload' },
    { icon: 'image', label: 'Upload and crop…', hint: 'Choose a picture, then cut out the part you want', source: 'upload', crop: true },
    ...(canTakePhoto() ? [{ icon: 'imageAdd' as IconName, label: 'Take photo', hint: 'Open the camera', source: 'camera' as PictureSource }] : []),
    { icon: 'details', label: touch ? 'Choose from Photos' : 'Choose from gallery', hint: 'Including a screenshot saved on this device', source: 'gallery' },
    ...(canReadClipboardImage() ? [{ icon: 'copy' as IconName, label: 'Paste image from clipboard', hint: 'Or select a topic and press Ctrl+V', source: 'paste' as PictureSource }] : []),
    canCaptureScreen()
      ? { icon: 'preview', label: 'Capture screen', hint: 'Take one picture of a screen or window you choose', source: 'capture', keys: 'Alt+Shift+Q' }
      : { icon: 'preview', label: 'Capture screen', hint: CAPTURE_UNSUPPORTED, disabledNote: CAPTURE_UNSUPPORTED },
  ]
  const mine = [...new Set([...pictureIdsInMap(), ...recentPictures().filter((id) => !pictureIdsInMap().includes(id))])].slice(0, 24)
  void topics

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onPointerDown={closeAddPicture} />
      <div
        ref={ref}
        role="dialog"
        aria-label={replace ? 'Replace picture' : 'Add picture'}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), closeAddPicture())}
        className={`fixed z-50 flex max-h-[85dvh] flex-col overflow-y-auto border border-line bg-surface p-3 shadow-2xl ${
          touch ? 'inset-x-0 bottom-0 rounded-t-ui pb-[max(0.75rem,env(safe-area-inset-bottom))]' : 'left-1/2 top-1/3 w-[min(28rem,calc(100vw-1rem))] -translate-x-1/2 rounded-ui'
        }`}
      >
        <h2 className="px-1 pb-2 text-sm font-semibold">{replace ? 'Replace picture' : 'Add picture'}</h2>
        <div role="menu" className="space-y-0.5">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={!!it.disabledNote}
              title={it.hint}
              onClick={() => it.source && void startSource(it.source, target, { crop: it.crop })}
              className={`flex w-full items-center gap-3 rounded-ui px-3 text-left hover:bg-brand/15 disabled:opacity-50 ${touch ? 'min-h-11 py-2' : 'py-1.5'}`}
            >
              <Icon name={it.icon} size={touch ? 22 : 18} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">{it.label}</span>
                <span className="block truncate text-xs text-muted">{it.hint}</span>
              </span>
              {it.keys && <span className="text-xs text-muted">{it.keys}</span>}
            </button>
          ))}
        </div>
        {mine.length > 0 && (
          <section aria-label="Insert from my pictures" className="mt-2 border-t border-line pt-2">
            <h3 className="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">Insert from my pictures</h3>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {mine.map((id) => (
                <Thumb key={id} id={id} onPick={() => void reusePicture(id, target)} />
              ))}
            </div>
          </section>
        )}
        <label className="mt-2 flex items-center justify-between gap-2 border-t border-line px-1 pt-2 text-xs text-muted">
          <span>Using: {PREF_LABEL[pref].toLowerCase()}</span>
          <select aria-label="Pictures: what to do when a picture can be made smaller" value={pref} onChange={(e) => setPref(e.target.value as PicturesPref)} className="rounded-ui border border-line bg-surface px-2 py-1 text-xs text-ink">
            {(Object.keys(PREF_LABEL) as PicturesPref[]).map((p) => (
              <option key={p} value={p}>
                {PREF_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={closeAddPicture} className={`mt-2 rounded-ui border border-line px-3 text-sm hover:bg-bg ${touch ? 'min-h-11' : 'py-1'}`}>
          Cancel
        </button>
      </div>
    </>
  )
}
