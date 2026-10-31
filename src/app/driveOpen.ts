import { DriveError } from '@/core/drive/errors'
import type { DriveApi, DriveFileMeta } from '@/core/drive/client'
import { changedSinceConversion, checkEmmxContent, checkName, checkWishtaaContent, NotOpenable, type OpenKind } from '@/core/drive/openable'
import type { OpenedDoc } from '@/core/drive/picker'
import { MAX_FILE_BYTES } from '@/core/import/emmx/zip'
import type { FileRecord, SourceLink } from '@/core/files/types'
import type { PickedFile } from './importEmmx'

/** What "Open from Google Drive" needs from Drive and from the file repository. */
export interface OpenDeps {
  api: Pick<DriveApi, 'meta' | 'download' | 'downloadBytes'>
  repo: {
    openFromDrive(driveFileId: string): Promise<FileRecord>
    findConverted(sourceFileId: string): Promise<{ local?: FileRecord; driveFileId?: string; link: SourceLink } | null>
  }
}

/** A converted copy of an .emmx that already exists. */
export interface ConvertedCopy {
  local?: FileRecord
  driveFileId?: string
  link: SourceLink
  /** The original .emmx changed after it was converted. */
  changed: boolean
}

export type Inspected =
  | { status: 'ok'; kind: 'wishtaa'; id: string; name: string; meta: DriveFileMeta }
  | { status: 'ok'; kind: 'emmx'; id: string; name: string; meta: DriveFileMeta; converted: ConvertedCopy | null }
  | { status: 'rejected'; id: string; name: string; reason: string }

/** A Drive failure in plain words (sign-in expired, offline, access removed, full, not found). */
export function friendlyReason(e: unknown): string {
  if (e instanceof NotOpenable) return e.message
  if (e instanceof DriveError) {
    switch (e.kind) {
      case 'auth':
        return 'Your Google sign-in expired. Reconnect Google Drive and try again.'
      case 'offline':
        return 'No connection to Google Drive. Check your internet connection and try again.'
      case 'revoked':
        return 'Wishtaa Maps no longer has access to this file. Choose it again with Open from Google Drive.'
      case 'quota':
        return 'Your Google Drive is full, so the new file could not be saved there.'
      case 'rate':
        return 'Google Drive is busy right now. Wait a moment and try again.'
      case 'notfound':
        return 'This file is no longer in Google Drive.'
      default:
        return e.message
    }
  }
  return e instanceof Error && e.message ? e.message : 'Something went wrong with Google Drive.'
}

/**
 * Looks at what was picked. Names are checked first, then size, then (for a .wishtaa) the content, and for an .emmx whether a
 * converted copy already exists. Nothing is written anywhere. A file that cannot be opened is `rejected` with the reason; the
 * rest are still returned, so one bad pick never blocks the others.
 */
export async function inspectPicked(docs: OpenedDoc[], deps: OpenDeps): Promise<Inspected[]> {
  const out: Inspected[] = []
  for (const doc of docs) {
    try {
      const meta = await deps.api.meta(doc.id)
      const kind: OpenKind = checkName(meta.name)
      if (kind === 'wishtaa') {
        checkWishtaaContent(await deps.api.download(doc.id), meta.name)
        out.push({ status: 'ok', kind, id: doc.id, name: meta.name, meta })
        continue
      }
      if (Number(meta.size) > MAX_FILE_BYTES) throw new NotOpenable(`"${meta.name}" is larger than 50 MB, which is more than we open.`)
      const found = await deps.repo.findConverted(doc.id)
      out.push({
        status: 'ok',
        kind,
        id: doc.id,
        name: meta.name,
        meta,
        converted: found ? { ...found, changed: changedSinceConversion(found.link, meta.modifiedTime) } : null,
      })
    } catch (e) {
      out.push({ status: 'rejected', id: doc.id, name: doc.name, reason: friendlyReason(e) })
    }
  }
  return out
}

/**
 * Downloads an .emmx from Drive (progress 0 to 1) and checks that it really is one. Only reads: the original in Drive is never
 * changed, moved, renamed or deleted. Throws NotOpenable or DriveError.
 */
export async function downloadEmmx(item: Extract<Inspected, { kind: 'emmx' }>, deps: OpenDeps, onProgress?: (fraction: number) => void): Promise<PickedFile & { bytes: Uint8Array }> {
  const bytes = await deps.api.downloadBytes(item.id, onProgress)
  checkEmmxContent(bytes, item.name)
  return {
    name: item.name,
    size: bytes.byteLength,
    bytes,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }
}

/** The link stored on a converted copy. */
export function linkFor(item: Extract<Inspected, { kind: 'emmx' }>, now: Date = new Date()): SourceLink {
  return { fileId: item.id, name: item.name, modifiedTime: item.meta.modifiedTime, importedAt: now.toISOString() }
}

/** How a whole "Open from Google Drive" ended, for the summary. */
export interface OpenResult {
  name: string
  status: 'opened' | 'converted' | 'skipped' | 'failed'
  detail?: string
  record?: FileRecord
}

export function summarize(results: OpenResult[]) {
  const count = (s: OpenResult['status']) => results.filter((r) => r.status === s).length
  return { opened: count('opened'), converted: count('converted'), skipped: count('skipped'), failed: count('failed') }
}
