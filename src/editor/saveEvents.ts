/**
 * "A map was just saved" (after the person's own edits, never for loading or Read mode), with how many topics it has. The editor announces it,
 * and the account code listens (to tell the database about an invited person's first real map). Only a number travels.
 */
type Listener = (topics: number) => void
const listeners = new Set<Listener>()

export function onMapSaved(fn: Listener): () => void {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export function emitMapSaved(topics: number): void {
  for (const l of listeners) {
    try {
      l(topics)
    } catch {
      /* a listener must never disturb saving */
    }
  }
}
