import type { ImageStore, StoredImage } from '../images/store'
import { fromBase64, toBase64 } from '../persistence'
import { DriveError } from './errors'

/** New files are created with this type, so the Google Picker can show them precisely. */
export const WISHTAA_MIME = 'application/vnd.wishtaa.map+json'
/** Files made before the type existed are plain JSON. They are still read; they are not rewritten just to change their type. */
export const WISHTAA_LEGACY_MIME = 'application/json'
export const WISHTAA_EXT = '.wishtaa'
/** Pictures embedded in the file (the first format, and what a shared copy uses). */
export const FORMAT_VERSION = 1
/** Pictures referred to by id; their bytes are separate files in Drive. */
export const REFS_VERSION = 2

/** What the map file says about a picture: enough to lay it out and to fetch it. */
export interface PictureRef {
  id: string
  width: number
  height: number
  type: string
  size: number
}
const APP = 'wishtaa-maps'

interface BlobEntry {
  type: string
  width: number
  height: number
  size: number
  /** base64 */
  data: string
}

/** The `.wishtaa` file: plain JSON so it can be read, versioned and migrated. */
export interface WishtaaFile {
  app: typeof APP
  version: number
  type: 'map' | 'kb'
  name: string
  createdAt: number
  modifiedAt: number
  /** The map document, base64. */
  content: string
  /** Pictures and attachments used by the map, so it opens complete on any device. */
  images?: Record<string, BlobEntry>
  attachments?: Record<string, BlobEntry>
  /** Version 2: the pictures by id (no bytes). */
  pictures?: PictureRef[]
}

export interface BlobStores {
  images: ImageStore
  attachments: ImageStore
}

export interface Unpacked {
  type: 'map' | 'kb'
  name: string
  createdAt: number
  modifiedAt: number
  content: Uint8Array
  images: StoredImage[]
  attachments: StoredImage[]
  /** 1 = pictures embedded, 2 = pictures by id. */
  version: number
  pictureRefs: PictureRef[]
}

async function toEntry(img: StoredImage): Promise<BlobEntry> {
  const bytes = new Uint8Array(await img.blob.arrayBuffer())
  return { type: img.type, width: img.width, height: img.height, size: img.size, data: toBase64(bytes) }
}

function fromEntry(id: string, e: BlobEntry): StoredImage {
  return { id, type: e.type, width: e.width, height: e.height, size: e.size, blob: new Blob([fromBase64(e.data) as BlobPart], { type: e.type }) }
}

async function collect(store: ImageStore | undefined, ids: readonly string[] | undefined): Promise<Record<string, BlobEntry> | undefined> {
  if (!store || !ids?.length) return undefined
  const out: Record<string, BlobEntry> = {}
  for (const id of ids) {
    const img = await store.get(id).catch(() => undefined)
    if (img) out[id] = await toEntry(img)
  }
  return Object.keys(out).length ? out : undefined
}

export interface PackInput {
  type: 'map' | 'kb'
  name: string
  createdAt: number
  modifiedAt: number
  content: Uint8Array
  imageIds?: readonly string[]
  attachmentIds?: readonly string[]
  /** For `refs`: what to write about each picture. */
  pictureRefs?: readonly PictureRef[]
}

/** Builds the text of a `.wishtaa` file. */
export async function packFile(input: PackInput, blobs?: BlobStores, opts: { pictures?: 'embed' | 'refs' } = {}): Promise<string> {
  const refs = opts.pictures === 'refs'
  const file: WishtaaFile = {
    app: APP,
    version: refs ? REFS_VERSION : FORMAT_VERSION,
    type: input.type,
    name: input.name,
    createdAt: input.createdAt,
    modifiedAt: input.modifiedAt,
    content: toBase64(input.content),
    ...(refs ? { pictures: [...(input.pictureRefs ?? [])] } : { images: await collect(blobs?.images, input.imageIds) }),
    attachments: await collect(blobs?.attachments, input.attachmentIds),
  }
  return JSON.stringify(file)
}

const notOurs = () => new DriveError('other', 'This is not a Wishtaa Maps file.')

/** Reads the text of a `.wishtaa` file, with clear errors for anything else. */
export function unpackFile(text: string): Unpacked {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw notOurs()
  }
  if (typeof raw !== 'object' || raw === null) throw notOurs()
  const f = raw as Partial<WishtaaFile>
  if (f.app !== APP || typeof f.content !== 'string' || (f.type !== 'map' && f.type !== 'kb')) throw notOurs()
  if (typeof f.version !== 'number' || f.version > REFS_VERSION) {
    throw new DriveError('other', 'This file was saved by a newer version of Wishtaa Maps. Reload the page to update, then try again.')
  }
  let content: Uint8Array
  try {
    content = fromBase64(f.content)
  } catch {
    throw notOurs()
  }
  const entries = (rec: Record<string, BlobEntry> | undefined) => Object.entries(rec ?? {}).map(([id, e]) => fromEntry(id, e))
  return {
    type: f.type,
    name: typeof f.name === 'string' && f.name.trim() ? f.name : 'Untitled map',
    createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now(),
    modifiedAt: typeof f.modifiedAt === 'number' ? f.modifiedAt : Date.now(),
    content,
    images: entries(f.images),
    attachments: entries(f.attachments),
    version: f.version,
    pictureRefs: (Array.isArray(f.pictures) ? f.pictures : []).filter((p): p is PictureRef => !!p && typeof p.id === 'string' && typeof p.width === 'number' && typeof p.height === 'number'),
  }
}

/** Puts pictures and attachments from a file into local storage (keeping ones already there). */
export async function restoreBlobs(u: Pick<Unpacked, 'images' | 'attachments'>, blobs?: BlobStores): Promise<void> {
  if (!blobs) return
  for (const [store, items] of [[blobs.images, u.images], [blobs.attachments, u.attachments]] as const) {
    for (const item of items) {
      if (!(await store.getMeta(item.id).catch(() => undefined))) await store.put(item)
    }
  }
}

/** The name Drive shows for a file. */
export const driveFileName = (name: string) => `${name.replace(/[\\/]/g, '-')}${WISHTAA_EXT}`
export const nameFromDrive = (driveName: string) => driveName.replace(/\.wishtaa$/i, '')
