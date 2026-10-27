import { useEffect, useMemo, useState } from 'react'
import { findBacklinks, type Backlink } from '@/core/files/indexer'
import type { FileRecord } from '@/core/files/types'
import { fileLink, linkedFile } from '@/core/links'
import { FileKindIcon } from '../../app/FileBrowser'
import { useFiles } from '../../app/FilesContext'
import { Modal } from '../../app/Modal'
import { routeForFile } from '../../app/navigation'
import { Icon } from '@/ui/icons'
import { setTopicLink } from '../content'
import { useEditor } from '../store'

/** Choose another map or knowledge base to link a topic to. */
export function FileLinkPicker({ topicId, onClose }: { topicId: string; onClose: () => void }) {
  const { files } = useFiles()
  const here = useEditor((s) => s.fileId)
  const [q, setQ] = useState('')
  const options = useMemo(
    () =>
      files
        .filter((f) => f.type !== 'folder' && !f.trashed && f.id !== here && f.name.toLowerCase().includes(q.trim().toLowerCase()))
        .sort((a, b) => b.modifiedAt - a.modifiedAt),
    [files, here, q]
  )
  return (
    <Modal title="Link to map or knowledge base" onClose={onClose}>
      <input
        data-autofocus
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your files"
        aria-label="Search your files"
        className="mb-3 w-full rounded-ui border border-line bg-bg px-3 py-2 text-sm focus:border-brand"
      />
      <ul aria-label="Files" className="max-h-64 space-y-0.5 overflow-y-auto">
        {options.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => {
                setTopicLink(topicId, fileLink(f.id))
                onClose()
              }}
              className="flex w-full items-center gap-2 rounded-ui px-3 py-2 text-left text-sm hover:bg-brand/15"
            >
              <FileKindIcon type={f.type} size={16} className="shrink-0 text-muted" />
              <span className="truncate">{f.name}</span>
            </button>
          </li>
        ))}
        {options.length === 0 && <li className="px-3 py-4 text-sm text-muted">No other files to link to.</li>}
      </ul>
    </Modal>
  )
}

/** The file a topic's link points at, if it links to a file. */
export function useLinkedFile(link: string): FileRecord | null | undefined {
  const { files } = useFiles()
  const ref = linkedFile(link)
  if (!ref) return undefined
  return files.find((f) => f.id === ref.fileId && !f.trashed) ?? null
}

/** Topics in other files that link here (this topic, or this whole file). */
export function Backlinks({ topicId }: { topicId: string }) {
  const { repo, files, open } = useFiles()
  const fileId = useEditor((s) => s.fileId)
  const [links, setLinks] = useState<Backlink[]>([])
  useEffect(() => {
    let alive = true
    if (!fileId) return
    void repo.allIndexes().then((all) => {
      if (!alive) return
      const live = new Set(files.filter((f) => !f.trashed).map((f) => f.id))
      setLinks(findBacklinks(all, fileId, topicId).filter((l) => live.has(l.fileId)))
    })
    return () => {
      alive = false
    }
  }, [repo, files, fileId, topicId])

  return (
    <section aria-label="Backlinks" className="space-y-2 border-b border-line px-4 py-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon name="link" size={15} /> Backlinks
      </h3>
      {links.length === 0 ? (
        <p className="text-xs text-muted">Nothing links to this topic yet. Link to it from a topic in another map or knowledge base.</p>
      ) : (
        <ul className="space-y-0.5">
          {links.map((l, i) => {
            const file = files.find((f) => f.id === l.fileId)
            if (!file) return null
            return (
              <li key={`${l.fileId}:${l.topicId}:${i}`}>
                <button
                  type="button"
                  onClick={() => open(file, l.topicId)}
                  className="flex w-full items-center gap-2 rounded-ui px-2 py-1.5 text-left text-sm hover:bg-brand/15"
                  title={routeForFile(file, l.topicId)}
                >
                  <FileKindIcon type={file.type} size={15} className="shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate">{l.topicText || '(untitled topic)'}</span>
                    <span className="block truncate text-xs text-muted">{file.name}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
