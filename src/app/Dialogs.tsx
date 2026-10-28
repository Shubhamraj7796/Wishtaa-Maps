import { useState, type FormEvent } from 'react'
import { folderOptions } from '@/core/files/tree'
import { countAffected, useFiles } from './FilesContext'
import { Modal, buttonDanger, buttonPrimary, buttonSecondary } from './Modal'
import { BookOpen, Cloud, FilePlus2, FolderPlus, LayoutTemplate, Network, Upload } from './icons'
import { StorageSettings } from './DriveUi'
import { plural } from './format'
import { useDriveActions, useDriveAuth } from './useDrive'

function NameForm({ title, label, initial, action, onSubmit, onClose }: { title: string; label: string; initial: string; action: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim())
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">{label}</span>
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            maxLength={120}
            className="w-full rounded-ui border border-line bg-bg px-3 py-2 text-sm focus:border-brand"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button type="submit" disabled={!name.trim()} className={buttonPrimary}>{action}</button>
        </div>
      </form>
    </Modal>
  )
}

function Choice({ icon, title, hint, onClick, disabled }: { icon: React.ReactNode; title: string; hint: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-ui border border-line bg-surface p-3 text-left transition-colors enabled:hover:border-brand enabled:hover:bg-brand/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-ui bg-brand/15 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  )
}

function NewDialog({ parentId, onClose }: { parentId: string | null; onClose: () => void }) {
  const f = useFiles()
  const go = async (work: () => Promise<unknown>) => {
    onClose()
    await work()
  }
  const drive = useDriveActions()
  const auth = useDriveAuth()
  const connected = auth.status === 'connected' || auth.status === 'reconnect'
  return (
    <Modal title="New file" onClose={onClose}>
      <div className="space-y-2">
        <Choice icon={<Network size={20} aria-hidden="true" />} title="Blank mind map" hint="Start from one central topic." onClick={() => void go(() => f.createMap(parentId))} />
        <Choice icon={<BookOpen size={20} aria-hidden="true" />} title="Knowledge base" hint="A mind map for connected notes: Concepts, Resources, Projects, Notes." onClick={() => void go(() => f.createKb(parentId))} />
        <Choice icon={<FolderPlus size={20} aria-hidden="true" />} title="Folder" hint="Group files together. Folders can hold folders." onClick={() => f.setDialog({ kind: 'folder', parentId })} />
        {drive.configured && (
          <Choice
            icon={<Cloud size={20} aria-hidden="true" />}
            title={connected ? 'Open from Google Drive' : 'Connect Google Drive'}
            hint={connected ? 'Choose a Wishtaa Maps file from your Drive.' : 'Keep files in your own Drive. Only files this app creates or opens are visible to it.'}
            onClick={() => void go(() => (connected ? drive.pickFromDrive() : drive.connect()))}
          />
        )}
        <Choice icon={<LayoutTemplate size={20} aria-hidden="true" />} title="From template" hint="Coming soon." disabled />
        <Choice icon={<Upload size={20} aria-hidden="true" />} title="Import" hint="Coming soon." disabled />
      </div>
    </Modal>
  )
}

function MoveDialog({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const f = useFiles()
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  const options = folderOptions(f.files, ids)
  const here = f.files.find((x) => x.id === ids[0])?.parentId ?? null
  const choose = (id: string | null) => ({
    type: 'button' as const,
    role: 'radio' as const,
    'aria-checked': target === id,
    onClick: () => setTarget(id),
    className: `flex w-full items-center gap-2 rounded-ui border px-3 py-2 text-left text-sm ${target === id ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`,
  })
  return (
    <Modal title={ids.length === 1 ? 'Move to' : `Move ${ids.length} items to`} onClose={onClose}>
      <div role="radiogroup" aria-label="Destination folder" className="max-h-72 space-y-0.5 overflow-y-auto">
        <button {...choose(null)}>
          <FilePlus2 size={16} aria-hidden="true" /> My files (top level){here === null ? ' · current' : ''}
        </button>
        {options.map(({ folder, depth }) => (
          <button key={folder.id} {...choose(folder.id)} style={{ paddingLeft: 12 + depth * 18 }}>
            <FolderPlus size={16} aria-hidden="true" /> <span className="truncate">{folder.name}</span>
            {folder.id === here ? ' · current' : ''}
          </button>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
        <button
          type="button"
          disabled={target === undefined}
          className={buttonPrimary}
          onClick={async () => {
            onClose()
            await f.moveTo(ids, target ?? null)
          }}
        >
          Move here
        </button>
      </div>
    </Modal>
  )
}

function ConfirmDelete({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const f = useFiles()
  const n = countAffected(f.files, ids)
  return (
    <Modal title="Delete forever?" onClose={onClose}>
      <p className="text-sm">
        {plural(n, 'item')} will be deleted permanently, including everything inside folders. This can't be undone.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
        <button
          type="button"
          data-autofocus
          className={buttonDanger}
          onClick={async () => {
            onClose()
            await f.removeForever(ids)
          }}
        >
          Delete forever
        </button>
      </div>
    </Modal>
  )
}

/** Renders whichever dialog is open. */
export function Dialogs() {
  const f = useFiles()
  const d = f.dialog
  if (!d) return null
  const close = () => f.setDialog(null)
  switch (d.kind) {
    case 'new':
      return <NewDialog parentId={d.parentId} onClose={close} />
    case 'folder':
      return (
        <NameForm
          title="New folder"
          label="Folder name"
          initial="New folder"
          action="Create"
          onClose={close}
          onSubmit={(name) => {
            close()
            void f.createFolder(name, d.parentId)
          }}
        />
      )
    case 'rename':
      return (
        <NameForm
          title="Rename"
          label="Name"
          initial={d.file.name}
          action="Rename"
          onClose={close}
          onSubmit={(name) => {
            close()
            void f.rename(d.file, name)
          }}
        />
      )
    case 'move':
      return <MoveDialog ids={d.ids} onClose={close} />
    case 'delete':
      return <ConfirmDelete ids={d.ids} onClose={close} />
    case 'emptyBin':
      return (
        <Modal title="Empty the bin?" onClose={close}>
          <p className="text-sm">Everything in the bin is deleted permanently. This can't be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={close} className={buttonSecondary}>Cancel</button>
            <button
              type="button"
              data-autofocus
              className={buttonDanger}
              onClick={async () => {
                close()
                await f.emptyBin()
              }}
            >
              Empty the bin
            </button>
          </div>
        </Modal>
      )
    case 'storage':
      return <StorageSettings onClose={close} />
    case 'importInfo':
    case 'templateInfo':
      return (
        <Modal title="Coming soon" onClose={close}>
          <p className="text-sm text-muted">{d.kind === 'importInfo' ? 'Importing files' : 'Templates'} will arrive in a later update.</p>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={close} className={buttonPrimary}>OK</button>
          </div>
        </Modal>
      )
  }
}
