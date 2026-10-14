import type { Uuid } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function newId(): Uuid {
  return crypto.randomUUID()
}

export function isUuid(value: unknown): value is Uuid {
  return typeof value === 'string' && UUID_RE.test(value)
}
