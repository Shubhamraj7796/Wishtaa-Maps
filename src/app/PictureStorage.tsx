import { useEffect, useState, useSyncExternalStore } from 'react'
import { imageStore } from '@/editor/images'
import { useSettings } from '@/stores/settings'
import { buttonSecondary } from './Modal'
import { uploadingText } from '@/core/drive/progress'
import { pictureSync } from './repo'

const mb = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`)

interface Usage {
  pictures: number
  bytes: number
  used: number | null
  quota: number | null
  persisted: boolean | null
}

async function readUsage(): Promise<Usage> {
  let pictures = 0
  let bytes = 0
  try {
    for (const id of await imageStore.keys()) {
      const m = await imageStore.getMeta(id)
      if (m) {
        pictures++
        bytes += m.size
      }
    }
  } catch {
    /* storage unavailable */
  }
  let used: number | null = null
  let quota: number | null = null
  let persisted: boolean | null = null
  try {
    const est = await navigator.storage?.estimate?.()
    used = est?.usage ?? null
    quota = est?.quota ?? null
    persisted = (await navigator.storage?.persisted?.()) ?? null
  } catch {
    /* not supported */
  }
  return { pictures, bytes, used, quota, persisted }
}

/** Storage and picture uploads: what this browser holds, and how pictures go to Google Drive. */
export function PictureStorage() {
  const mode = useSettings((s) => s.pictureUploads)
  const setMode = useSettings((s) => s.setPictureUploads)
  const saver = useSettings((s) => s.pauseOnDataSaver)
  const setSaver = useSettings((s) => s.setPauseOnDataSaver)
  const status = useSyncExternalStore(pictureSync.subscribe, pictureSync.getStatus)
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    let live = true
    void readUsage().then((u) => live && setUsage(u))
    return () => {
      live = false
    }
  }, [status.pictures])

  return (
    <fieldset className="rounded-ui border border-line p-3">
      <legend className="px-1 font-semibold">Storage and picture uploads</legend>
      <p data-testid="storage-usage" className="text-xs text-muted">
        {usage ? (
          <>
            Pictures in this browser: {usage.pictures}, {mb(usage.bytes)}.
            {usage.used !== null && usage.quota !== null && <> This site uses {mb(usage.used)} of about {mb(usage.quota)} available.</>}
            {usage.persisted === true && ' Your browser will keep this data.'}
            {usage.persisted === false && ' The browser may clear this data if the device runs low on space; saving maps to Google Drive keeps them safe.'}
          </>
        ) : (
          'Checking…'
        )}
      </p>
      <div className="mt-2 text-sm">
        <div className="font-medium">Picture uploads to Google Drive</div>
        {(
          [
            ['auto', 'Automatic', 'Pictures go up in the background while you work.'],
            ['manual', 'Only when I tap Sync', 'Maps save at once; pictures wait until you press Sync now.'],
          ] as const
        ).map(([id, label, hint]) => (
          <label key={id} className="flex items-start gap-2 py-0.5">
            <input type="radio" name="picture-uploads" checked={mode === id} onChange={() => setMode(id)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
            <span>
              {label}
              {id === 'auto' && <span className="text-xs text-muted"> (default)</span>}
              <span className="block text-xs text-muted">{hint}</span>
            </span>
          </label>
        ))}
        <label className="mt-1 flex items-start gap-2 py-0.5">
          <input type="checkbox" checked={saver} onChange={(e) => setSaver(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
          <span>
            Pause uploads on data saver
            <span className="block text-xs text-muted">Where your browser reports it (mostly Android).</span>
          </span>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite" data-testid="upload-queue">
        <span>
          {status.pictures === 0
            ? 'No pictures waiting to upload.'
            : `${uploadingText(status)}${status.retrying ? ` (${status.retrying} will retry)` : ''}${status.paused ? ', paused' : ''}.`}
        </span>
        {status.lastError && status.pictures > 0 && <span className="w-full text-xs text-bad">{status.lastError}</span>}
        {status.pictures > 0 && (
          <>
            <button type="button" className={buttonSecondary} onClick={() => void pictureSync.syncNow()}>
              Sync now
            </button>
            <button type="button" className={buttonSecondary} onClick={() => (status.paused ? pictureSync.resume() : pictureSync.pause())}>
              {status.paused ? 'Resume' : 'Pause'}
            </button>
          </>
        )}
      </div>
    </fieldset>
  )
}
