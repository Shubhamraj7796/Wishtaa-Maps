import { useMemo, useState, type DragEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { breadcrumbs, childrenOfFolder, sortFiles, trashRoots } from '@/core/files/tree'
import { DEFAULT_SORT, type FileRecord, type SortSpec } from '@/core/files/types'
import { routeForFile } from '../navigation'
import { DRAG_TYPE, FileBrowser } from '../FileBrowser'
import { useCreate } from '../createFlow'
import { useImportEmmx } from '../importFlow'
import { useFiles } from '../FilesContext'
import { fileSize, plural, timeAgo } from '../format'
import { FilePlus2, FolderInput, FolderPlus, ImageIcon, Network, Paperclip, RotateCcw, Sparkles, Star, StickyNote, Trash2, Upload, Users, X } from '../icons'
import { ActionCard, Breadcrumbs, Chips, EmptyState, Page, PageHeader, SortControl, Tabs, ViewToggle, usePref } from '../ui'
import { useIndexes } from '../useIndexes'

type Tab = 'files' | 'notes' | 'resources' | 'bin'
type Chip = 'all' | 'mine' | 'shared' | 'myshares'
const TABS: { id: Tab; label: string }[] = [
  { id: 'files', label: 'My files' },
  { id: 'notes', label: 'Notes' },
  { id: 'resources', label: 'Resources' },
  { id: 'bin', label: 'Recycle bin' },
]
const CHIPS: { id: Chip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Created by me' },
  { id: 'shared', label: 'Shared with me' },
  { id: 'myshares', label: 'My shares' },
]

export function useSortPref(key: string): [SortSpec, (s: SortSpec) => void] {
  const [k, setK] = usePref(`${key}:sortKey`, DEFAULT_SORT.key, ['modified', 'name', 'created'] as const)
  const [d, setD] = usePref(`${key}:sortDir`, DEFAULT_SORT.dir, ['asc', 'desc'] as const)
  return [{ key: k, dir: d }, (s) => (setK(s.key), setD(s.dir))]
}

export function useSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return { selected, toggle, clear: () => setSelected(new Set()), set: setSelected }
}

function BulkBar({ ids, inBin, onDone }: { ids: string[]; inBin: boolean; onDone: () => void }) {
  const f = useFiles()
  const btn = 'flex items-center gap-1.5 rounded-ui border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-bg'
  const run = (work: () => Promise<void> | void) => async () => {
    await work()
    onDone()
  }
  return (
    <div role="toolbar" aria-label="Actions for selected files" className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-ui border border-brand bg-surface px-3 py-2 shadow-md">
      <span className="mr-auto text-sm font-medium">{ids.length} selected</span>
      {inBin ? (
        <>
          <button type="button" className={btn} onClick={run(() => f.restore(ids))}><RotateCcw size={15} aria-hidden="true" /> Restore</button>
          <button type="button" className={`${btn} text-bad`} onClick={() => f.setDialog({ kind: 'delete', ids })}><Trash2 size={15} aria-hidden="true" /> Delete forever</button>
        </>
      ) : (
        <>
          <button type="button" className={btn} onClick={() => f.setDialog({ kind: 'move', ids })}><FolderInput size={15} aria-hidden="true" /> Move to…</button>
          <button type="button" className={btn} onClick={run(async () => {
            const picked = f.files.filter((x) => ids.includes(x.id))
            const star = picked.some((x) => !x.starred)
            for (const x of picked) if (x.starred !== star) await f.toggleStar(x)
          })}><Star size={15} aria-hidden="true" /> Star</button>
          <button type="button" className={`${btn} text-bad`} onClick={run(() => f.trash(ids))}><Trash2 size={15} aria-hidden="true" /> Move to bin</button>
        </>
      )}
      <button type="button" className="grid h-8 w-8 place-items-center rounded-ui hover:bg-bg" onClick={onDone} aria-label="Clear selection" title="Clear selection"><X size={16} aria-hidden="true" /></button>
    </div>
  )
}

export function NotesList({ onlyKinds }: { onlyKinds?: ('map' | 'kb')[] }) {
  const f = useFiles()
  const indexes = useIndexes()
  const byId = useMemo(() => new Map(f.files.map((x) => [x.id, x])), [f.files])
  const rows = useMemo(() => {
    const out: { file: FileRecord; topicId: string; text: string; note: string }[] = []
    for (const idx of indexes) {
      const file = byId.get(idx.fileId)
      if (!file || file.trashed || (onlyKinds && !onlyKinds.includes(file.type as 'map' | 'kb'))) continue
      for (const t of idx.topics) if (t.note.trim()) out.push({ file, topicId: t.id, text: t.text, note: t.note })
    }
    return out.sort((a, b) => b.file.modifiedAt - a.file.modifiedAt)
  }, [indexes, byId, onlyKinds])
  if (!rows.length) {
    return (
      <EmptyState icon={<StickyNote size={26} aria-hidden="true" />} title="No notes yet">
        Open a topic, choose Notes in the Insert menu, and write. Notes from all your files are collected here.
      </EmptyState>
    )
  }
  return (
    <ul aria-label="Notes" className="divide-y divide-line overflow-hidden rounded-ui border border-line bg-surface">
      {rows.map((r) => (
        <li key={`${r.file.id}:${r.topicId}`}>
          <Link to={routeForFile(r.file, r.topicId)} className="block px-4 py-3 hover:bg-bg">
            <span className="flex items-center gap-2 text-sm font-medium"><StickyNote size={15} aria-hidden="true" className="shrink-0 text-muted" /><span className="truncate">{r.text || '(untitled topic)'}</span></span>
            <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{r.note}</span>
            <span className="mt-1 block text-xs text-muted">{r.file.name} · {timeAgo(r.file.modifiedAt)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function ResourcesList() {
  const f = useFiles()
  const indexes = useIndexes()
  const byId = useMemo(() => new Map(f.files.map((x) => [x.id, x])), [f.files])
  const rows = useMemo(() => {
    const out: { file: FileRecord; topicId: string; topicText: string; kind: 'image' | 'file'; name: string; size?: number }[] = []
    for (const idx of indexes) {
      const file = byId.get(idx.fileId)
      if (!file || file.trashed) continue
      for (const r of idx.resources) out.push({ file, topicId: r.topicId, topicText: r.topicText, kind: r.kind, name: r.name || (r.kind === 'image' ? 'Picture' : 'Attachment'), size: r.size })
    }
    return out
  }, [indexes, byId])
  if (!rows.length) {
    return (
      <EmptyState icon={<Paperclip size={26} aria-hidden="true" />} title="No pictures or attachments yet">
        Pictures and files you add to topics are listed here, with the map they belong to.
      </EmptyState>
    )
  }
  return (
    <ul aria-label="Resources" className="divide-y divide-line overflow-hidden rounded-ui border border-line bg-surface">
      {rows.map((r, i) => (
        <li key={`${r.file.id}:${r.topicId}:${i}`}>
          <Link to={routeForFile(r.file, r.topicId)} className="flex items-center gap-3 px-4 py-3 hover:bg-bg">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui bg-brand/15 text-brand">{r.kind === 'image' ? <ImageIcon size={18} aria-hidden="true" /> : <Paperclip size={18} aria-hidden="true" />}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{r.name}{r.size !== undefined ? ` · ${fileSize(r.size)}` : ''}</span>
              <span className="block truncate text-xs text-muted">On “{r.topicText || 'untitled topic'}” in {r.file.name}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export default function Files() {
  const f = useFiles()
  const create = useCreate()
  const importer = useImportEmmx()
  const { folderId = null } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'files') as Tab
  const [chip, setChip] = useState<Chip>('all')
  const [view, setView] = usePref<'grid' | 'list'>('files:view', 'grid', ['grid', 'list'] as const)
  const [sort, setSort] = useSortPref('files')
  const sel = useSelection()

  const folder = folderId ? f.files.find((x) => x.id === folderId && x.type === 'folder') : null
  const missing = !!folderId && f.ready && (!folder || folder.trashed)
  const trail = useMemo(() => breadcrumbs(f.files, folderId), [f.files, folderId])

  const items = useMemo(() => {
    if (tab === 'bin') return sortFiles(trashRoots(f.files), sort)
    return sortFiles(childrenOfFolder(f.files, folderId), sort)
  }, [f.files, folderId, tab, sort])

  const setTab = (t: Tab) => {
    sel.clear()
    setParams(t === 'files' ? {} : { tab: t })
  }

  const dropOnTop = (e: DragEvent, target: string | null) => {
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    e.preventDefault()
    void f.moveTo((JSON.parse(raw) as string[]).filter((id) => id !== target), target)
  }
  const crumbDrop = {
    onDragOver: (e: DragEvent) => e.dataTransfer.types.includes(DRAG_TYPE) && e.preventDefault(),
  }

  if (missing) {
    return (
      <Page>
        <EmptyState icon={<FolderPlus size={26} aria-hidden="true" />} title="This folder isn't here">
          It may have been deleted or moved to the bin. <Link to="/files" className="text-brand underline">Go to My files</Link>
        </EmptyState>
      </Page>
    )
  }

  const binCount = trashRoots(f.files).length
  const comingSoon = (
    <EmptyState icon={<Users size={26} aria-hidden="true" />} title="Sharing is coming">
      Files shared with you, and files you share, will appear here once you can sign in.
    </EmptyState>
  )

  return (
    <Page>
      <PageHeader title={folder ? folder.name : tab === 'bin' ? 'Recycle bin' : 'All files'} subtitle={tab === 'files' ? 'Your mind maps, knowledge bases and folders.' : undefined} />
      <Tabs tabs={TABS.map((t) => (t.id === 'bin' && binCount ? { ...t, label: `${t.label} (${binCount})` } : t))} value={tab} onChange={setTab} label="File sections" />

      {tab === 'files' && (
        <>
          {folder && (
            <div {...crumbDrop} onDrop={(e) => dropOnTop(e, null)}>
              <Breadcrumbs rootLabel="My files" rootTo="/files" trail={trail.map((c) => ({ id: c.id, name: c.name, to: `/files/${c.id}` }))} />
            </div>
          )}
          <section aria-label="Create" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionCard icon={<Network size={20} aria-hidden="true" />} title="New mind map" hint="Blank, one central topic" onClick={() => create.start('map', { source: 'files' })} />
            <ActionCard icon={<FolderPlus size={20} aria-hidden="true" />} title="New folder" hint="Group your files" onClick={() => create.start('folder', { source: 'files' })} />
            <ActionCard icon={<Upload size={20} aria-hidden="true" />} title="Import file" hint="MindMaster or EdrawMind .emmx" onClick={() => importer.pick({ source: 'files' })} />
            <ActionCard icon={<Sparkles size={20} aria-hidden="true" />} title="AI mind map" hint="Coming soon" badge="Soon" disabled />
          </section>
        </>
      )}

      {(tab === 'files' || tab === 'bin') && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {tab === 'files' ? <Chips chips={CHIPS} value={chip} onChange={setChip} label="Filter" /> : (
            <button type="button" disabled={!binCount} onClick={() => f.setDialog({ kind: 'emptyBin' })} className="flex items-center gap-1.5 rounded-ui border border-line bg-surface px-3 py-1.5 text-sm font-medium text-bad hover:bg-bg disabled:opacity-50">
              <Trash2 size={15} aria-hidden="true" /> Empty the bin
            </button>
          )}
          <div className="flex items-center gap-2">
            <SortControl sort={sort} onChange={setSort} />
            <ViewToggle view={view} onChange={setView} />
          </div>
        </div>
      )}

      {sel.selected.size > 0 && (tab === 'files' || tab === 'bin') && <BulkBar ids={[...sel.selected]} inBin={tab === 'bin'} onDone={sel.clear} />}

      {tab === 'files' && (chip === 'shared' || chip === 'myshares') ? (
        comingSoon
      ) : tab === 'files' || tab === 'bin' ? (
        <FileBrowser
          items={items}
          view={view}
          selection={sel.selected}
          onSelect={sel.toggle}
          empty={
            tab === 'bin' ? (
              <EmptyState icon={<Trash2 size={26} aria-hidden="true" />} title="The bin is empty">Deleted files wait here until you delete them forever or restore them.</EmptyState>
            ) : (
              <EmptyState icon={<FilePlus2 size={26} aria-hidden="true" />} title={folder ? 'This folder is empty' : 'No files yet'}>
                {folder ? 'Create a mind map here, or drag files into this folder.' : 'Create your first mind map, knowledge base or folder with the cards above.'}
              </EmptyState>
            )
          }
        />
      ) : tab === 'notes' ? (
        <NotesList />
      ) : (
        <ResourcesList />
      )}
      {tab === 'bin' && binCount > 0 && <p className="mt-3 text-xs text-muted">{plural(binCount, 'item')} in the bin. Folders take their contents with them.</p>}
    </Page>
  )
}
