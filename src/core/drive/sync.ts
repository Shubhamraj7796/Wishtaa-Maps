import type { DriveMeta } from '../files/types'
import type { DriveFileMeta } from './client'

/**
 * Who wrote a file's latest content. Every write we make also sets these as Drive `appProperties` on the file, so a later
 * check can tell "our own write" from "someone else's" by identity, not by clocks:
 *  - `editorSessionId`: one per open tab (made fresh on every page load);
 *  - `writeCounter`: goes up with every write of that session;
 *  - `writerOrigin`: the address the app was served from (localhost:5181, maps.wishtaa.com), shown to the person.
 */
export interface Marker {
  session: string
  counter: number
  origin?: string
}

const SESSION = 'editorSessionId'
const COUNTER = 'writeCounter'
const ORIGIN = 'writerOrigin'

export function markerProps(m: Marker): Record<string, string> {
  return { [SESSION]: m.session, [COUNTER]: String(m.counter), ...(m.origin ? { [ORIGIN]: m.origin.slice(0, 80) } : {}) }
}

/** The writer marker on a Drive file, or null when it was written by something that does not set one. */
export function markerOf(meta: Pick<DriveFileMeta, 'appProperties'>): Marker | null {
  const p = meta.appProperties
  const session = p?.[SESSION]
  const counter = Number(p?.[COUNTER])
  if (!session || !Number.isInteger(counter)) return null
  return { session, counter, ...(p?.[ORIGIN] ? { origin: p[ORIGIN] } : {}) }
}

/**
 * What we remember about a file in Drive after we last wrote or fetched it (the "base"): the content identity
 * (`headRevisionId`, `md5Checksum`), `modifiedTime`, and the writer marker of that write. Drive's own `version` number is
 * kept for reference only: it goes up for housekeeping that does not touch the content (thumbnails, indexing, viewing).
 * `sent` is the marker we just wrote, used when Drive's reply does not echo `appProperties`.
 */
export function baseOf(meta: Pick<DriveFileMeta, 'version' | 'modifiedTime' | 'md5Checksum' | 'headRevisionId' | 'appProperties'>, sent?: Marker): DriveMeta {
  const m = markerOf(meta) ?? sent ?? null
  return {
    version: meta.version,
    modifiedTime: meta.modifiedTime,
    ...(meta.md5Checksum ? { md5: meta.md5Checksum } : {}),
    ...(meta.headRevisionId ? { revisionId: meta.headRevisionId } : {}),
    ...(m ? { session: m.session, counter: m.counter } : {}),
  }
}

export type SyncState =
  /** Drive still holds exactly the revision we last wrote or fetched. */
  | 'same'
  /** Drive holds a newer revision, but it carries OUR marker: our own write (for example one whose reply was lost). */
  | 'ours'
  /** Someone else changed the file's content. */
  | 'external'

/**
 * Is what Drive holds now our own, or did someone else change it?
 *
 *  1. Same revision, or same content checksum: nothing changed (Drive's housekeeping bumps `version` only).
 *  2. A different revision whose writer marker is ours (same session, a counter not older than our last write): our own write.
 *  3. Anything else with a different revision or checksum: another editor (another tab, address, device, or Drive itself).
 *
 * `modifiedTime` is used only for old bases that recorded neither a revision nor a checksum. Client and Drive clocks are
 * never compared with each other.
 */
export function classify(base: DriveMeta | null | undefined, remote: Pick<DriveFileMeta, 'modifiedTime' | 'md5Checksum' | 'headRevisionId' | 'appProperties'>): SyncState {
  if (!base) return 'same'
  const sameRev = base.revisionId && remote.headRevisionId ? base.revisionId === remote.headRevisionId : undefined
  if (sameRev) return 'same'
  const sameMd5 = base.md5 && remote.md5Checksum ? base.md5 === remote.md5Checksum : undefined
  if (sameMd5) return 'same'
  const m = markerOf(remote)
  if (m && base.session && m.session === base.session && base.counter !== undefined && m.counter >= base.counter) return 'ours'
  if (sameRev === false || sameMd5 === false) return 'external'
  // Old base with no revision or checksum on one side: the only evidence left is the modified time.
  const was = Date.parse(base.modifiedTime)
  const now = Date.parse(remote.modifiedTime)
  if (!Number.isFinite(was) || !Number.isFinite(now)) return 'external' // can't tell: ask rather than overwrite
  return now > was ? 'external' : 'same'
}

/** True only when someone else changed the file's content. */
export const isExternalChange = (base: DriveMeta | null | undefined, remote: Parameters<typeof classify>[1]) => classify(base, remote) === 'external'

/** A plain-language line about who last wrote the file in Drive, for the conflict dialog and the save details. */
export function describeWriter(remote: Pick<DriveFileMeta, 'appProperties'>, here: { session: string; origin?: string }): string {
  const m = markerOf(remote)
  if (!m) return 'It was changed from outside this app (Google Drive itself, another device, or a version of Wishtaa Maps from before writers were recorded).'
  if (m.session === here.session) return 'It was last saved from this tab.'
  if (m.origin && m.origin !== here.origin) return `It was last saved from another address: ${m.origin}.`
  return 'It was last saved from another tab or window of this same address, or from another device using it.'
}
