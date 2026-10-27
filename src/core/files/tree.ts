import type { FileRecord, SortSpec } from './types'

/** Items directly inside a folder (null = top level). */
export function childrenOfFolder(files: readonly FileRecord[], parentId: string | null, trashed = false): FileRecord[] {
  return files.filter((f) => f.parentId === parentId && f.trashed === trashed)
}

/** Everything inside a folder, at any depth (not including the folder). */
export function descendantsOf(files: readonly FileRecord[], id: string): FileRecord[] {
  const byParent = new Map<string | null, FileRecord[]>()
  for (const f of files) {
    const list = byParent.get(f.parentId)
    if (list) list.push(f)
    else byParent.set(f.parentId, [f])
  }
  const out: FileRecord[] = []
  const stack = [...(byParent.get(id) ?? [])]
  while (stack.length) {
    const f = stack.pop() as FileRecord
    out.push(f)
    stack.push(...(byParent.get(f.id) ?? []))
  }
  return out
}

/** True if `id` is `ancestorId` or lies somewhere inside it. Safe against loops. */
export function isInside(files: readonly FileRecord[], id: string, ancestorId: string): boolean {
  const byId = new Map(files.map((f) => [f.id, f]))
  let cur: string | null | undefined = id
  for (let guard = 0; cur && guard < 10000; guard++) {
    if (cur === ancestorId) return true
    cur = byId.get(cur)?.parentId
  }
  return false
}

/** Folders from the top level down to `folderId` (inclusive), for breadcrumbs. Empty for the top level. */
export function breadcrumbs(files: readonly FileRecord[], folderId: string | null): FileRecord[] {
  const byId = new Map(files.map((f) => [f.id, f]))
  const out: FileRecord[] = []
  let cur = folderId ? byId.get(folderId) : undefined
  for (let guard = 0; cur && guard < 10000; guard++) {
    out.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return out
}

/** Items shown in the bin: those deleted directly, not the contents of a deleted folder. */
export function trashRoots(files: readonly FileRecord[]): FileRecord[] {
  return files.filter((f) => f.trashed && (f.trashedRoot ?? f.id) === f.id)
}

export interface FolderOption {
  folder: FileRecord
  depth: number
}

/** Folders as an indented list (for "Move to"), leaving out some folders and everything inside them. */
export function folderOptions(files: readonly FileRecord[], exclude: readonly string[] = []): FolderOption[] {
  const folders = files.filter((f) => f.type === 'folder' && !f.trashed)
  const out: FolderOption[] = []
  const walk = (parentId: string | null, depth: number) => {
    const kids = folders.filter((f) => f.parentId === parentId && !exclude.includes(f.id)).sort((a, b) => a.name.localeCompare(b.name))
    for (const k of kids) {
      out.push({ folder: k, depth })
      walk(k.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** Sorts a list. Folders always come first. */
export function sortFiles(list: readonly FileRecord[], sort: SortSpec): FileRecord[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  const value = (f: FileRecord) => (sort.key === 'name' ? f.name.toLowerCase() : sort.key === 'created' ? f.createdAt : f.modifiedAt)
  return [...list].sort((a, b) => {
    if ((a.type === 'folder') !== (b.type === 'folder')) return a.type === 'folder' ? -1 : 1
    const va = value(a)
    const vb = value(b)
    const c = va < vb ? -1 : va > vb ? 1 : 0
    return c !== 0 ? c * sign : a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1)
  })
}

/** "Untitled map", "Untitled map 2", ... not used by a sibling. */
export function uniqueName(siblings: readonly FileRecord[], base: string): string {
  const used = new Set(siblings.map((s) => s.name.toLowerCase()))
  if (!used.has(base.toLowerCase())) return base
  for (let n = 2; n < 10000; n++) {
    const candidate = `${base} ${n}`
    if (!used.has(candidate.toLowerCase())) return candidate
  }
  return `${base} ${Date.now()}`
}
