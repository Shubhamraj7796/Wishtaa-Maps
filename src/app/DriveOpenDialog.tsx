import { useEffect, useMemo, useRef, useState } from 'react'
import { DriveError } from '@/core/drive/errors'
import { OPEN_HINT } from '@/core/drive/openable'
import type { OpenedDoc } from '@/core/drive/picker'
import type { DriveFolderRef, Placement } from '@/core/drive/placement'
import type { FileRecord } from '@/core/files/types'
import { downscaleImage } from '@/core/images/process'
import { imageStore } from '@/editor/images'
import { downloadEmmx, friendlyReason, inspectPicked, linkFor, summarize, type Inspected, type OpenResult } from './driveOpen'
import { FileKindIcon } from './FileBrowser'
import { plural } from './format'
import { useFiles } from './FilesContext'
import { Cloud, Info } from './icons'
import { ImportReportBody } from './importFlow'
import { importToPlacement, retryDriveUpload, type ImportOutcome, type ImportReport, type ImportSummary } from './importEmmx'
import { Modal, buttonPrimary, buttonSecondary } from './Modal'
import { driveClient } from './drive'
import { driveRepository } from './repo'
import { useDriveActions } from './useDrive'

type Emmx = Extract<Inspected, { kind: 'emmx' }>
type Phase = 'checking' | 'choose' | 'working' | 'done'

interface Row extends OpenResult {
  key: string
  records: FileRecord[]
  summary?: ImportSummary
  /** A failure that can be tried again. */
  retry?: () => Promise<void>
  /** The map was made in this browser but could not be sent to Drive: it can stay here. */
  keepHere?: () => void
}

const deps = { api: driveClient, repo: driveRepository }

/**
 * "Open from Google Drive". Looks at what was picked (names, sizes, contents), then: a .wishtaa opens and autosaves to the same
 * Drive file; an .emmx is downloaded, imported, and saved as a NEW .wishtaa in Drive (the original is only ever read), with
 * a link back to it. Several files are handled one after another and summarised.
 */
export function DriveOpenDialog({ docs, onClose }: { docs: OpenedDoc[]; onClose: () => void }) {
  const f = useFiles()
  const actions = useDriveActions()
  const [phase, setPhase] = useState<Phase>('checking')
  const [items, setItems] = useState<Inspected[]>([])
  const [again, setAgain] = useState<Record<string, boolean>>({})
  const [folder, setFolder] = useState<DriveFolderRef | null>(null)
  const [clearPlaceholder, setClearPlaceholder] = useState(true)
  const [progress, setProgress] = useState<{ name: string; fraction: number } | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const started = useRef(false)

  const sender = useMemo(
    () => ({
      moveToDrive: async (id: string, folderId?: string) => {
        if (!(await actions.ensureConnected())) throw new DriveError('auth', 'Google Drive is not connected, so the map was kept in this browser.')
        return driveRepository.moveToDrive(id, folderId)
      },
    }),
    [actions]
  )
  const placement: Placement = { storage: 'drive', folder }

  // 1. Look at what was picked.
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const found = await inspectPicked(docs, deps)
      const ok = found.filter((i) => i.status === 'ok')
      const rejected = found.filter((i) => i.status === 'rejected')
      setItems(found)
      // One .wishtaa and nothing else: just open it.
      if (ok.length === 1 && rejected.length === 0 && ok[0]?.kind === 'wishtaa') {
        try {
          const rec = await driveRepository.openFromDrive(ok[0].id)
          onClose()
          f.open(rec)
        } catch (e) {
          setRows([{ key: ok[0].id, name: ok[0].name, status: 'failed', detail: friendlyReason(e), records: [] }])
          setPhase('done')
        }
        return
      }
      if (ok.some((i) => i.kind === 'emmx')) setPhase('choose')
      else void run(found, {})
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const convert = async (item: Emmx): Promise<Row> => {
    const key = item.id
    const fail = (e: unknown, retry: () => Promise<void>): Row => ({ key, name: item.name, status: 'failed', detail: friendlyReason(e), records: [], retry })
    let file
    try {
      setProgress({ name: item.name, fraction: 0 })
      file = await downloadEmmx(item, deps, (fraction) => setProgress({ name: item.name, fraction }))
    } catch (e) {
      return fail(e, async () => void (await redo(item)))
    } finally {
      setProgress(null)
    }
    const link = linkFor(item)
    let out: ImportOutcome
    try {
      out = await importToPlacement([file], { repo: f.repo, images: imageStore, downscale: downscaleImage, options: { clearPlaceholderText: clearPlaceholder } }, placement, sender, [link])
    } catch (e) {
      return fail(e, async () => void (await redo(item)))
    }
    const summary = out.summaries[0] as ImportSummary
    if (summary.error) return { key, name: item.name, status: 'failed', detail: summary.error, records: [], summary }
    const records = summary.files.map((m) => m.record)
    if (out.failures.length) {
      // The map is safe in this browser; Drive did not take it. Try again, or keep it here.
      const why = friendlyReason(out.failures[0]?.error)
      return {
        key,
        name: item.name,
        status: 'failed',
        detail: `${why} The converted map is saved in this browser.`,
        records,
        summary,
        retry: async () => {
          const next = await retryDriveUpload(out, sender, placement)
          replace({ key, name: item.name, status: next.failures.length ? 'failed' : 'converted', detail: next.failures.length ? friendlyReason(next.failures[0]?.error) : undefined, records: next.summaries[0]?.files.map((m) => m.record) ?? records, summary: next.summaries[0] })
        },
        keepHere: () => replace({ key, name: item.name, status: 'converted', detail: 'Saved in this browser (not in Google Drive).', records, summary }),
      }
    }
    return { key, name: item.name, status: 'converted', records, summary }
  }

  const replace = (row: Row) => setRows((all) => all.map((r) => (r.key === row.key ? row : r)))
  const redo = async (item: Emmx) => replace(await convert(item))

  // 2. Do it, one file after another.
  const run = async (list: Inspected[], opts: { again?: Record<string, boolean> }) => {
    setPhase('working')
    const done: Row[] = []
    const push = (r: Row) => {
      done.push(r)
      setRows([...done])
    }
    for (const item of list) {
      if (item.status === 'rejected') {
        push({ key: item.id, name: item.name, status: 'skipped', detail: item.reason, records: [] })
        continue
      }
      try {
        if (item.kind === 'wishtaa') {
          const rec = await driveRepository.openFromDrive(item.id)
          push({ key: item.id, name: item.name, status: 'opened', records: [rec] })
        } else if (item.converted && !opts.again?.[item.id]) {
          const rec = item.converted.local ?? (item.converted.driveFileId ? await driveRepository.openFromDrive(item.converted.driveFileId) : undefined)
          push(rec ? { key: item.id, name: item.name, status: 'opened', detail: 'Opened the converted copy.', records: [rec] } : { key: item.id, name: item.name, status: 'failed', detail: 'The converted copy could not be found.', records: [] })
        } else {
          const row = await convert(item)
          push(row)
          // The row's retry replaces itself in the list, so keep the list in step with what is shown.
          done[done.length - 1] = row
        }
      } catch (e) {
        push({ key: item.id, name: item.name, status: 'failed', detail: friendlyReason(e), records: [] })
      }
    }
    // A single clean result opens straight away.
    const only = done.length === 1 ? done[0] : undefined
    if (only && only.status === 'opened' && only.records[0]) {
      onClose()
      f.open(only.records[0])
      return
    }
    setPhase('done')
  }

  const chooseFolder = async () => {
    const picked = await actions.pickFolder()
    if (picked) setFolder(picked)
  }

  const footer = (
    <p className="mt-3 flex items-start gap-2 border-t border-line pt-2 text-xs text-muted">
      <Info size={13} aria-hidden="true" className="mt-0.5 shrink-0" /> {OPEN_HINT}
    </p>
  )

  if (phase === 'checking') {
    return (
      <Modal title="Open from Google Drive" onClose={() => undefined}>
        <p role="status" className="py-4 text-center text-sm text-muted">
          Checking {plural(docs.length, 'file')}…
        </p>
      </Modal>
    )
  }

  if (phase === 'choose') {
    const emmx = items.filter((i): i is Emmx => i.status === 'ok' && i.kind === 'emmx')
    const rejected = items.filter((i): i is Extract<Inspected, { status: 'rejected' }> => i.status === 'rejected')
    const others = items.filter((i) => i.status === 'ok' && i.kind === 'wishtaa')
    const needsNew = emmx.some((e) => !e.converted || again[e.id])
    return (
      <Modal title="Open from Google Drive" onClose={onClose} wide>
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            {plural(emmx.length, '.emmx file')} will be converted into a <strong className="text-ink">new .wishtaa copy</strong>. The original is never changed.
          </p>
          <ul className="space-y-2">
            {emmx.map((e) => (
              <li key={e.id} className="rounded-ui border border-line px-3 py-2">
                <p className="font-medium">{e.name}</p>
                {e.converted ? (
                  <fieldset className="mt-1 space-y-1" aria-label={`What to do with ${e.name}`}>
                    <p className="text-xs text-muted">
                      It was already converted
                      {e.converted.link.importedAt ? ` on ${new Date(e.converted.link.importedAt).toLocaleDateString()}` : ''}.
                      {e.converted.changed && <strong className="text-warn"> The .emmx has changed since then.</strong>}
                    </p>
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`c-${e.id}`} checked={!again[e.id]} onChange={() => setAgain({ ...again, [e.id]: false })} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
                      Open the converted copy
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name={`c-${e.id}`} checked={!!again[e.id]} onChange={() => setAgain({ ...again, [e.id]: true })} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
                      Import again as a new copy
                    </label>
                  </fieldset>
                ) : (
                  <p className="text-xs text-muted">Will be converted.</p>
                )}
              </li>
            ))}
          </ul>
          {needsNew && (
            <div className="space-y-2 rounded-ui border border-line p-3">
              <p className="flex items-center gap-2">
                <Cloud size={15} aria-hidden="true" /> Save the new .wishtaa files in:
                <strong>{folder ? folder.name : 'Wishtaa Maps (your Drive)'}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonSecondary} onClick={() => void chooseFolder()}>
                  Choose folder…
                </button>
                {folder && (
                  <button type="button" className={buttonSecondary} onClick={() => setFolder(null)}>
                    Use Wishtaa Maps
                  </button>
                )}
              </div>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={clearPlaceholder} onChange={(e) => setClearPlaceholder(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
                <span>
                  Clear placeholder text on topics that have a picture
                  <span className="block text-xs text-muted">MindMaster fills them with words like “Title”; they are not your text.</span>
                </span>
              </label>
            </div>
          )}
          {others.length > 0 && <p className="text-xs text-muted">{plural(others.length, '.wishtaa file')} will be opened and saved to the same Drive file.</p>}
          {rejected.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-ui border border-bad/50 bg-bad/10 px-3 py-2 text-xs">
              {rejected.map((r) => (
                <li key={r.id}>{r.reason}</li>
              ))}
            </ul>
          )}
        </div>
        {footer}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" data-autofocus className={buttonPrimary} onClick={() => void run(items, { again })}>
            {needsNew ? 'Convert and open' : 'Open'}
          </button>
        </div>
      </Modal>
    )
  }

  if (phase === 'working') {
    return (
      <Modal title="Open from Google Drive" onClose={() => undefined}>
        <div className="space-y-2 py-2 text-sm" role="status">
          <p className="text-center text-muted">{progress ? `Downloading “${progress.name}”…` : 'Working…'}</p>
          {progress && (
            <div role="progressbar" aria-label="Download progress" aria-valuenow={Math.round(progress.fraction * 100)} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-bg">
              <div className="h-full bg-brand transition-all" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
            </div>
          )}
          {rows.length > 0 && <p className="text-center text-xs text-muted">{plural(rows.length, 'file')} done so far.</p>}
        </div>
      </Modal>
    )
  }

  const sum = summarize(rows)
  const report: ImportReport = { summaries: rows.flatMap((r) => (r.summary ? [r.summary] : [])) }
  return (
    <Modal title="Open from Google Drive" onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <p role="status" data-testid="open-summary">
          {[sum.converted && `${sum.converted} converted`, sum.opened && `${sum.opened} opened`, sum.skipped && `${sum.skipped} skipped`, sum.failed && `${sum.failed} failed`].filter(Boolean).join(', ') || 'Nothing was opened.'}
        </p>
        <ul className="divide-y divide-line rounded-ui border border-line">
          {rows.map((r) => (
            <li key={r.key} className="flex flex-wrap items-center gap-3 px-3 py-2" data-status={r.status}>
              <FileKindIcon type="map" size={18} className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.name}</span>
                <span className={`block text-xs ${r.status === 'failed' || r.status === 'skipped' ? 'text-bad' : 'text-muted'}`}>
                  {r.status === 'converted' ? `Converted to ${plural(r.records.length, 'new .wishtaa file')}${r.detail ? `. ${r.detail}` : ''}` : r.status === 'opened' ? (r.detail ?? 'Opened.') : (r.detail ?? '')}
                </span>
              </span>
              {r.records.map((rec) => (
                <button key={rec.id} type="button" className={buttonSecondary} onClick={() => { onClose(); f.open(rec) }}>
                  Open{r.records.length > 1 ? ` ${rec.name}` : ''}
                </button>
              ))}
              {r.keepHere && (
                <button type="button" className={buttonSecondary} onClick={r.keepHere}>
                  Convert into this browser instead
                </button>
              )}
              {r.retry && (
                <button type="button" className={buttonPrimary} onClick={() => void r.retry?.()}>
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
        {report.summaries.length > 0 && <ImportReportBody report={report} onOpen={(rec) => { onClose(); f.open(rec) }} />}
      </div>
      {footer}
      <div className="mt-4 flex justify-end">
        <button type="button" data-autofocus className={buttonPrimary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
