import { describe, expect, it } from 'vitest'
import { addChild } from '../core/model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../core/model/doc'
import { modeFor, resolveDrop } from './outlineDrop'

/** root > A (open, with A1, A2), B, C > C1 */
function tree() {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Root')
  const A = addChild(doc, root, 'A')
  const A1 = addChild(doc, A, 'A1')
  const A2 = addChild(doc, A, 'A2')
  const B = addChild(doc, root, 'B')
  const C = addChild(doc, root, 'C')
  const C1 = addChild(doc, C, 'C1')
  return { doc, root, A, A1, A2, B, C, C1, topics: snapshotTopics(doc) }
}

describe('where the pointer is over a row', () => {
  it('upper half is before, lower half is after, far to the right is a sub-topic', () => {
    expect(modeFor(3, 30, 0)).toBe('before')
    expect(modeFor(20, 30, 0)).toBe('after')
    expect(modeFor(3, 30, 80)).toBe('child')
    expect(modeFor(20, 30, 49)).toBe('child')
    expect(modeFor(20, 30, 48)).toBe('after')
  })
})

describe('where a dropped topic lands', () => {
  it('before a topic: its sibling, in front of it', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.C, t.A, 'before')).toEqual({ parentId: t.root, index: 0 })
    expect(resolveDrop(t.topics, t.root, t.C, t.B, 'before')).toEqual({ parentId: t.root, index: 1 })
  })

  it('after a topic: its sibling, behind it (the dragged topic is not counted among the siblings)', () => {
    const t = tree()
    // with A taken out, the root has B and C: after B is position 1
    expect(resolveDrop(t.topics, t.root, t.A, t.B, 'after')).toEqual({ parentId: t.root, index: 1 })
    // C is open and has a sub-topic, so "after C" is its first sub-topic; folded, it is position 2
    expect(resolveDrop(t.topics, t.root, t.A, t.C, 'after')).toEqual({ parentId: t.C, index: 0 })
    const folded = { ...t.topics, [t.C]: { ...(t.topics[t.C] as object), collapsed: true } } as typeof t.topics
    expect(resolveDrop(folded, t.root, t.A, t.C, 'after')).toEqual({ parentId: t.root, index: 2 })
  })

  it('across levels: a topic dropped next to a deeper topic joins that level', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.B, t.A2, 'after')).toEqual({ parentId: t.A, index: 2 })
    expect(resolveDrop(t.topics, t.root, t.B, t.A1, 'before')).toEqual({ parentId: t.A, index: 0 })
  })

  it('below an open topic that has sub-topics it becomes its first sub-topic (that is where the row would appear)', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.B, t.A, 'after')).toEqual({ parentId: t.A, index: 0 })
  })

  it('below a folded topic it goes after it, as a sibling', () => {
    const t = tree()
    const folded = { ...t.topics, [t.A]: { ...(t.topics[t.A] as object), collapsed: true } } as typeof t.topics
    expect(resolveDrop(folded, t.root, t.C, t.A, 'after')).toEqual({ parentId: t.root, index: 1 })
  })

  it('"child" makes it the first sub-topic', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.B, t.C, 'child')).toEqual({ parentId: t.C, index: 0 })
  })

  it('the central topic has no siblings, so anything dropped on it becomes its first sub-topic', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.C1, t.root, 'before')).toEqual({ parentId: t.root, index: 0 })
    expect(resolveDrop(t.topics, t.root, t.C1, t.root, 'after')).toEqual({ parentId: t.root, index: 0 })
  })

  it('refuses what makes no sense: onto itself, into its own branch, the central topic, a missing topic', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.A, t.A, 'before')).toBeNull()
    expect(resolveDrop(t.topics, t.root, t.A, t.A1, 'child')).toBeNull()
    expect(resolveDrop(t.topics, t.root, t.A, t.A2, 'after')).toBeNull()
    expect(resolveDrop(t.topics, t.root, t.root, t.A, 'before')).toBeNull()
    expect(resolveDrop(t.topics, t.root, 'nope', t.A, 'before')).toBeNull()
    expect(resolveDrop(t.topics, t.root, t.A, 'nope', 'before')).toBeNull()
  })

  it('putting it back where it already is does nothing (so no empty undo step)', () => {
    const t = tree()
    expect(resolveDrop(t.topics, t.root, t.B, t.C, 'before')).toBeNull() // B is already just before C
    expect(resolveDrop(t.topics, t.root, t.B, t.B, 'after')).toBeNull()
  })
})
