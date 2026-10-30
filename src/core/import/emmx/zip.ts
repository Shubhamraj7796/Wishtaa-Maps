import { unzipSync } from 'fflate'
import { MAX_IMPORT_IMAGE_BYTES } from './images'

/** A problem that stops the whole import, with a message that is safe to show. */
export class EmmxError extends Error {}

export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_ZIP_ENTRIES = 2000
export const MAX_ZIP_UNCOMPRESSED = 200 * 1024 * 1024
export const MAX_XML_BYTES = 25 * 1024 * 1024

const PAGE_RE = /^page\/[A-Za-z0-9_-]{1,64}\.xml$/
const RELS_RE = /^rels\/[A-Za-z0-9_-]{1,64}\.xml$/
// Pictures sit directly in media/ (no sub-folders); nothing else is ever read.
const MEDIA_RE = /^media\/[^/\\:\0]{1,128}$/

type Kind = 'doc' | 'page' | 'rels' | 'media'

function kindOf(name: string): Kind | null {
  if (name === 'document.xml') return 'doc'
  if (PAGE_RE.test(name)) return 'page'
  if (RELS_RE.test(name)) return 'rels'
  if (MEDIA_RE.test(name)) return 'media'
  return null
}

export interface EmmxArchive {
  /** The few known entries we read, by their exact name in the archive. Names are only ever used as map keys. */
  entries: Map<string, Uint8Array>
  /** Pictures that were too large to read (by archive name). */
  oversized: Set<string>
}

/**
 * Opens an .emmx (a ZIP) without trusting it: the size, entry count and total uncompressed size are checked before
 * anything is unpacked, only five kinds of known entries are ever unpacked, and entry names are never used as paths.
 */
export function readEmmxArchive(bytes: Uint8Array): EmmxArchive {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new EmmxError('That file is larger than 50 MB, which is more than we import.')
  if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new EmmxError('This is not a valid .emmx file (it is not a ZIP archive).')

  // First pass: look at the directory only (nothing is unpacked) and apply the zip-bomb limits.
  let count = 0
  let total = 0
  const tooMany = new EmmxError('This file has too many parts to be a normal .emmx file, so it was not imported.')
  const tooBig = new EmmxError('This file would unpack to more than 200 MB, so it was not imported.')
  try {
    unzipSync(bytes, {
      filter: (f) => {
        if (++count > MAX_ZIP_ENTRIES) throw tooMany
        total += f.originalSize
        if (total > MAX_ZIP_UNCOMPRESSED) throw tooBig
        return false
      },
    })
  } catch (e) {
    if (e === tooMany || e === tooBig) throw e
    throw new EmmxError('This is not a valid .emmx file (the ZIP archive is damaged).')
  }

  // Second pass: unpack only the known entries that are within their own size limits.
  const oversized = new Set<string>()
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        const kind = kindOf(f.name)
        if (!kind) return false
        const cap = kind === 'media' ? MAX_IMPORT_IMAGE_BYTES : MAX_XML_BYTES
        if (f.originalSize > cap) {
          if (kind === 'media') oversized.add(f.name)
          return false
        }
        return true
      },
    })
  } catch {
    throw new EmmxError('This is not a valid .emmx file (it could not be unpacked).')
  }
  const entries = new Map<string, Uint8Array>()
  for (const [name, data] of Object.entries(files)) entries.set(name, data)
  return { entries, oversized }
}

/**
 * Resolves a relationship target (such as `../media/image1.png`, relative to the `page/` folder) to a picture entry.
 * Anything that climbs out of the archive, is absolute, uses backslashes or points anywhere but `media/` is refused.
 */
export function resolveMediaTarget(target: string | undefined): string | null {
  if (!target || target.includes('\\') || target.includes('\0') || target.startsWith('/') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return null
  const out = ['page']
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length === 0) return null
      out.pop()
    } else out.push(seg)
  }
  if (out.length !== 2 || out[0] !== 'media') return null
  const name = out.join('/')
  return MEDIA_RE.test(name) ? name : null
}
