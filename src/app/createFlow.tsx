import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMatch, useNavigate } from 'react-router-dom'
import { createHereInstead, createItem, retryCreate, type CreateOutcome, type CreateServices, type NewItem } from '@/core/drive/create'
import {
  choiceLabel,
  decidePlacement,
  defaultChoice,
  type CreateSource,
  type DriveFolderRef,
  type Placement,
  type StorageChoice,
} from '@/core/drive/placement'
import type { FileRecord } from '@/core/files/types'
import { getPrefs, setPrefs } from './createPrefs'
import { setCreateHandler } from './createBus'
import { useFiles, type Dialog } from './FilesContext'
import { Modal, buttonPrimary, buttonSecondary } from './Modal'
import { Cloud, HardDrive, Info } from './icons'
import { driveRepository } from './repo'
import { useDriveActions, useDriveAuth } from './useDrive'

type Failed = Extract<CreateOutcome, { status: 'drive-failed' }>

const isLinked = (status: string) => status === 'connected' || status === 'reconnect'

export const ITEM_TITLES: Record<NewItem, string> = { map: 'New mind map', kb: 'New knowledge base', folder: 'New folder' }

export function useCreateServices(): CreateServices {
  const { repo } = useFiles()
  return useMemo(() => ({ repo, drive: driveRepository }), [repo])
}

export interface StartOptions {
  source?: CreateSource
  /** On the Google Drive page: the folder being viewed (null = the Wishtaa Maps folder). */
  driveFolder?: DriveFolderRef | null
  /** Called after a folder was created in Drive (to refresh the listing). */
  onFolderCreated?: () => void
}

/**
 * Starts creating a mind map, knowledge base or folder. Decides from where it was started whether to ask where to save
 * it, or to create it right there (see `decidePlacement`).
 */
export function useCreate() {
  const f = useFiles()
  const auth = useDriveAuth()
  const services = useCreateServices()
  const inFolder = useMatch('/files/:folderId')
  const localFolderId = inFolder?.params.folderId ?? null
  const connected = isLinked(auth.status)
  const { setDialog, open, notify } = f

  return useMemo(() => {
    /** Create in a place that is already decided. Drive placements show progress and any failure in the dialog. */
    const startWith = async (item: NewItem, placement: Placement, localParentId: string | null, extra: Pick<StartOptions, 'onFolderCreated'> = {}) => {
      if (item === 'folder' || placement.storage === 'drive') {
        setDialog({ kind: 'saveTo', item, localParentId, fixed: placement, onFolderCreated: extra.onFolderCreated })
        return
      }
      try {
        const out = await createItem(services, { kind: item, placement })
        if (out.status === 'created' && out.record) open(out.record)
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not create the file.')
      }
    }

    const start = (item: NewItem, opts: StartOptions = {}) => {
      const decision = decidePlacement({ source: opts.source ?? 'home', localFolderId, driveFolder: opts.driveFolder ?? null }, getPrefs(), connected)
      if (decision.ask) setDialog({ kind: 'saveTo', item, localParentId: localFolderId, onFolderCreated: opts.onFolderCreated })
      else void startWith(item, decision.placement, localFolderId, opts)
    }

    return { start, startWith, localFolderId }
  }, [services, setDialog, open, notify, localFolderId, connected])
}

/** Connects the command palette ("New mind map...") to the same flow. */
export function CreateBridge() {
  const { start } = useCreate()
  useEffect(() => {
    setCreateHandler((item) => start(item, { source: 'palette' }))
    return () => setCreateHandler(null)
  }, [start])
  return null
}

// ------------------------------------------------------------------------------------------------------------------

export interface PickerState {
  choice: StorageChoice
  folder: DriveFolderRef | null
  dontAsk: boolean
}

/** The starting state of the "Save to" controls, from what was remembered and whether Drive is connected. */
export function initialPickerState(connected: boolean): PickerState {
  const prefs = getPrefs()
  return { choice: defaultChoice(prefs, connected), folder: prefs.driveFolder, dontAsk: false }
}

/** Remembers a choice made in the dialog (and "don't ask again" if ticked). */
export function rememberChoice(s: PickerState) {
  setPrefs({ last: s.choice, driveFolder: s.folder, ...(s.dontAsk ? { always: s.choice } : {}) })
}

export function placementFor(s: PickerState, localParentId: string | null): Placement {
  return s.choice === 'drive' ? { storage: 'drive', folder: s.folder } : { storage: 'local', parentId: localParentId }
}

const linkButton = 'text-xs font-medium text-brand underline underline-offset-2 hover:opacity-80'

/**
 * "Save to": This browser or Google Drive (with its folder). When Drive is not connected it offers Connect, which
 * signs in and then calls `onConnected`.
 */
export function SaveToPicker({ state, onChange, onConnected, disabled }: { state: PickerState; onChange: (s: PickerState) => void; onConnected: () => void; disabled?: boolean }) {
  const auth = useDriveAuth()
  const actions = useDriveActions()
  const connected = isLinked(auth.status)
  const set = (patch: Partial<PickerState>) => onChange({ ...state, ...patch })

  const row = (active: boolean) => `flex items-start gap-3 rounded-ui border px-3 py-2.5 ${active ? 'border-brand bg-brand/10' : 'border-line'}`

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">Save to</legend>

      <label className={`${row(state.choice === 'local')} cursor-pointer`}>
        <input type="radio" name="save-to" value="local" checked={state.choice === 'local'} onChange={() => set({ choice: 'local' })} className="mt-1 h-4 w-4 accent-[rgb(var(--c-brand))]" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium"><HardDrive size={15} aria-hidden="true" /> This browser</span>
          <span className="block text-xs text-muted">Fast, and works offline. Files stay on this device.</span>
        </span>
      </label>

      {!actions.configured ? (
        <div className={`${row(false)} opacity-60`}>
          <Cloud size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span className="text-xs text-muted">Google Drive is not set up on this site yet.</span>
        </div>
      ) : connected ? (
        <div className={row(state.choice === 'drive')}>
          <input id="save-to-drive" type="radio" name="save-to" value="drive" checked={state.choice === 'drive'} onChange={() => set({ choice: 'drive' })} className="mt-1 h-4 w-4 accent-[rgb(var(--c-brand))]" />
          <div className="min-w-0 flex-1">
            <label htmlFor="save-to-drive" className="flex cursor-pointer items-center gap-1.5 text-sm font-medium">
              <Cloud size={15} aria-hidden="true" /> Google Drive ({auth.account ?? 'connected'})
            </label>
            {state.choice === 'drive' && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                <span>
                  Location: <strong className="text-ink">{state.folder?.name ?? 'Wishtaa Maps'}</strong>
                  {state.folder ? '' : ' (default)'}
                </span>
                <button
                  type="button"
                  className={linkButton}
                  onClick={async () => {
                    const picked = await actions.pickFolder()
                    if (picked) {
                      set({ folder: picked, choice: 'drive' })
                      setPrefs({ driveFolder: picked })
                    }
                  }}
                >
                  Choose another folder
                </button>
                {state.folder && (
                  <button
                    type="button"
                    className={linkButton}
                    onClick={() => {
                      set({ folder: null })
                      setPrefs({ driveFolder: null })
                    }}
                  >
                    Use Wishtaa Maps
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className={row(false)}>
          <Cloud size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Google Drive</p>
            <p className="text-xs text-muted">Not connected. Keep files in your own Drive, and open them anywhere.</p>
            <button
              type="button"
              className={`${buttonSecondary} mt-2`}
              disabled={auth.status === 'connecting'}
              onClick={async () => {
                if ((await actions.connect()) === true) {
                  onChange({ ...state, choice: 'drive', folder: getPrefs().driveFolder })
                  onConnected()
                }
              }}
            >
              <Cloud size={15} aria-hidden="true" /> {auth.status === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
            </button>
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-muted">
        <input type="checkbox" checked={state.dontAsk} onChange={(e) => set({ dontAsk: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
        Don't ask again, always use {choiceLabel(state.choice)}
      </label>
    </fieldset>
  )
}

// ------------------------------------------------------------------------------------------------------------------

type SaveToDialogProps = Extract<Dialog, { kind: 'saveTo' }>

/**
 * Creating a mind map, knowledge base or folder: choose where to save it, or (when the place is already decided)
 * just create it, showing progress and any failure. A failure never loses the new file.
 */
export function SaveToDialog({ d, onClose }: { d: SaveToDialogProps; onClose: () => void }) {
  const { open, notify } = useFiles()
  const navigate = useNavigate()
  const auth = useDriveAuth()
  const actions = useDriveActions()
  const services = useCreateServices()
  const connected = isLinked(auth.status)

  const [state, setState] = useState<PickerState>(() => initialPickerState(connected))
  const [name, setName] = useState(d.item === 'folder' ? 'New folder' : '')
  const autoRun = !!d.fixed && d.item !== 'folder'
  const [phase, setPhase] = useState<'choose' | 'working' | 'failed'>(d.failed ? 'failed' : autoRun ? 'working' : 'choose')
  const [failed, setFailed] = useState<Failed | null>(d.failed ?? null)
  const started = useRef(false)

  const finish = (out: CreateOutcome, label: string) => {
    if (out.status === 'drive-failed') {
      // A remembered folder that no longer exists must not trap every later attempt.
      if (out.error.kind === 'notfound' && out.input.placement.storage === 'drive' && out.input.placement.folder) setPrefs({ driveFolder: null })
      setFailed(out)
      setPhase('failed')
      return
    }
    onClose()
    if (out.record && out.record.type !== 'folder') open(out.record)
    else if (out.driveFolder) {
      notify(`Folder "${label}" created in Google Drive.`)
      if (d.onFolderCreated) d.onFolderCreated()
      else navigate(`/drive?folder=${encodeURIComponent(out.driveFolder.id)}&name=${encodeURIComponent(out.driveFolder.name)}`)
    } else notify(`Folder "${label}" created.`)
  }

  const run = async (placement: Placement) => {
    setPhase('working')
    if (placement.storage === 'drive' && !(await actions.ensureConnected())) {
      setPhase(autoRun ? 'failed' : 'choose')
      if (autoRun) onClose()
      return
    }
    try {
      const label = name.trim() || 'New folder'
      const out = await createItem(services, { kind: d.item, name: d.item === 'folder' ? label : undefined, placement })
      finish(out, label)
    } catch (e) {
      setPhase('choose')
      notify(e instanceof Error ? e.message : 'Could not create it.')
    }
  }

  useEffect(() => {
    if (autoRun && d.fixed && !started.current && !d.failed) {
      started.current = true
      void run(d.fixed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (d.item === 'folder' && !name.trim()) return
    if (d.fixed) return void run(d.fixed)
    rememberChoice(state)
    void run(placementFor(state, d.localParentId))
  }

  const closeFailed = () => {
    if (failed?.record) notify(`"${failed.record.name}" is saved in this browser. It was not created in Google Drive.`)
    onClose()
  }

  if (phase === 'failed' && failed) {
    return (
      <Modal title="Could not create it in Google Drive" onClose={closeFailed}>
        <div role="alert" className="space-y-2 text-sm">
          <p>{failed.error.message}</p>
          <p className="text-xs text-muted">
            {failed.record ? 'Your new file is safe in this browser. You can try Drive again, or keep it here.' : 'Nothing has been lost. You can try again, or create the folder in this browser instead.'}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={buttonSecondary}
            onClick={async () => {
              const rec: FileRecord = await createHereInstead(services, failed)
              onClose()
              if (rec.type === 'folder') notify(`Folder "${rec.name}" created in this browser.`)
              else open(rec)
            }}
          >
            Create in this browser instead
          </button>
          <button
            type="button"
            data-autofocus
            className={buttonPrimary}
            onClick={async () => {
              setPhase('working')
              if (!(await actions.ensureConnected())) return setPhase('failed')
              finish(await retryCreate(services, failed), failed.input.name?.trim() || 'New folder')
            }}
          >
            Retry
          </button>
        </div>
      </Modal>
    )
  }

  if (phase === 'working') {
    const where = d.fixed ? (d.fixed.storage === 'drive' ? 'Google Drive' : 'this browser') : choiceLabel(state.choice)
    return (
      <Modal title={ITEM_TITLES[d.item]} onClose={() => undefined}>
        <p role="status" className="py-4 text-center text-sm text-muted">
          Creating in {where}…
        </p>
      </Modal>
    )
  }

  const fixedWhere = d.fixed ? (d.fixed.storage === 'drive' ? `Google Drive${d.fixed.folder ? `: ${d.fixed.folder.name}` : ''}` : 'This browser') : null
  return (
    <Modal title={ITEM_TITLES[d.item]} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {d.item === 'folder' && (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Folder name</span>
            <input data-autofocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} maxLength={120} className="w-full rounded-ui border border-line bg-bg px-3 py-2 text-sm focus:border-brand" />
          </label>
        )}
        {fixedWhere ? (
          <p className="flex items-center gap-2 text-xs text-muted"><Info size={14} aria-hidden="true" /> Saved to: {fixedWhere}</p>
        ) : (
          <SaveToPicker
            state={state}
            onChange={setState}
            onConnected={() => {
              // Connected from this dialog: carry on and create it.
              const next: PickerState = { ...state, choice: 'drive', folder: getPrefs().driveFolder }
              rememberChoice(next)
              void run(placementFor(next, d.localParentId))
            }}
          />
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button type="submit" data-autofocus={d.item !== 'folder' ? true : undefined} disabled={d.item === 'folder' && !name.trim()} className={buttonPrimary}>Create</button>
        </div>
      </form>
    </Modal>
  )
}

/** Confirms moving a Drive file into this browser, spelling out what happens. */
export function MoveLocalDialog({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const actions = useDriveActions()
  const [busy, setBusy] = useState(false)
  return (
    <Modal title="Move to this browser?" onClose={onClose}>
      <div className="space-y-2 text-sm">
        <p>
          <strong>{file.name}</strong> will be downloaded from Google Drive and kept in this browser only.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>The latest version in Drive is brought here first.</li>
          <li>The copy in Google Drive is moved to the Drive bin, where you can still restore it.</li>
          <li>From now on, edits are saved in this browser only, and the file won't appear on your other devices.</li>
        </ul>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
        <button
          type="button"
          data-autofocus
          disabled={busy}
          className={buttonPrimary}
          onClick={async () => {
            setBusy(true)
            await actions.moveToLocal(file)
            onClose()
          }}
        >
          {busy ? 'Moving…' : 'Move to this browser'}
        </button>
      </div>
    </Modal>
  )
}

