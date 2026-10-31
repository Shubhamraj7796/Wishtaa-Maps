import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { buildStarterContent } from '@/core/files/templates'
import type { IndexedTopic } from '@/core/files/types'
import { sharedIdInUrl, setPendingShare, takeSharedPictures, type ShareTarget } from '@/pwa/share'
import { useFiles } from './FilesContext'
import { Modal, buttonPrimary, buttonSecondary } from './Modal'

const NEW = '__new__'

/**
 * Android: "Share > Wishtaa Maps" from another app opens the app on /home?shared=<id>. This takes the pictures from the service
 * worker and asks where they go: which map, which topic, and whether to put it on that topic or under it. Then the map opens and
 * the usual "Add picture" step (crop, and Compressed or Original) runs on it.
 */
export function SharedPictures() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const f = useFiles()
  const [files, setFiles] = useState<File[] | null>(null)
  const handled = useRef<string | null>(null)
  const shared = params.get('shared')

  useEffect(() => {
    const id = shared && sharedIdInUrl(`?shared=${shared}`)
    if (!id || handled.current === id) return
    handled.current = id // (React may run this twice: the pictures are taken once)
    const next = new URLSearchParams(params)
    next.delete('shared')
    setParams(next, { replace: true })
    void takeSharedPictures(id)
      .then((list) => {
        if (list.length) setFiles(list)
        else f.notify('Nothing in that share could be used. Only pictures can be added to a map.')
      })
      .catch(() => f.notify('The shared picture could not be read. Try sharing it again.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared])

  if (!files) return null
  return <ChooseWhere files={files} onClose={() => setFiles(null)} go={(path) => navigate(path)} />
}

export function ChooseWhere({ files, onClose, go }: { files: File[]; onClose: () => void; go: (path: string) => void }) {
  const { files: all, repo } = useFiles()
  const maps = useMemo(() => all.filter((x) => !x.trashed && (x.type === 'map' || x.type === 'kb')).sort((a, b) => b.modifiedAt - a.modifiedAt), [all])
  const [fileId, setFileId] = useState<string>(maps[0]?.id ?? NEW)
  const [topics, setTopics] = useState<IndexedTopic[]>([])
  const [topicId, setTopicId] = useState('')
  const [under, setUnder] = useState(true)
  const [busy, setBusy] = useState(false)
  const many = files.length > 1

  // Small previews of what is being added.
  const previews = useMemo(() => files.slice(0, 4).map((x) => URL.createObjectURL(x)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  useEffect(() => {
    let live = true
    setTopics([])
    setTopicId('')
    if (fileId === NEW) return
    void repo.getIndex(fileId).then((idx) => {
      if (!live) return
      const list = idx?.topics ?? []
      setTopics(list)
      setTopicId(list[0]?.id ?? '')
    })
    return () => {
      live = false
    }
  }, [fileId, repo])

  const label = (t: IndexedTopic, i: number) => `${t.text.trim().slice(0, 60) || 'Untitled topic'}${i === 0 ? ' (central topic)' : ''}`

  const submit = async () => {
    setBusy(true)
    let id = fileId
    let target: ShareTarget
    let kind: 'map' | 'kb' = maps.find((m) => m.id === fileId)?.type === 'kb' ? 'kb' : 'map'
    if (fileId === NEW) {
      const made = await repo.create({ type: 'map', name: 'Shared pictures', content: buildStarterContent('blank') })
      id = made.id
      kind = 'map'
      target = { kind: 'root' }
    } else {
      target = topicId ? (under || many ? { kind: 'child', parentId: topicId } : { kind: 'topic', id: topicId }) : { kind: 'root' }
    }
    setPendingShare({ fileId: id, files, target })
    onClose()
    go(`/${kind}/${id}`)
  }

  return (
    <Modal title={many ? `Add these ${files.length} pictures` : 'Add this picture'} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex gap-2" aria-label="The shared pictures">
          {previews.map((u) => (
            <img key={u} src={u} alt="" className="h-20 w-20 rounded-ui border border-line object-cover" />
          ))}
          {files.length > previews.length && <span className="self-center text-xs text-muted">+{files.length - previews.length} more</span>}
        </div>
        <label className="block">
          <span className="mb-1 block font-medium">Which map?</span>
          <select value={fileId} onChange={(e) => setFileId(e.target.value)} className="w-full rounded-ui border border-line bg-surface px-2 py-2">
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value={NEW}>A new map</option>
          </select>
        </label>
        {fileId !== NEW && (
          <>
            <label className="block">
              <span className="mb-1 block font-medium">Which topic?</span>
              <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="w-full rounded-ui border border-line bg-surface px-2 py-2" disabled={!topics.length}>
                {topics.slice(0, 500).map((t, i) => (
                  <option key={t.id} value={t.id}>
                    {label(t, i)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="space-y-1">
              <label className="flex items-center gap-2">
                <input type="radio" name="where" checked={under || many} onChange={() => setUnder(true)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
                As a new subtopic under it
              </label>
              <label className={`flex items-center gap-2 ${many ? 'opacity-50' : ''}`}>
                <input type="radio" name="where" disabled={many} checked={!under && !many} onChange={() => setUnder(false)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
                On that topic itself
              </label>
            </fieldset>
          </>
        )}
        <p className="text-xs text-muted">Next you can crop it and choose Compressed or Original, as with any picture you add.</p>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void submit()}>
          Continue
        </button>
      </div>
    </Modal>
  )
}
