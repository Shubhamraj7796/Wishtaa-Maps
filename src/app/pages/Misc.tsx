import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { SearchHit } from '@/core/files/types'
import { routeForFile } from '../navigation'
import { FileKindIcon } from '../FileBrowser'
import { useFiles } from '../FilesContext'
import { timeAgo } from '../format'
import { LayoutTemplate, Search, Sparkles } from '../icons'
import { Chips, EmptyState, Page, PageHeader } from '../ui'
import { useIndexes } from '../useIndexes'
import { buttonSecondary } from '../Modal'

export function Gallery() {
  return (
    <Page>
      <PageHeader title="Gallery" subtitle="Templates to start from." />
      <EmptyState icon={<Sparkles size={26} aria-hidden="true" />} title="Templates are coming soon">
        Ready-made maps for planning, studying and brainstorming will live here. For now, start with a blank mind map or a knowledge base.
        <div className="mt-4 flex justify-center">
          <Link to="/home" className={buttonSecondary}><LayoutTemplate size={16} aria-hidden="true" /> Back to Home</Link>
        </div>
      </EmptyState>
    </Page>
  )
}

export function NotFound() {
  return (
    <Page>
      <EmptyState icon={<Search size={26} aria-hidden="true" />} title="Page not found">
        There is nothing at this address. <Link to="/home" className="text-brand underline">Go to Home</Link>
      </EmptyState>
    </Page>
  )
}

type Kind = 'all' | 'map' | 'kb'

export function SearchPage() {
  const { repo, files } = useFiles()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const tag = params.get('tag') ?? ''
  const kind = (['map', 'kb'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as Kind
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const indexes = useIndexes()
  const tags = useMemo(() => [...new Set(indexes.flatMap((i) => i.topics.flatMap((t) => t.tags)))].sort(), [indexes])

  useEffect(() => {
    let alive = true
    if (!q.trim() && !tag) {
      setHits([])
      return
    }
    void repo.search({ text: q, tag: tag || undefined, types: kind === 'all' ? undefined : [kind], limit: 100 }).then((h) => alive && setHits(h))
    return () => {
      alive = false
    }
  }, [repo, q, tag, kind, files])

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next)
  }

  return (
    <Page>
      <PageHeader title={q ? `Results for “${q}”` : 'Search'} subtitle="Searches file names, topics, notes and tags across all your files." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Chips
          label="File type"
          value={kind}
          onChange={(k) => update({ type: k === 'all' ? '' : k })}
          chips={[{ id: 'all', label: 'All' }, { id: 'map', label: 'Mind maps' }, { id: 'kb', label: 'Knowledge bases' }]}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Tag</span>
          <select value={tag} onChange={(e) => update({ tag: e.target.value })} className="rounded-ui border border-line bg-surface px-2 py-1.5 text-sm">
            <option value="">Any</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      {hits && hits.length === 0 ? (
        <EmptyState icon={<Search size={26} aria-hidden="true" />} title={q || tag ? 'Nothing found' : 'Type something to search'}>
          {q || tag ? 'Try different words, or clear the tag and file type filters.' : 'Use the search box above.'}
        </EmptyState>
      ) : (
        <ul aria-label="Search results" className="divide-y divide-line overflow-hidden rounded-ui border border-line bg-surface">
          {(hits ?? []).map((h, i) => (
            <li key={`${h.file.id}:${h.topicId ?? ''}:${i}`}>
              <Link to={routeForFile(h.file, h.topicId)} className="flex items-start gap-3 px-4 py-3 hover:bg-bg">
                <FileKindIcon type={h.file.type} size={18} className="mt-0.5 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{h.topicText || h.file.name}</span>
                  {h.snippet && <span className="line-clamp-2 block text-sm text-muted">{h.snippet}</span>}
                  <span className="block text-xs text-muted">
                    {h.topicId ? `In ${h.file.name} · ` : ''}matched {h.matched} · {timeAgo(h.file.modifiedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
