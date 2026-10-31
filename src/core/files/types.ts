export type FileType = 'folder' | 'map' | 'kb'
export type StorageKind = 'local' | 'drive' | 'cloud'

/** What we last knew about a file's copy in Google Drive, to spot changes made elsewhere. */
export interface DriveMeta {
  /** Drive's version counter for the file (changes on every edit, including from other devices). */
  version: string
  modifiedTime: string
  /** Checksum of the content we last wrote or fetched: the file's content identity. */
  md5?: string
  /** The Drive revision of that content. */
  revisionId?: string
  /** Who wrote that revision: the editing tab's session and its write counter (see `drive/sync.ts`). */
  session?: string
  counter?: number
  /** The Drive folder holding this map's pictures (one file per picture). */
  picturesFolderId?: string
  /** 2 once the map file refers to pictures by id; unset for a file that still has them embedded. */
  format?: 1 | 2
  /** A fingerprint of what was last sent (map content, name and picture ids): a save with the same one sends nothing. */
  hash?: string
  /** The pictures the map file lists (id, size, type), kept so a device that has not downloaded them all never drops one on save. */
  refs?: { id: string; width: number; height: number; type: string; size: number }[]
}

/** One folder, mind map or knowledge base. */
export interface FileRecord {
  id: string
  name: string
  type: FileType
  parentId: string | null
  createdAt: number
  modifiedAt: number
  starred: boolean
  trashed: boolean
  trashedAt?: number
  /** For items in the bin: the item that was deleted (a folder takes its contents with it). */
  trashedRoot?: string | null
  storage: StorageKind
  /** Small picture of the map, saved with the file and refreshed on every save (an SVG data URL). */
  thumbnail?: string | null
  /** Where the content lives: for local files, the file's own id. */
  contentRef: string | null
  /** Pictures and attachments used, so unused ones can be cleaned up across all files. */
  imageIds?: string[]
  attachmentIds?: string[]
  topicCount?: number
  /** For files stored in Google Drive (`storage: 'drive'`, `contentRef` = the Drive file id). */
  driveMeta?: DriveMeta | null
  /**
   * Protection: the file opens in Read mode (view only) unless the person chooses Edit. Kept in the file's own metadata, not
   * in the map, and mirrored to Drive for Drive files so it follows the file to other devices.
   */
  readOnlyDefault?: boolean
  /** For a map converted from another file (an .emmx opened from Google Drive): where it came from. */
  source?: SourceLink | null
}

/** The original file a map was converted from. The original is never changed. */
export interface SourceLink {
  /** The Drive id of the original. */
  fileId: string
  name: string
  /** The original's modified time when it was converted (ISO), to tell whether it changed since. */
  modifiedTime: string
  /** When it was converted (ISO). */
  importedAt: string
}

export interface FileLinkRef {
  file: string
  topic?: string
}

/** What search and "backlinks" need to know about a topic, without opening the file. */
export interface IndexedTopic {
  id: string
  text: string
  /** Plain text of the note (shortened). */
  note: string
  tags: string[]
  /** Links from this topic to other files or topics. */
  links: FileLinkRef[]
}

export interface ResourceEntry {
  kind: 'image' | 'file'
  id: string
  name?: string
  size?: number
  type?: string
  topicId: string
  topicText: string
}

export interface FileIndex {
  fileId: string
  topics: IndexedTopic[]
  resources: ResourceEntry[]
}

export type SortKey = 'modified' | 'name' | 'created'
export interface SortSpec {
  key: SortKey
  dir: 'asc' | 'desc'
}
export const DEFAULT_SORT: SortSpec = { key: 'modified', dir: 'desc' }

export interface ListQuery {
  /** A folder id, null for the top level, or 'any' for everywhere. */
  parentId?: string | null | 'any'
  types?: FileType[]
  trashed?: boolean
  starred?: boolean
  sort?: SortSpec
}

export interface SearchQuery {
  text: string
  types?: FileType[]
  /** Only files with a topic carrying this tag. */
  tag?: string
  limit?: number
}

export interface SearchHit {
  file: FileRecord
  /** Where inside the file it matched (absent when only the file name matched). */
  topicId?: string
  topicText?: string
  matched: 'name' | 'topic' | 'note' | 'tag'
  snippet?: string
}

export interface CreateInput {
  name?: string
  type: FileType
  parentId?: string | null
  content?: Uint8Array
  storage?: StorageKind
}

export type FilePatch = Partial<
  Pick<FileRecord, 'name' | 'starred' | 'thumbnail' | 'imageIds' | 'attachmentIds' | 'topicCount' | 'storage' | 'contentRef' | 'driveMeta' | 'readOnlyDefault' | 'source'>
>

export interface SaveMeta {
  thumbnail?: string | null
  imageIds?: string[]
  attachmentIds?: string[]
  topicCount?: number
  index?: FileIndex
}

/**
 * Where files live. Local browser storage today; Google Drive and our own cloud implement the same interface,
 * so the screens never change.
 */
export interface FileRepository {
  list(query?: ListQuery): Promise<FileRecord[]>
  get(id: string): Promise<FileRecord | null>
  create(input: CreateInput): Promise<FileRecord>
  update(id: string, patch: FilePatch): Promise<FileRecord>
  move(id: string, parentId: string | null): Promise<FileRecord>
  duplicate(id: string): Promise<FileRecord>
  trash(id: string): Promise<void>
  restore(id: string): Promise<void>
  /** Deletes forever (the item and everything inside it). */
  remove(id: string): Promise<void>
  emptyTrash(): Promise<void>
  search(query: SearchQuery): Promise<SearchHit[]>

  loadContent(id: string): Promise<Uint8Array | null>
  /** Saves the map's content and refreshes the file's modified time, thumbnail and index. */
  saveContent(id: string, data: Uint8Array, meta?: SaveMeta): Promise<FileRecord>

  getIndex(id: string): Promise<FileIndex | null>
  allIndexes(): Promise<FileIndex[]>
  /** Every picture and attachment id used by any file (including the bin), for clean-up. */
  referencedImageIds(): Promise<Set<string>>
  referencedAttachmentIds(): Promise<Set<string>>

  /** Called after any change. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}
