import { vi } from 'vitest'

/** A simple stand-in for localStorage, so tests behave the same on every Node version. */
export function installMemoryLocalStorage(): Storage {
  const data = new Map<string, string>()
  const storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  } satisfies Storage
  vi.stubGlobal('localStorage', storage)
  return storage
}
