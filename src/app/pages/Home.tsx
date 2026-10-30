import { useMemo } from 'react'
import { LAST_OPEN_KEY } from '@/editor/session'
import { useCreate } from '../createFlow'
import { useImportEmmx } from '../importFlow'
import { useFiles } from '../FilesContext'
import { FileBrowser, FileKindIcon } from '../FileBrowser'
import { timeAgo } from '../format'
import { BookOpen, FileText, LayoutTemplate, Network, Star, Upload, Clock } from '../icons'
import { ActionCard, EmptyState, Page, PageHeader } from '../ui'

function lastOpenId(): string | null {
  try {
    return localStorage.getItem(LAST_OPEN_KEY)
  } catch {
    return null
  }
}

const noSelection: ReadonlySet<string> = new Set()
const noop = () => undefined

export default function Home() {
  const f = useFiles()
  const create = useCreate()
  const importer = useImportEmmx()
  const live = useMemo(() => f.files.filter((x) => !x.trashed && x.type !== 'folder'), [f.files])
  const recent = useMemo(() => [...live].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 8), [live])
  const starred = useMemo(() => f.files.filter((x) => x.starred && !x.trashed), [f.files])
  const last = useMemo(() => {
    const id = lastOpenId()
    return (id && live.find((x) => x.id === id)) || null
  }, [live])

  return (
    <Page>
      <PageHeader title="Home" subtitle="Pick up where you left off, or start something new." />

      <section aria-label="Create new" className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-muted">Create new</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ActionCard icon={<Network size={20} aria-hidden="true" />} title="Blank mind map" hint="One central topic" onClick={() => create.start('map', { source: 'home' })} />
          <ActionCard icon={<LayoutTemplate size={20} aria-hidden="true" />} title="From template" hint="Ready-made layouts" badge="Soon" onClick={() => f.setDialog({ kind: 'templateInfo' })} />
          <ActionCard icon={<Upload size={20} aria-hidden="true" />} title="Import" hint="MindMaster or EdrawMind .emmx" onClick={() => importer.pick(null)} />
          <ActionCard icon={<BookOpen size={20} aria-hidden="true" />} title="New knowledge base" hint="Connected notes" onClick={() => create.start('kb', { source: 'home' })} />
        </div>
      </section>

      {f.ready && live.length === 0 && (
        <EmptyState icon={<FileText size={26} aria-hidden="true" />} title="Nothing here yet">
          Create your first mind map or knowledge base with the buttons above. Everything you make appears here.
        </EmptyState>
      )}

      {last && (
        <section aria-label="Continue where you left off" className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Continue where you left off</h2>
          <button
            type="button"
            onClick={() => f.open(last)}
            className="flex w-full max-w-xl items-center gap-4 rounded-ui border border-line bg-surface p-3 text-left transition-colors hover:border-brand hover:bg-brand/10"
          >
            <span className="h-20 w-32 shrink-0 overflow-hidden rounded border border-line bg-bg">
              {last.thumbnail ? <img src={last.thumbnail} alt="" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-muted"><FileKindIcon type={last.type} size={30} /></span>}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{last.name}</span>
              <span className="mt-0.5 flex items-center gap-1 text-xs text-muted"><Clock size={13} aria-hidden="true" /> Edited {timeAgo(last.modifiedAt)}</span>
              <span className="mt-2 inline-block rounded-ui bg-brand px-3 py-1 text-xs font-semibold text-brand-ink">Open</span>
            </span>
          </button>
        </section>
      )}

      {recent.length > 0 && (
        <section aria-label="Recent files" className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted">Recent files</h2>
          <FileBrowser items={recent} view="grid" selection={noSelection} onSelect={noop} />
        </section>
      )}

      {starred.length > 0 && (
        <section aria-label="Starred" className="mb-8">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-muted"><Star size={14} aria-hidden="true" /> Starred</h2>
          <FileBrowser items={starred} view="grid" selection={noSelection} onSelect={noop} />
        </section>
      )}
    </Page>
  )
}
