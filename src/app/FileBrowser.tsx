import { useEffect, useRef, useState, type DragEvent } from 'react'
import type { FileRecord } from '@/core/files/types'
import { useFiles } from './FilesContext'
import { timeAgo } from './format'
import { BookOpen, Cloud, Copy, Folder, FolderInput, HardDrive, MoreVertical, Network, Pencil, RotateCcw, Star, Trash2 } from './icons'
import { useDriveActions } from './useDrive'

export const DRAG_TYPE = 'application/x-wishtaa-files'

/** Icon for a file kind, so folders, maps and knowledge bases are told apart at a glance. */
export function FileKindIcon({ type, size = 18, className = '' }: { type: FileRecord['type']; size?: number; className?: string }) {
  const C = type === 'folder' ? Folder : type === 'kb' ? BookOpen : Network
  return <C size={size} aria-hidden="true" className={className} />
}

const kindLabel = (t: FileRecord['type']) => (t === 'folder' ? 'Folder' : t === 'kb' ? 'Knowledge base' : 'Mind map')

function Thumb({ file }: { file: FileRecord }) {
  if (file.type === 'folder') {
    return (
      <div className="grid h-full w-full place-items-center bg-brand/10 text-brand">
        <Folder size={44} aria-hidden="true" />
      </div>
    )
  }
  return file.thumbnail ? (
    <img src={file.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
  ) : (
    <div className="grid h-full w-full place-items-center bg-bg text-muted">
      <FileKindIcon type={file.type} size={36} />
    </div>
  )
}

function DriveBadge({ file }: { file: FileRecord }) {
  if (file.storage !== 'drive') return null
  return (
    <span title="Stored in Google Drive" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold text-ink">
      <Cloud size={11} aria-hidden="true" />
      <span>Drive</span>
    </span>
  )
}

function Menu({ file, onClose }: { file: FileRecord; onClose: () => void }) {
  const f = useFiles()
  const drive = useDriveActions()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const item = (label: string, icon: React.ReactNode, run: () => void, danger = false) => (
    <button
      key={label}
      type="button"
      role="menuitem"
      onClick={() => {
        onClose()
        run()
      }}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-brand/15 ${danger ? 'text-bad' : ''}`}
    >
      {icon}
      {label}
    </button>
  )
  return (
    <>
      <div className="fixed inset-0 z-30" onPointerDown={onClose} />
      <div ref={ref} role="menu" aria-label={`Actions for ${file.name}`} className="absolute right-1 top-9 z-40 w-48 overflow-hidden rounded-ui border border-line bg-surface py-1 shadow-xl">
        {file.trashed ? (
          <>
            {item('Restore', <RotateCcw size={15} aria-hidden="true" />, () => void f.restore([file.id]))}
            {item('Delete forever', <Trash2 size={15} aria-hidden="true" />, () => f.setDialog({ kind: 'delete', ids: [file.id] }), true)}
          </>
        ) : (
          <>
            {item('Rename', <Pencil size={15} aria-hidden="true" />, () => f.setDialog({ kind: 'rename', file }))}
            {item('Move to…', <FolderInput size={15} aria-hidden="true" />, () => f.setDialog({ kind: 'move', ids: [file.id] }))}
            {file.type !== 'folder' && item('Duplicate', <Copy size={15} aria-hidden="true" />, () => void f.duplicate(file))}
            {file.type !== 'folder' && file.storage === 'local' && drive.configured && item('Move to Google Drive', <Cloud size={15} aria-hidden="true" />, () => void drive.moveToDrive(file))}
            {file.type !== 'folder' && file.storage === 'drive' && item('Keep only in this browser', <HardDrive size={15} aria-hidden="true" />, () => void drive.keepLocal(file))}
            {item(file.starred ? 'Remove star' : 'Star', <Star size={15} aria-hidden="true" />, () => void f.toggleStar(file))}
            {item('Move to bin', <Trash2 size={15} aria-hidden="true" />, () => void f.trash([file.id]), true)}
          </>
        )}
      </div>
    </>
  )
}

interface ItemProps {
  file: FileRecord
  view: 'grid' | 'list'
  selected: boolean
  anySelected: boolean
  onSelect: (id: string, additive: boolean) => void
  /** Ids to carry when this item is dragged (the whole selection if it is part of it). */
  dragIds: (file: FileRecord) => string[]
}

function Item({ file, view, selected, anySelected, onSelect, dragIds }: ItemProps) {
  const f = useFiles()
  const [menu, setMenu] = useState(false)
  const [over, setOver] = useState(false)
  const isFolder = file.type === 'folder'
  const canDrag = !file.trashed

  const open = () => {
    if (file.trashed) return onSelect(file.id, false) // items in the bin can't be opened: restore them first
    f.open(file)
  }
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragIds(file)))
    e.dataTransfer.effectAllowed = 'move'
  }
  const onDrop = (e: DragEvent) => {
    setOver(false)
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw || !isFolder) return
    e.preventDefault()
    const ids = (JSON.parse(raw) as string[]).filter((id) => id !== file.id)
    if (ids.length) void f.moveTo(ids, file.id)
  }
  const dropProps = isFolder && !file.trashed
    ? {
        onDragOver: (e: DragEvent) => {
          if (e.dataTransfer.types.includes(DRAG_TYPE)) {
            e.preventDefault()
            setOver(true)
          }
        },
        onDragLeave: () => setOver(false),
        onDrop,
      }
    : {}

  const check = (
    <input
      type="checkbox"
      checked={selected}
      onChange={() => onSelect(file.id, true)}
      aria-label={`Select ${file.name}`}
      className={`h-4 w-4 accent-[rgb(var(--c-brand))] ${anySelected || selected ? '' : 'opacity-0 focus:opacity-100 group-hover:opacity-100'}`}
    />
  )
  const star = file.starred && <Star size={14} aria-label="Starred" className="shrink-0 fill-warn text-warn" />
  const kebab = (
    <button
      type="button"
      aria-label={`More actions for ${file.name}`}
      aria-haspopup="menu"
      aria-expanded={menu}
      onClick={() => setMenu(!menu)}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-ui hover:bg-bg"
    >
      <MoreVertical size={16} aria-hidden="true" />
    </button>
  )

  if (view === 'list') {
    return (
      <li
        draggable={canDrag}
        onDragStart={onDragStart}
        {...dropProps}
        data-file-id={file.id}
        className={`group relative flex items-center gap-3 border-b border-line px-3 py-2 ${selected ? 'bg-brand/10' : 'hover:bg-bg'} ${over ? 'ring-2 ring-brand' : ''}`}
      >
        {check}
        <button type="button" onClick={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="h-9 w-14 shrink-0 overflow-hidden rounded border border-line"><Thumb file={file} /></span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium"><FileKindIcon type={file.type} size={15} className="shrink-0 text-muted" /><span className="truncate">{file.name}</span>{star}<DriveBadge file={file} /></span>
            <span className="block truncate text-xs text-muted">{kindLabel(file.type)} · {timeAgo(file.modifiedAt)}</span>
          </span>
        </button>
        <span className="hidden w-32 shrink-0 text-xs text-muted sm:block">{timeAgo(file.modifiedAt)}</span>
        {kebab}
        {menu && <Menu file={file} onClose={() => setMenu(false)} />}
      </li>
    )
  }

  return (
    <li
      draggable={canDrag}
      onDragStart={onDragStart}
      {...dropProps}
      data-file-id={file.id}
      className={`group relative overflow-hidden rounded-ui border bg-surface transition-shadow hover:shadow-md ${selected ? 'border-brand ring-2 ring-brand/40' : 'border-line'} ${over ? 'ring-2 ring-brand' : ''}`}
    >
      <button type="button" onClick={open} className="block w-full text-left" aria-label={`Open ${file.name}`}>
        <span className="block aspect-[8/5] overflow-hidden border-b border-line"><Thumb file={file} /></span>
        <span className="block px-3 py-2 pr-11">
          <span className="flex items-center gap-1.5 text-sm font-medium"><FileKindIcon type={file.type} size={15} className="shrink-0 text-muted" /><span className="truncate">{file.name}</span>{star}<DriveBadge file={file} /></span>
          <span className="block text-xs text-muted">{kindLabel(file.type)} · {timeAgo(file.modifiedAt)}</span>
        </span>
      </button>
      <span className="absolute left-2 top-2 rounded bg-surface/90 p-1">{check}</span>
      <span className="absolute bottom-1.5 right-1">{kebab}</span>
      {menu && <Menu file={file} onClose={() => setMenu(false)} />}
    </li>
  )
}

/** Files and folders as a grid or a list, with selection, a per-item menu and drag-and-drop into folders. */
export function FileBrowser({
  items,
  view,
  selection,
  onSelect,
  empty,
}: {
  items: FileRecord[]
  view: 'grid' | 'list'
  selection: ReadonlySet<string>
  onSelect: (id: string) => void
  empty?: React.ReactNode
}) {
  if (!items.length) return <>{empty}</>
  const dragIds = (file: FileRecord) => (selection.has(file.id) ? [...selection] : [file.id])
  return (
    <ul
      aria-label="Files"
      className={view === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'overflow-hidden rounded-ui border border-line bg-surface'}
    >
      {items.map((file) => (
        <Item key={file.id} file={file} view={view} selected={selection.has(file.id)} anySelected={selection.size > 0} onSelect={(id) => onSelect(id)} dragIds={dragIds} />
      ))}
    </ul>
  )
}
