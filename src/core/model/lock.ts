import type * as Y from 'yjs'

/**
 * Read mode's last line of defence. A locked document ignores every edit made through `ydoc.transact` (all of the app's
 * commands, settings and theme changes use it), so even a code path that forgot to check the mode cannot change a map.
 * Loading a saved copy ('load') and creating the central topic ('init') still work.
 */
const locked = new WeakSet<Y.Doc>()
const ALWAYS = new Set<unknown>(['load', 'init', 'refresh'])

export function lockDoc(doc: Y.Doc, on: boolean) {
  if (on) locked.add(doc)
  else locked.delete(doc)
}

export const isDocLocked = (doc: Y.Doc) => locked.has(doc)

/** Makes `doc.transact` skip the work while the document is locked. Called once when a document is created. */
export function installLock(doc: Y.Doc) {
  const original = doc.transact.bind(doc) as (f: (t: Y.Transaction) => unknown, origin?: unknown) => unknown
  ;(doc as { transact: unknown }).transact = (f: (t: Y.Transaction) => unknown, origin?: unknown) => {
    if (locked.has(doc) && !ALWAYS.has(origin)) return undefined
    return original(f, origin)
  }
}
