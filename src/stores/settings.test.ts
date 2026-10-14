import { describe, expect, it } from 'vitest'
import { readSavedTheme } from './settings'

const store = (value: string | null) => ({ getItem: () => value })

describe('readSavedTheme', () => {
  it('defaults to light', () => {
    expect(readSavedTheme(undefined)).toBe('light')
    expect(readSavedTheme(store(null))).toBe('light')
  })
  it('reads a saved dark theme', () => {
    expect(readSavedTheme(store('{"theme":"dark"}'))).toBe('dark')
  })
  it('survives corrupt or hostile values', () => {
    expect(readSavedTheme(store('{oops'))).toBe('light')
    expect(readSavedTheme(store('{"theme":"<script>"}'))).toBe('light')
  })
})
