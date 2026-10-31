import type { DriveMeta } from '../files/types'
import type { DriveFileMeta } from './client'

/**
 * What we remember about a file in Drive after we last wrote or fetched it (the "base"): its content identity
 * (`md5Checksum`, `headRevisionId`) and `modifiedTime`. Drive's own `version` number is kept for reference only. It goes up
 * for housekeeping that does not touch the content (thumbnails, indexing, viewing), so comparing it flags our own file as
 * "changed by someone else".
 */
export function baseOf(meta: Pick<DriveFileMeta, 'version' | 'modifiedTime' | 'md5Checksum' | 'headRevisionId'>): DriveMeta {
  return {
    version: meta.version,
    modifiedTime: meta.modifiedTime,
    ...(meta.md5Checksum ? { md5: meta.md5Checksum } : {}),
    ...(meta.headRevisionId ? { revisionId: meta.headRevisionId } : {}),
  }
}

/**
 * Did someone else change the file's CONTENT in Drive since our base?
 *
 * Decided by the strongest evidence available:
 *  1. the content checksum (changes only when the bytes change);
 *  2. the head revision (a new one is made only by a real content upload);
 *  3. `modifiedTime` (for bases saved before checksums were recorded): it moves only when content or user-visible
 *     metadata changes, not for Drive's own housekeeping.
 * Never `version`. With no base (nothing synced yet) there is nothing to conflict with.
 */
export function isExternalChange(base: DriveMeta | null | undefined, remote: Pick<DriveFileMeta, 'modifiedTime' | 'md5Checksum' | 'headRevisionId'>): boolean {
  if (!base) return false
  if (base.md5 && remote.md5Checksum) return base.md5 !== remote.md5Checksum
  if (base.revisionId && remote.headRevisionId) return base.revisionId !== remote.headRevisionId
  const was = Date.parse(base.modifiedTime)
  const now = Date.parse(remote.modifiedTime)
  if (!Number.isFinite(was) || !Number.isFinite(now)) return true // can't tell: ask rather than overwrite
  return now > was
}
