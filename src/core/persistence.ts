import * as Y from 'yjs'
import type { MapDoc } from './model/doc'

export function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export function encodeDoc(doc: MapDoc): string {
  return toBase64(Y.encodeStateAsUpdate(doc.ydoc))
}

/** Applies a saved state (origin "load", which is not treated as a change). Returns false if it is corrupt. */
export function loadInto(doc: MapDoc, b64: string): boolean {
  try {
    Y.applyUpdate(doc.ydoc, fromBase64(b64), 'load')
    return true
  } catch {
    return false
  }
}
