import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildStarterContent } from '@/core/files/templates'
import { descendantsOf } from '@/core/files/tree'
import type { FileRecord, FileRepository } from '@/core/files/types'
import { routeForFile, setNavigator } from './navigation'
import { repository } from './repo'

export type Dialog =
  | { kind: 'new'; parentId: string | null }
  | { kind: 'folder'; parentId: string | null }
  | { kind: 'rename'; file: FileRecord }
  | { kind: 'move'; ids: string[] }
  | { kind: 'delete'; ids: string[] }
  | { kind: 'emptyBin' }
  | { kind: 'importInfo' }
  | { kind: 'templateInfo' }

export interface FilesApi {
  repo: FileRepository
  /** Every file and folder, including those in the bin. */
  files: FileRecord[]
  ready: boolean
  dialog: Dialog | null
  setDialog: (d: Dialog | null) => void
  message: string | null
  notify: (text: string) => void
  open: (file: FileRecord, topicId?: string) => void
  createMap: (parentId?: string | null) => Promise<FileRecord | null>
  createKb: (parentId?: string | null) => Promise<FileRecord | null>
  createFolder: (name: string, parentId?: string | null) => Promise<FileRecord | null>
  openSampleKb: () => Promise<void>
  rename: (file: FileRecord, name: string) => Promise<void>
  toggleStar: (file: FileRecord) => Promise<void>
  duplicate: (file: FileRecord) => Promise<void>
  moveTo: (ids: string[], parentId: string | null) => Promise<void>
  trash: (ids: string[]) => Promise<void>
  restore: (ids: string[]) => Promise<void>
  removeForever: (ids: string[]) => Promise<void>
  emptyBin: () => Promise<void>
}

const Ctx = createContext<FilesApi | null>(null)

export function useFiles(): FilesApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useFiles must be used inside <FilesProvider>')
  return v
}

const SAMPLE_KB_NAME = 'Example knowledge base'

export function FilesProvider({ repo = repository, children }: { repo?: FileRepository; children: ReactNode }) {
  const navigate = useNavigate()
  const [files, setFiles] = useState<FileRecord[]>([])
  const [ready, setReady] = useState(false)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setNavigator((to) => navigate(to))
    return () => setNavigator(null)
  }, [navigate])

  // Keep the list in step with the repository (saves from the editor also update modified times and thumbnails).
  useEffect(() => {
    let alive = true
    let pending = false
    const load = async () => {
      if (pending) return
      pending = true
      try {
        const [live, binned] = await Promise.all([repo.list({ parentId: 'any' }), repo.list({ parentId: 'any', trashed: true })])
        if (alive) {
          setFiles([...live, ...binned])
          setReady(true)
        }
      } finally {
        pending = false
      }
    }
    void load()
    const off = repo.subscribe(() => void load())
    return () => {
      alive = false
      off()
    }
  }, [repo])

  const notify = useCallback((text: string) => {
    setMessage(text)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 4500)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])

  const guard = useCallback(
    async <T,>(work: () => Promise<T>, fallback: T): Promise<T> => {
      try {
        return await work()
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Something went wrong.')
        return fallback
      }
    },
    [notify]
  )

  const api = useMemo<FilesApi>(() => {
    const open = (file: FileRecord, topicId?: string) => navigate(routeForFile(file, topicId))
    const make = (type: 'map' | 'kb') => async (parentId: string | null = null) =>
      guard(async () => {
        const file = await repo.create({ type, parentId, content: buildStarterContent(type === 'kb' ? 'kb' : 'blank') })
        navigate(routeForFile(file))
        return file
      }, null)
    return {
      repo,
      files,
      ready,
      dialog,
      setDialog,
      message,
      notify,
      open,
      createMap: make('map'),
      createKb: make('kb'),
      createFolder: (name, parentId = null) => guard(() => repo.create({ type: 'folder', name, parentId }), null),
      openSampleKb: async () => {
        const existing = files.find((f) => f.type === 'kb' && !f.trashed && f.name === SAMPLE_KB_NAME)
        if (existing) return open(existing)
        await guard(async () => {
          const file = await repo.create({ type: 'kb', name: SAMPLE_KB_NAME, content: buildStarterContent('sample-kb') })
          navigate(routeForFile(file))
        }, undefined)
      },
      rename: (file, name) => guard(async () => void (await repo.update(file.id, { name })), undefined),
      toggleStar: (file) => guard(async () => void (await repo.update(file.id, { starred: !file.starred })), undefined),
      duplicate: (file) =>
        guard(async () => {
          await repo.duplicate(file.id)
          notify(`Made a copy of "${file.name}".`)
        }, undefined),
      moveTo: (ids, parentId) =>
        guard(async () => {
          for (const id of ids) await repo.move(id, parentId)
          notify(ids.length === 1 ? 'Moved.' : `Moved ${ids.length} items.`)
        }, undefined),
      trash: (ids) =>
        guard(async () => {
          for (const id of ids) await repo.trash(id)
          notify(ids.length === 1 ? 'Moved to the bin.' : `Moved ${ids.length} items to the bin.`)
        }, undefined),
      restore: (ids) =>
        guard(async () => {
          for (const id of ids) await repo.restore(id)
          notify(ids.length === 1 ? 'Restored.' : `Restored ${ids.length} items.`)
        }, undefined),
      removeForever: (ids) =>
        guard(async () => {
          for (const id of ids) await repo.remove(id)
          notify('Deleted forever.')
        }, undefined),
      emptyBin: () =>
        guard(async () => {
          await repo.emptyTrash()
          notify('The bin is empty.')
        }, undefined),
    }
  }, [repo, files, ready, dialog, message, notify, navigate, guard])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

/** How many items a delete would affect, counting everything inside folders. */
export function countAffected(files: readonly FileRecord[], ids: readonly string[]): number {
  const all = new Set<string>(ids)
  for (const id of ids) for (const d of descendantsOf(files, id)) all.add(d.id)
  return all.size
}
