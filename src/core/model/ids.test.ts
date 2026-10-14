import { describe, expect, it } from 'vitest'
import { isUuid, newId } from './ids'

describe('ids', () => {
  it('generates valid, unique ids', () => {
    const a = newId()
    const b = newId()
    expect(isUuid(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('rejects non-uuids', () => {
    expect(isUuid('nope')).toBe(false)
    expect(isUuid(42)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})
