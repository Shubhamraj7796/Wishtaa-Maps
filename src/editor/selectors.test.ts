import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []
  })
}

/**
 * Zustand (v5) selectors must return stable values. A selector that builds a new array or object on
 * every call (`.map`, `.filter`, `{...}`) makes React re-render forever and blanks the page.
 */
describe('store selectors', () => {
  const risky = /useEditor\(\s*\(\w+\)\s*=>\s*[^)]*\.(map|filter|slice|sort|concat|flatMap)\(/
  const objectLiteral = /useEditor\(\s*\(\w+\)\s*=>\s*(\{|\[)/

  it('never build new arrays or objects inside useEditor(...)', () => {
    const offenders: string[] = []
    for (const f of files('src')) {
      if (f.endsWith('.test.ts')) continue
      const text = readFileSync(f, 'utf8')
      text.split('\n').forEach((line, i) => {
        if (risky.test(line) || objectLiteral.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
