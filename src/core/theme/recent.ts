import { isHex } from './color'

const KEY = 'wishtaamaps:recent-colours'
const MAX = 8

/** The colours a person picked lately, newest first. Kept in this browser only; never throws where storage is blocked. */
export function recentColours(storage: Pick<Storage, 'getItem'> | null = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(KEY)
    const list: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter(isHex).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function rememberColour(hex: string, storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): string[] {
  if (!isHex(hex)) return recentColours(storage)
  const next = [hex.toLowerCase(), ...recentColours(storage).filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, MAX)
  try {
    storage?.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full or blocked: the list just isn't kept */
  }
  return next
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
