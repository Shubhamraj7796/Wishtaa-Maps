import { useEffect, useMemo, useRef, useState } from 'react'
import { useMatch } from 'react-router-dom'
import { DriveError } from '@/core/drive/errors'
import { decidePlacement, type CreateSource, type DriveFolderRef, type Placement } from '@/core/drive/placement'
import { downscaleImage } from '@/core/images/process'
import { imageStore } from '@/editor/images'
import { getPrefs } from './createPrefs'
import { initialPickerState, placementFor, rememberChoice, SaveToPicker, type PickerState } from './createFlow'
import { useFiles, type Dialog } from './FilesContext'
import { importToPlacement, retryDriveUpload, type ImportOutcome, type ImportReport, type ImportSummary } from './importEmmx'
import { Modal, buttonPrimary, buttonSecondary } from './Modal'
import { FileKindIcon } from './FileBrowser'
import { plural } from './format'
import { Info } from './icons'
import { driveRepository } from './repo'
import { useDriveActions, useDriveAuth } from './useDrive'

const isLinked = (status: string) => status === 'connected' || status === 'reconnect'

/** Asks the browser for .emmx files. Must be called from a click. */
export function pickEmmxFiles(onPicked: (files: File[]) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.emmx'
  input.multiple = true
  input.onchange = () => {
    const files = [...(input.files ?? [])]
    if (files.length) onPicked(files)
  }
  input.click()
}

interface Present {
  open: ReturnType<typeof useFiles>['open']
  notify: (text: string) => void
  setDialog: (d: Dialog | null) => void
}

/** Shows the result: a clean single import opens the map; anything else gets a report of what happened. */
export function presentImport(summaries: ImportSummary[], { open, notify, setDialog }: Present) {
  const made = summaries.flatMap((s) => s.files)
  const clean = summaries.length === 1 && !summaries[0]?.error && summaries[0]?.warnings.length === 0 && made.length === 1
  if (clean && made[0]) {
    setDialog(null)
    notify(`Imported "${made[0].record.name}": ${plural(made[0].topics, 'topic')}, ${plural(made[0].images, 'picture')}.`)
    open(made[0].record)
  } else {
    setDialog({ kind: 'importReport', report: { summaries } })
  }
}

export interface ImportStartOptions {
  source?: CreateSource
  /** On the Google Drive page: the folder being viewed (null = the Wishtaa Maps folder). */
  driveFolder?: DriveFolderRef | null
  /** Called when the import is finished (to refresh a listing). */
  onDone?: () => void
}

/**
 * Importing `.emmx` files. Where the maps are saved is decided like for a new file: right in the folder being viewed
 * (a local folder, or a Drive folder on the Google Drive page), otherwise by asking ("Save to").
 */
export function useImportEmmx() {
  const f = useFiles()
  const auth = useDriveAuth()
  const inFolder = useMatch('/files/:folderId')
  const localFolderId = inFolder?.params.folderId ?? null
  const connected = isLinked(auth.status)
  const { repo, open, notify, setDialog } = f

  return useMemo(() => {
    /** Into this browser, in a folder: no question, no dialog. */
    const runLocal = async (files: File[], parentId: string | null) => {
      notify(files.length === 1 ? `Importing "${files[0]?.name}"…` : `Importing ${files.length} files…`)
      const out = await importToPlacement(files, { repo, images: imageStore, downscale: downscaleImage }, { storage: 'local', parentId }, driveRepository)
      presentImport(out.summaries, { open, notify, setDialog })
    }

    /** Choose the files now (a click is needed), then import to a place that is already decided. */
    const pickWith = (placement: Placement, localParentId: string | null, onDone?: () => void) =>
      pickEmmxFiles((files) => {
        if (placement.storage === 'local') void runLocal(files, placement.parentId).then(() => onDone?.())
        else setDialog({ kind: 'import', localParentId, fixed: placement, files, onDone })
      })

    const pick = (opts: ImportStartOptions = {}) => {
      const decision = decidePlacement({ source: opts.source ?? 'home', localFolderId, driveFolder: opts.driveFolder ?? null }, getPrefs(), connected)
      if (decision.ask) setDialog({ kind: 'import', localParentId: localFolderId, onDone: opts.onDone })
      else pickWith(decision.placement, localFolderId, opts.onDone)
    }

    return { pick, pickWith }
  }, [repo, open, notify, setDialog, localFolderId, connected])
}

type ImportDialogProps = Extract<Dialog, { kind: 'import' }>

/**
 * The import dialog: choose where to save ("Save to": This browser or Google Drive) and then the file. When the place is
 * already decided it just imports and shows progress or a problem. A map is never lost: in Drive, it is first kept in
 * this browser, then created in Drive with its pictures.
 */
export function ImportDialog({ d, onClose }: { d: ImportDialogProps; onClose: () => void }) {
  const f = useFiles()
  const auth = useDriveAuth()
  const actions = useDriveActions()
  const connected = isLinked(auth.status)
  const [state, setState] = useState<PickerState>(() => initialPickerState(connected))
  const [phase, setPhase] = useState<'choose' | 'working' | 'failed'>(d.files ? 'working' : 'choose')
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(d.fixed ?? null)
  const started = useRef(false)

  // Imports into Drive sign in first if needed (this runs from a click, so the sign-in window is allowed).
  const sender = useMemo(
    () => ({
      moveToDrive: async (id: string, folder?: string) => {
        if (!(await actions.ensureConnected())) throw new DriveError('auth', 'Google Drive is not connected, so the map was kept in this browser.')
        return driveRepository.moveToDrive(id, folder)
      },
    }),
    [actions]
  )

  const done = (out: ImportOutcome) => {
    onClose()
    presentImport(out.summaries, f)
    d.onDone?.()
  }

  const run = async (files: File[], where: Placement) => {
    setPlacement(where)
    setPhase('working')
    const out = await importToPlacement(files, { repo: f.repo, images: imageStore, downscale: downscaleImage }, where, sender)
    setOutcome(out)
    if (out.failures.length) setPhase('failed')
    else done(out)
  }

  useEffect(() => {
    if (d.files && d.fixed && !started.current) {
      started.current = true
      void run(d.files, d.fixed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const choose = () => {
    rememberChoice(state)
    const where = placementFor(state, d.localParentId)
    pickEmmxFiles((files) => void run(files, where))
  }

  const keepHere = () => {
    if (outcome) done(outcome)
    else onClose()
  }

  if (phase === 'failed' && outcome) {
    const first = outcome.failures[0]
    const count = outcome.failures.length
    return (
      <Modal
        title="Could not save to Google Drive"
        onClose={() => {
          f.notify(`The imported ${count === 1 ? 'map is' : 'maps are'} saved in this browser, not in Google Drive.`)
          onClose()
        }}
      >
        <div role="alert" className="space-y-2 text-sm">
          <p>{first?.error.message}</p>
          <p className="text-xs text-muted">
            {count === 1 ? 'Your imported map is' : `Your ${count} imported maps are`} safe in this browser. You can try Drive again, or keep {count === 1 ? 'it' : 'them'} here.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className={buttonSecondary} onClick={keepHere}>
            Import to this browser instead
          </button>
          <button
            type="button"
            data-autofocus
            className={buttonPrimary}
            onClick={async () => {
              setPhase('working')
              const next = await retryDriveUpload(outcome, sender, placement ?? { storage: 'drive', folder: null })
              setOutcome(next)
              if (next.failures.length) setPhase('failed')
              else done(next)
            }}
          >
            Retry
          </button>
        </div>
      </Modal>
    )
  }

  if (phase === 'working') {
    const where = placement ? (placement.storage === 'drive' ? 'Google Drive' : 'this browser') : 'this browser'
    return (
      <Modal title="Import" onClose={() => undefined}>
        <p role="status" className="py-4 text-center text-sm text-muted">
          Importing and saving to {where}…
        </p>
      </Modal>
    )
  }

  return (
    <Modal title="Import" onClose={onClose}>
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-xs text-muted">
          <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> Opens a MindMaster or EdrawMind <strong>.emmx</strong> file as editable maps.
        </p>
        <SaveToPicker state={state} onChange={setState} onConnected={() => undefined} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button type="button" data-autofocus onClick={choose} className={buttonPrimary}>
            Choose file…
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** What an import did: maps created, what was left out, and shape types to send samples of. */
export function ImportReportDialog({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  const f = useFiles()
  const made = report.summaries.flatMap((s) => s.files)
  const unknown = report.summaries.flatMap((s) => Object.entries(s.unknownTypes))
  const unsupported = report.summaries.flatMap((s) => Object.entries(s.unsupportedElements))
  const title = made.length ? `Imported ${plural(made.length, 'map')}` : 'Nothing was imported'

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        {report.summaries.map((s) => (
          <section key={s.fileName} aria-label={s.fileName} className="space-y-2">
            {report.summaries.length > 1 && <h3 className="font-semibold">{s.fileName}</h3>}
            {s.error && (
              <p role="alert" className="rounded-ui border border-bad/50 bg-bad/10 px-3 py-2">
                {s.error}
              </p>
            )}
            {s.files.length > 0 && (
              <ul className="divide-y divide-line rounded-ui border border-line">
                {s.files.map((m) => (
                  <li key={m.record.id} className="flex items-center gap-3 px-3 py-2">
                    <FileKindIcon type="map" size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.record.name}</span>
                      <span className="block text-xs text-muted">
                        {plural(m.topics, 'topic')}, {plural(m.images, 'picture')} · {m.record.storage === 'drive' ? 'Saved in Google Drive' : 'Saved in this browser'}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={buttonSecondary}
                      onClick={() => {
                        onClose()
                        f.open(m.record)
                      }}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {s.warnings.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Info size={13} aria-hidden="true" /> Left out or changed
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
        {(unknown.length > 0 || unsupported.length > 0) && (
          <div className="rounded-ui border border-line bg-bg px-3 py-2 text-xs">
            <p className="font-semibold">Not supported yet</p>
            <p className="mt-0.5 text-muted">If you want these imported, send a sample file so support can be added:</p>
            <p className="mt-1">
              {[...unknown.map(([n, c]) => `shape “${n}” × ${c}`), ...unsupported.map(([n, c]) => `element “${n}” on ${c} topic${c === 1 ? '' : 's'}`)].join(', ')}
            </p>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" data-autofocus className={buttonPrimary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
