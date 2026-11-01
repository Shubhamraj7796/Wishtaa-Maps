import { useEffect, useState, useSyncExternalStore } from 'react'
import { driveRepository } from '@/app/repo'
import type { Recoverable } from '@/core/drive/syncStore'
import { reopenFile } from '@/editor/session'
import { useEditor } from '@/editor/store'
import { showNotice } from '@/editor/notice'

let target: string | null = null
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn))
const snapshot = () => target

/** Opens "Recover earlier version" for a Drive map (from its file menu, or the command palette). */
export function openRecover(fileId: string) {
  target = fileId
  listeners.forEach((l) => l())
}
const close = () => openRecover(null as unknown as string)

const when = (at: number) => new Date(at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/**
 * When two devices change the same thing in a map, the newer change is kept and the other is saved here. This lists those saved
 * versions and puts one back (it is then saved and sent like any edit, and the version it replaced is saved in turn).
 */
export function RecoverHost() {
  const fileId = useSyncExternalStore(subscribe, snapshot, snapshot)
  const [list, setList] = useState<Recoverable[] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setList(null)
    if (fileId) void driveRepository.recoverable(fileId).then(setList)
  }, [fileId])
  if (!fileId) return null

  const restore = async (v: Recoverable) => {
    setBusy(true)
    try {
      await driveRepository.recoverVersion(fileId, v.key)
      if (useEditor.getState().fileId === fileId) await reopenFile(fileId)
      showNotice('Earlier version restored.')
      close()
    } catch (e) {
      showNotice(e instanceof Error ? e.message : 'That version could not be restored.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-3" role="presentation" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Recover earlier version" className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-ui border border-line bg-surface shadow-2xl">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold">Recover earlier version</h2>
          <button type="button" className="ml-auto rounded px-2 py-1 hover:bg-bg" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>
        <p className="px-4 pt-3 text-sm text-muted">When two devices change the same thing in a map, the newer change is kept and the other one is saved here, so nothing you wrote is lost.</p>
        <div className="min-h-[6rem] flex-1 overflow-auto px-4 py-3">
          {list === null && <p className="text-sm text-muted">Looking…</p>}
          {list?.length === 0 && <p className="text-sm text-muted">There are no earlier versions to recover for this map.</p>}
          <ul className="space-y-2">
            {list?.map((v) => (
              <li key={v.key} className="rounded-ui border border-line p-3 text-sm">
                <div className="font-medium">{when(v.at)}</div>
                <div className="text-muted">{v.note}</div>
                {v.fields.length > 0 && <div className="mt-1 text-xs text-muted">{v.fields.join('; ')}</div>}
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" disabled={busy} className="rounded-ui border border-line px-2.5 py-1.5 text-sm hover:bg-bg" onClick={() => void driveRepository.recoverableDelete(fileId, v.key).then(() => driveRepository.recoverable(fileId)).then(setList)}>
                    Forget
                  </button>
                  <button type="button" disabled={busy} className="rounded-ui bg-brand px-2.5 py-1.5 text-sm font-semibold text-brand-ink disabled:opacity-50" onClick={() => void restore(v)}>
                    Restore this version
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
