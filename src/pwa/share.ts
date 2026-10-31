/**
 * Pictures shared INTO the app from another one (Android Chrome: Share, then Wishtaa Maps). The service worker receives the share,
 * keeps the pictures in its own cache under an id, and opens the app on `/home?shared=<id>`. This module hands them to the page.
 * iOS and iPadOS do not support share targets; there, pictures come in through "Add picture" instead.
 */
export const SHARE_CACHE = 'wishtaa-share'
export const MAX_SHARED = 20

/** The share id in an address, `'none'` when a share arrived with nothing usable, or null when this is not a share. */
export function sharedIdInUrl(search: string = typeof location === 'undefined' ? '' : location.search): string | null {
  const v = new URLSearchParams(search).get('shared')
  return v && /^[a-z0-9]{1,40}$/i.test(v) ? v : null
}

/** Reads the shared pictures and removes them from the cache (they are not kept once the page has them). */
export async function takeSharedPictures(id: string, storage: CacheStorage | undefined = typeof caches === 'undefined' ? undefined : caches): Promise<File[]> {
  if (!storage || id === 'none') return []
  const cache = await storage.open(SHARE_CACHE)
  const out: File[] = []
  for (let i = 0; i < MAX_SHARED; i++) {
    const key = `/__shared/${id}/${i}`
    const res = await cache.match(key)
    if (!res) break
    const blob = await res.blob()
    let name = 'picture'
    try {
      name = decodeURIComponent(res.headers.get('X-Name') ?? 'picture')
    } catch {
      /* keep the plain name */
    }
    out.push(new File([blob], name, { type: res.headers.get('Content-Type') ?? blob.type }))
    await cache.delete(key)
  }
  return out
}

/** `root`: under the central topic (for a new map, whose topics do not exist yet). */
export type ShareTarget = { kind: 'topic'; id: string } | { kind: 'child'; parentId: string } | { kind: 'root' }
export interface PendingShare {
  fileId: string
  files: File[]
  target: ShareTarget
}

let pending: PendingShare | null = null
export const setPendingShare = (p: PendingShare | null) => void (pending = p)
/** The picture(s) waiting for this file to finish opening, once. */
export function takePendingShare(fileId: string): PendingShare | null {
  if (!pending || pending.fileId !== fileId) return null
  const p = pending
  pending = null
  return p
}
