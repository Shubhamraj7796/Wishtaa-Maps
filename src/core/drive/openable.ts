import { unzipSync } from 'fflate'
import { MAX_FILE_BYTES } from '../import/emmx/zip'
import type { SourceLink } from '../files/types'

/** What the picker shows and what we refuse, in one place. */
export const OPEN_HINT = 'Only .wishtaa and .emmx files can be opened.'

/** What is said about any file that is neither. */
export const NOT_A_MIND_MAP = "This file isn't a .wishtaa or .emmx mind map"

/**
 * The Google Picker cannot filter by file extension, and Drive gives a file uploaded from a computer an unpredictable type
 * (octet-stream, zip, x-zip-compressed, a vendor type, or none). So the Picker lists EVERY file, and each pick is checked
 * afterwards: by name, and when the name does not say, by content.
 */

export type OpenKind = 'wishtaa' | 'emmx'

/** A file that cannot be opened, with a message that is safe to show. */
export class NotOpenable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotOpenable'
  }
}

export function kindOfName(name: string): OpenKind | null {
  if (/\.wishtaa$/i.test(name.trim())) return 'wishtaa'
  if (/\.emmx$/i.test(name.trim())) return 'emmx'
  return null
}

/** The name must end in .wishtaa or .emmx (any capitals). */
export function checkName(name: string): OpenKind {
  const kind = kindOfName(name)
  if (!kind) throw new NotOpenable(`${NOT_A_MIND_MAP}: "${name}". ${OPEN_HINT}`)
  return kind
}

/**
 * True for types that can never be one of ours (a PDF, a picture, a Google Doc, a Word file...): those are turned away without
 * downloading anything. Anything else, including no type at all, is looked at by content.
 */
export function clearlyOtherType(mime: string | undefined): boolean {
  if (!mime) return false
  return (
    mime === 'application/pdf' ||
    /^(image|video|audio)\//.test(mime) ||
    mime.startsWith('application/vnd.google-apps.') ||
    mime.startsWith('application/vnd.openxmlformats-officedocument.') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'text/html' ||
    mime === 'text/plain' ||
    mime === 'text/csv'
  )
}

/** Looks inside a file whose name does not say what it is: an .emmx is a ZIP with a document.xml, a .wishtaa is our JSON. */
export function sniffKind(bytes: Uint8Array): OpenKind | null {
  if (bytes.byteLength >= 22 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    try {
      checkEmmxContent(bytes, 'file')
      return 'emmx'
    } catch {
      return null
    }
  }
  try {
    checkWishtaaContent(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 'file')
    return 'wishtaa'
  } catch {
    return null
  }
}

/** A .wishtaa is JSON that says it is ours and has a format version. */
export function checkWishtaaContent(text: string, name: string): void {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new NotOpenable(`"${name}" is not a Wishtaa Maps file (it is not JSON). ${OPEN_HINT}`)
  }
  const f = raw as { app?: unknown; version?: unknown } | null
  if (!f || typeof f !== 'object' || f.app !== 'wishtaa-maps' || typeof f.version !== 'number') {
    throw new NotOpenable(`"${name}" is not a Wishtaa Maps file. ${OPEN_HINT}`)
  }
}

/** An .emmx is a ZIP (it starts with the ZIP signature) that has a document.xml. */
export function checkEmmxContent(bytes: Uint8Array, name: string): void {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new NotOpenable(`"${name}" is larger than 50 MB, which is more than we open.`)
  const zip = bytes.byteLength >= 22 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  if (!zip) throw new NotOpenable(`"${name}" is named .emmx but is not a valid .emmx file (it is not a ZIP archive). ${OPEN_HINT}`)
  let hasDocument = false
  try {
    unzipSync(bytes, {
      filter: (f) => {
        if (f.name === 'document.xml') hasDocument = true
        return false
      },
    })
  } catch {
    throw new NotOpenable(`"${name}" is not a valid .emmx file (the ZIP archive is damaged).`)
  }
  if (!hasDocument) throw new NotOpenable(`"${name}" is a ZIP file but not an .emmx (it has no document.xml). ${OPEN_HINT}`)
}

// ---- the link from a converted copy back to its original ------------------------------------------------------------

/** Drive appProperties can hold only short values (124 bytes with the key), so the name is shortened there. */
export function sourceProps(s: SourceLink): Record<string, string> {
  return { sourceFileId: s.fileId, sourceName: s.name.slice(0, 60), sourceModifiedTime: s.modifiedTime, importedAt: s.importedAt }
}

export function sourceOf(props: Record<string, string> | undefined): SourceLink | null {
  if (!props?.sourceFileId) return null
  return { fileId: props.sourceFileId, name: props.sourceName ?? '', modifiedTime: props.sourceModifiedTime ?? '', importedAt: props.importedAt ?? '' }
}

/** True when the original changed after it was converted. */
export function changedSinceConversion(link: SourceLink, currentModifiedTime: string): boolean {
  const was = Date.parse(link.modifiedTime)
  const now = Date.parse(currentModifiedTime)
  return Number.isFinite(was) && Number.isFinite(now) && now > was
}
