import { useSyncExternalStore } from 'react'
import { PREFS_KEY, parsePrefs, type CreatePrefs } from '@/core/drive/placement'

const listeners = new Set<() => void>()
let lastRaw: string | null | undefined
let lastPrefs: CreatePrefs = parsePrefs(null)

function read(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(PREFS_KEY)
  } catch {
    return null
  }
}

/** The remembered "Save to" choices. The same object is returned until they change, so React can subscribe to it. */
export function getPrefs(): CreatePrefs {
  const raw = read()
  if (raw !== lastRaw) {
    lastRaw = raw
    lastPrefs = parsePrefs(raw)
  }
  return lastPrefs
}

export function setPrefs(patch: Partial<CreatePrefs>) {
  const next = { ...getPrefs(), ...patch }
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* ignore: the choice just won't be remembered */
  }
  listeners.forEach((l) => l())
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}

export const useCreatePrefs = (): CreatePrefs => useSyncExternalStore(subscribe, getPrefs)
