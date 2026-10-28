import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { sortFiles, trashRoots } from '@/core/files/tree'
import { FileBrowser } from '../FileBrowser'
import { useCreate } from '../createFlow'
import { useFiles } from '../FilesContext'
import { BookOpen, LayoutTemplate, Library, Plus, Trash2, X } from '../icons'
import { ActionCard, Chips, EmptyState, Page, PageHeader, SortControl, Tabs, ViewToggle, usePref } from '../ui'
import { NotesList, useSelection, useSortPref } from './Files'

type Tab = 'kb' | 'notes' | 'trash'
type Chip = 'all' | 'mine' | 'shared' | 'sharedby'
const TABS: { id: Tab; label: string }[] = [
  { id: 'kb', label: 'Knowledge bases' },
  { id: 'notes', label: 'Notes' },
  { id: 'trash', label: 'Notes trash' },
]
const CHIPS: { id: Chip; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Created by me' },
  { id: 'shared', label: 'Shared with me' },
  { id: 'sharedby', label: 'Shared by me' },
]
const KB_ONLY: ('kb')[] = ['kb']

export default function Kb() {
  const f = useFiles()
  const create = useCreate()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'kb') as Tab
  const [chip, setChip] = useState<Chip>('all')
  const [view, setView] = usePref<'grid' | 'list'>('kb:view', 'grid', ['grid', 'list'] as const)
  const [sort, setSort] = useSortPref('kb')
  const [bannerGone, setBannerGone] = usePref<'0' | '1'>('kb:banner-dismissed', '0', ['0', '1'] as const)
  const sel = useSelection()

  const kbs = useMemo(() => sortFiles(f.files.filter((x) => x.type === 'kb' && !x.trashed), sort), [f.files, sort])
  const binned = useMemo(() => sortFiles(trashRoots(f.files).filter((x) => x.type === 'kb'), sort), [f.files, sort])

  const setTab = (t: Tab) => {
    sel.clear()
    setParams(t === 'kb' ? {} : { tab: t })
  }

  return (
    <Page>
      <PageHeader title="Knowledge base" subtitle="Mind maps where every topic can hold notes, tags, links and files." />

      {bannerGone === '0' && (
        <div role="note" className="mb-4 flex flex-wrap items-center gap-3 rounded-ui border border-brand/40 bg-brand/10 px-4 py-3 text-sm">
          <Library size={18} aria-hidden="true" className="shrink-0 text-brand" />
          <p className="min-w-0 flex-1">A mind map is a knowledge base: use mind maps to manage interconnected notes.</p>
          <button type="button" onClick={() => void f.openSampleKb()} className="rounded-ui bg-brand px-3 py-1.5 text-xs font-semibold text-brand-ink hover:opacity-90">View example</button>
          <button type="button" onClick={() => setBannerGone('1')} aria-label="Dismiss" title="Dismiss" className="grid h-7 w-7 place-items-center rounded-ui hover:bg-bg"><X size={16} aria-hidden="true" /></button>
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Knowledge base sections" />

      {tab === 'kb' && (
        <>
          <section aria-label="Create" className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
            <ActionCard icon={<Plus size={20} aria-hidden="true" />} title="Create knowledge base" hint="Concepts, Resources, Projects, Notes" onClick={() => create.start('kb', { source: 'home' })} />
            <ActionCard icon={<LayoutTemplate size={20} aria-hidden="true" />} title="Create from template" hint="Coming soon" badge="Soon" onClick={() => f.setDialog({ kind: 'templateInfo' })} />
          </section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Chips chips={CHIPS} value={chip} onChange={setChip} label="Filter" />
            <div className="flex items-center gap-2">
              <SortControl sort={sort} onChange={setSort} />
              <ViewToggle view={view} onChange={setView} />
            </div>
          </div>
          {chip === 'shared' || chip === 'sharedby' ? (
            <EmptyState icon={<BookOpen size={26} aria-hidden="true" />} title="Sharing is coming">Shared knowledge bases will appear here once you can sign in.</EmptyState>
          ) : (
            <FileBrowser
              items={kbs}
              view={view}
              selection={sel.selected}
              onSelect={sel.toggle}
              empty={
                <EmptyState icon={<BookOpen size={26} aria-hidden="true" />} title="No knowledge bases yet">
                  Create one to keep connected notes, or open the example to see how it works.
                </EmptyState>
              }
            />
          )}
        </>
      )}

      {tab === 'notes' && <NotesList onlyKinds={KB_ONLY} />}

      {tab === 'trash' && (
        <FileBrowser
          items={binned}
          view={view}
          selection={sel.selected}
          onSelect={sel.toggle}
          empty={<EmptyState icon={<Trash2 size={26} aria-hidden="true" />} title="Nothing in the trash">Deleted knowledge bases wait here. Restore them from the Recycle bin in All files.</EmptyState>}
        />
      )}
    </Page>
  )
}
