# Files, folders and knowledge bases

How the app shell stores and finds files, and what a cloud backend will need.

## Screens and routes

| Route | Screen |
|---|---|
| `/home` | Create new, Continue where you left off, Recent files, Starred |
| `/files`, `/files/:folderId` | All files: My files, Notes, Resources, Recycle bin (`?tab=notes\|resources\|bin`) |
| `/kb` | Knowledge bases, Notes, Notes trash (`?tab=notes\|trash`) |
| `/map/:id`, `/kb/:id` | The editor. Both load the same editor; a knowledge base always opens as a mind map and shows the Notes button. A file opened at the wrong route is redirected. `?topic=<id>` selects and centres a topic. |
| `/gallery`, `/drive` | Placeholders (templates, Google Drive) |
| `/search?q=&type=&tag=` | Search across all files |

`vercel.json` rewrites every path to `index.html`, so refresh and deep links work.

## The file record

```ts
interface FileRecord {
  id: string
  name: string
  type: 'folder' | 'map' | 'kb'
  parentId: string | null        // any depth
  createdAt: number
  modifiedAt: number             // updated on every save
  starred: boolean
  trashed: boolean               // trashedAt / trashedRoot say what was deleted together
  storage: 'local' | 'drive' | 'cloud'
  thumbnail?: string | null      // SVG data URL, refreshed on every save
  contentRef: string | null      // where the content lives (local: the file's own id)
  imageIds?, attachmentIds?, topicCount?
}
```

Content (the Yjs document) is stored separately from the record, so listing files never loads maps.
A per-file **search index** (topic text, plain-text notes, tags, links to other files, pictures and attachments) is
saved with the content and is what search, the Notes tab, Resources tab and backlinks read.

## Layers

```
screens ── FilesContext ── FileRepository (interface)
                              └── RepositoryCore   all the rules (names, nesting, cycles, trash, search)
                                    └── Backend    IndexedDbBackend (browser) | MemoryBackend (tests)
```

`FileRepository` has `list, get, create, update, move, duplicate, trash, restore, remove, emptyTrash, search,
loadContent, saveContent, getIndex, allIndexes, referencedImageIds, referencedAttachmentIds, subscribe`.
A `DriveRepository` (Phase B) or `SupabaseRepository` implements the same interface; no screen changes.

Rules enforced in `RepositoryCore` (and tested):

- A parent must be an existing, non-trashed folder. Moving a folder into itself or its own descendant is refused.
- Trashing a folder takes everything inside it; restoring brings it back. If the original parent is still in the bin,
  the item is restored to the top level.
- Delete forever removes the item, everything inside, its content and its index.
- Duplicating a folder copies its whole tree.
- `saveContent` updates `modifiedAt`, thumbnail, counters and the search index in one write.

## Saving

The editor opens a file with `openFile(id)` and saves back to it with the same autosave as before (debounce 400 ms,
serialised writes, retry with backoff, flush on blur / hide). IndexedDB cannot finish a write while the page is closing,
so the latest state is also kept in a small synchronous copy (`wishtaamaps:pending:<fileId>`) which is put back into the
file the next time it opens. Opens and closes run through a queue, so React's double mount in development can never leave
a file open without its observers.

Pictures and attachments stay in shared IndexedDB stores. Clean-up asks the repository which ids any file (including the
bin) still uses, so a picture used by one file is never removed because another file dropped it.

## Google Drive

`DriveRepository` wraps the local repository (`src/core/drive/repository.ts`). A file with `storage: 'drive'` keeps its
local copy; `contentRef` is the Drive file id and `driveMeta` is the Drive version last seen. Saves write locally and then
upload; before each upload the Drive version is compared, and a mismatch becomes a conflict the user resolves.
Opening a Drive file fetches a newer remote version first when nothing is waiting to upload, and falls back to the local
copy when Drive can't be reached. Setup and behaviour: `docs/google-drive-setup.md`.

## Links between files

A topic link of the form `#map:<fileId>` or `#map:<fileId>/<topicId>` points to another map or knowledge base.
**Backlinks** are found by scanning the indexes for links to the open file (and topic).

## What the current Supabase schema supports

Existing (`0001_schema.sql`): `folders` (owner, `parent_id`, name), `maps` (owner, `folder_id`, title,
`is_favourite`, `deleted_at`, sharing fields, `updated_at`), `pages.ydoc` (the Yjs snapshot), `collaborators`,
`topics`, and the rest.

It already covers: folders nested to any depth, maps in folders, starring maps, trashing maps, renaming, modified time,
and the Yjs content. It **does not yet cover**:

| Need | Gap |
|---|---|
| Knowledge bases | no `kind` column on `maps` (`'map'` or `'kb'`) |
| Thumbnail | no column (or Storage object) |
| Where a file lives | no `storage` column (`cloud`, later `drive` references) |
| Folders: star and trash | `folders` has no `is_favourite` or `deleted_at` |
| Folder modified time | `folders` has no `updated_at` |
| Per-file search index and backlinks | `topics` has normalised rows (text, notes, tags) but no link-to-file column |
| Internal file links | no table or column for links from a topic to another map |
| Trash roots | cannot tell what was deleted together (a `trashed_root` id) |

### Proposed migration 0003 (not applied)

`docs/proposed/0003_files_and_kb.sql` adds `kind`, `thumbnail`, `storage`, `trashed_root` to `maps`; star, trash and
`updated_at` to `folders`; and a `topic_links` table (source topic to target map and optional topic) with owner-based RLS.
It is kept outside `supabase/migrations` on purpose so nothing applies it until it is reviewed.

## Not built yet

Own cloud storage, sharing, "Shared with me" and "My shares" (placeholders only), accounts, templates, import. When accounts arrive, signed-out visitors will see "Log in to view your files" instead of the local
files banner.
