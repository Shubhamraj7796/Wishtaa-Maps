import { useCallback, useEffect, useState } from 'react'
import type { FileRecord } from '@/core/files/types'
import * as C from '@/editor/content'
import { showNotice } from '@/editor/notice'
import { reopenFile } from '@/editor/session'
import { useEditor } from '@/editor/store'
import { commandById, displayKeys } from '@/editor/registry'
import { Icon } from '@/ui/icons'
import { IconButton } from '@/ui/IconButton'
import { driveRepository } from './repo'

const Divider = () => <div className="mx-1 h-7 w-px shrink-0 bg-line" aria-hidden="true" />

/**
 * Brings in what changed in Google Drive since the file was opened. Safe in Read mode: it only reads from Drive, never
 * writes to it, and never asks about conflicts.
 */
export function useDriveRefresh(file: FileRecord) {
  const [busy, setBusy] = useState(false)
  const drive = file.storage === 'drive'
  const refresh = useCallback(
    async (quiet = false) => {
      if (!drive) return
      setBusy(true)
      try {
        const out = await driveRepository.refresh(file.id)
        if (out === 'updated') {
          await reopenFile(file.id)
          showNotice('Updated from Google Drive.')
        } else if (!quiet) showNotice(out === 'same' ? 'Already up to date with Google Drive.' : 'Could not check Google Drive right now.')
      } finally {
        setBusy(false)
      }
    },
    [drive, file.id]
  )
  // A quiet check whenever the tab comes back into view.
  useEffect(() => {
    if (!drive) return
    const onFocus = () => void refresh(true)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [drive, refresh])
  return { drive, busy, refresh }
}

/** The calm toolbar of Read mode: views, and refreshing from Drive. No editing tools. */
export function ReadToolbar({ file }: { file: FileRecord }) {
  const view = useEditor((s) => s.view)
  const { drive, busy, refresh } = useDriveRefresh(file)
  const outline = commandById('viewOutline')
  return (
    <div role="toolbar" aria-label="Reading tools" className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line bg-surface px-3 py-1">
      <IconButton icon="map" label="Map view" active={view === 'map'} onClick={() => C.setView('map')} caption="Map" />
      <IconButton icon="outline" label="Outline view" keys={outline ? displayKeys(outline) : undefined} active={view === 'outline'} onClick={() => C.setView('outline')} caption="Outline" />
      {drive && (
        <>
          <Divider />
          <button
            type="button"
            disabled={busy}
            onClick={() => void refresh()}
            className="flex items-center gap-1.5 rounded-ui px-2 py-1 text-sm hover:bg-bg disabled:opacity-50"
            title="Check Google Drive for changes made elsewhere. Nothing is written to Drive."
          >
            <Icon name="refresh" size={16} /> {busy ? 'Checking…' : 'Refresh from Drive'}
          </button>
        </>
      )}
      <span className="ml-auto hidden text-xs text-muted md:inline">Read mode: nothing can be changed.</span>
    </div>
  )
}
