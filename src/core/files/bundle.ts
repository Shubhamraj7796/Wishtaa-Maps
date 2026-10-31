import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import { packFile, unpackFile, type BlobStores, type PackInput, type PictureRef, type Unpacked } from '../drive/format'
import { extFor } from '../drive/pictures'
import type { StoredImage } from '../images/store'

/**
 * Two ways to take a map out of Wishtaa Maps as one file:
 *
 * - A bundle (`Name.wishtaa.zip`): the map file plus a `pictures/` folder. Opens anywhere, and nothing is embedded twice, so it is
 *   about the size of the pictures themselves. This is "Download as a single file".
 * - A shared copy (`Name.wishtaa`): one file with the pictures inside it. Someone else's copy of the app can open it even though it
 *   cannot read your pictures folder in Drive (the app only sees files it created or was given).
 */
export const BUNDLE_ENTRY = 'map.wishtaa'
const PICTURES = 'pictures/'

export const isZip = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b

/** The stored pictures a map lists, as the map file describes them. */
async function refsOf(ids: readonly string[], blobs: BlobStores): Promise<{ refs: PictureRef[]; images: StoredImage[] }> {
  const refs: PictureRef[] = []
  const images: StoredImage[] = []
  for (const id of new Set(ids)) {
    const img = await blobs.images.get(id).catch(() => undefined)
    if (!img) continue
    refs.push({ id, width: img.width, height: img.height, type: img.type, size: img.size })
    images.push(img)
  }
  return { refs, images }
}

export async function makeBundle(input: PackInput, blobs: BlobStores): Promise<Uint8Array> {
  const { refs, images } = await refsOf(input.imageIds ?? [], blobs)
  const manifest = await packFile({ ...input, pictureRefs: refs }, blobs, { pictures: 'refs' })
  const files: Zippable = { [BUNDLE_ENTRY]: [strToU8(manifest), { level: 6 }] }
  // Pictures are already compressed: they are stored as they are.
  for (const img of images) files[`${PICTURES}${img.id}.${extFor(img.type)}`] = [new Uint8Array(await img.blob.arrayBuffer()), { level: 0 }]
  return zipSync(files)
}

/** One file with everything inside it, for sending to someone. */
export function makeSharedCopy(input: PackInput, blobs: BlobStores): Promise<string> {
  return packFile(input, blobs, { pictures: 'embed' })
}

export interface OpenedFile extends Unpacked {
  /** Pictures the file lists that were not in it (a damaged bundle). */
  missing: number
}

/** Reads a bundle or a plain `.wishtaa` file. Pictures from a bundle are returned like embedded ones. */
export function openWishtaaFile(bytes: Uint8Array): OpenedFile {
  if (!isZip(bytes)) return { ...unpackFile(strFromU8(bytes)), missing: 0 }
  const entries = unzipSync(bytes)
  const manifest = entries[BUNDLE_ENTRY]
  if (!manifest) throw new Error('This zip file is not a Wishtaa Maps bundle.')
  const un = unpackFile(strFromU8(manifest))
  const byId = new Map<string, { data: Uint8Array }>()
  for (const [name, data] of Object.entries(entries)) {
    if (!name.startsWith(PICTURES)) continue
    const base = name.slice(PICTURES.length)
    const id = base.slice(0, base.lastIndexOf('.'))
    if (id) byId.set(id, { data })
  }
  const images: StoredImage[] = []
  let missing = 0
  for (const ref of un.pictureRefs) {
    const found = byId.get(ref.id)
    if (!found) {
      missing++
      continue
    }
    images.push({ id: ref.id, width: ref.width, height: ref.height, type: ref.type, size: found.data.byteLength, blob: new Blob([found.data as BlobPart], { type: ref.type }) })
  }
  return { ...un, images: [...un.images, ...images], missing }
}
