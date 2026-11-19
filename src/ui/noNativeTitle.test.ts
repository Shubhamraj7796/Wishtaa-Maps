import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Rule 8 (Icons first): the name or hint of a control is shown by the ONE shared tooltip (TipButton, IconButton, <Tooltip>), never by the
 * browser's native `title`. This scans every component for a `title` attribute on a plain HTML element. (A `title` prop on one of OUR
 * components, for example Modal, and an iframe's title for screen readers are not tooltips and are fine.)
 */
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((f) => {
    const p = join(dir, f.name)
    if (f.isDirectory()) return files(p)
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : []
  })
}

describe('no native title tooltips', () => {
  it('no plain HTML element in src carries a title attribute (except iframe)', () => {
    const bad: string[] = []
    for (const file of files('src')) {
      const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (n: ts.Node) => {
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
          const tag = n.tagName.getText()
          const hasTitle = n.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === 'title')
          if (hasTitle && /^[a-z]/.test(tag) && tag !== 'iframe') bad.push(`${file.replace(/\\/g, '/')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} <${tag} title>`)
        }
        ts.forEachChild(n, visit)
      }
      visit(sf)
    }
    expect(bad).toEqual([])
  })
})
