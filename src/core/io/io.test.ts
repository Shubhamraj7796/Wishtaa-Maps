import { describe, expect, it } from 'vitest'
import { addChild, setText } from '../model/commands'
import { createMapDoc, ensureRoot, getRootId, snapshotTopics } from '../model/doc'
import { encodeDoc, loadInto } from '../persistence'
import { revealAncestors, searchTopics } from '../search'
import { outlineToBranches, parseOutline, toOutline } from './outline'

describe('outline', () => {
  it('parses tabs, spaces and bullets', () => {
    const out = parseOutline('Plan\n\t- Phase 1\n\t\tTask\n  * Phase 2\nSecond root\n')
    expect(out.map((n) => n.text)).toEqual(['Plan', 'Second root'])
    expect(out[0]?.children.map((n) => n.text)).toEqual(['Phase 1', 'Phase 2'])
    expect(out[0]?.children[0]?.children[0]?.text).toBe('Task')
  })

  it('ignores blank lines and keeps a single line as one node', () => {
    expect(parseOutline('\n\nhello\n\n')).toHaveLength(1)
    expect(outlineToBranches(parseOutline('x'))[0]?.data.text).toBe('x')
  })

  it('round-trips through toOutline', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    addChild(doc, addChild(doc, root, 'A'), 'a1')
    addChild(doc, root, 'B')
    const text = toOutline(snapshotTopics(doc), [root])
    const parsed = parseOutline(text)
    expect(parsed[0]?.text).toBe('Central Topic')
    expect(parsed[0]?.children.map((c) => c.text)).toEqual(['A', 'B'])
    expect(parsed[0]?.children[0]?.children[0]?.text).toBe('a1')
  })
})

describe('persistence', () => {
  it('saves and restores a document', () => {
    const a = createMapDoc()
    const root = ensureRoot(a)
    addChild(a, root, 'kept')
    const b = createMapDoc()
    expect(loadInto(b, encodeDoc(a))).toBe(true)
    expect(getRootId(b)).toBe(root)
    expect(Object.values(snapshotTopics(b)).map((t) => t.text).sort()).toEqual(['Central Topic', 'kept'])
  })

  it('rejects corrupt data without throwing', () => {
    const b = createMapDoc()
    expect(loadInto(b, '%%%not-base64%%%')).toBe(false)
    expect(loadInto(b, btoa('garbage-bytes'))).toBe(false)
  })
})

describe('search', () => {
  it('matches text and notes case-insensitively and lists ancestors to reveal', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'Alpha')
    const deep = addChild(doc, a, 'Needle here')
    setText(doc, addChild(doc, root, 'other'), 'other')
    const topics = snapshotTopics(doc)
    expect(searchTopics(topics, 'NEEDLE')).toEqual([deep])
    expect(revealAncestors(topics, [deep]).sort()).toEqual([a, root].sort())
    expect(searchTopics(topics, '   ')).toEqual([])
  })
})
