import { describe, expect, it } from 'vitest'
import { addChild, setCollapsed } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import { buildScene, type Scene } from './mindmap'

const NONE = new Set<string>()
const scene = (doc: ReturnType<typeof createMapDoc>, root: string, over: Partial<Parameters<typeof buildScene>[1]> = {}) =>
  buildScene(snapshotTopics(doc), { rootId: root, maxDepth: null, focusId: null, reveal: NONE, ...over })

function overlaps(s: Scene): boolean {
  const b = [...s.boxes.values()]
  for (let i = 0; i < b.length; i++) {
    for (let j = i + 1; j < b.length; j++) {
      const p = b[i]!
      const q = b[j]!
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) return true
    }
  }
  return false
}

describe('mind map layout', () => {
  it('centres the root and balances branches on both sides', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    for (let i = 0; i < 6; i++) addChild(doc, root, `b${i}`)
    const s = scene(doc, root)
    const sides = [...s.boxes.values()].filter((b) => b.depth === 1).map((b) => b.side)
    expect(sides.filter((x) => x === 'right')).toHaveLength(3)
    expect(sides.filter((x) => x === 'left')).toHaveLength(3)
    const r = s.boxes.get(root)!
    expect(r.x + r.w / 2).toBeCloseTo(0)
  })

  it('places children outward of their parent without overlaps', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    for (let i = 0; i < 4; i++) {
      const b = addChild(doc, root, `branch ${i}`)
      for (let j = 0; j < 5; j++) {
        const c = addChild(doc, b, `child ${i}.${j}`)
        addChild(doc, c, 'leaf')
      }
    }
    const s = scene(doc, root)
    for (const e of s.edges) {
      const p = s.boxes.get(e.from)!
      const c = s.boxes.get(e.to)!
      if (c.side === 'right') expect(c.x).toBeGreaterThan(p.x + p.w)
      else expect(c.x + c.w).toBeLessThan(p.x)
    }
    expect(overlaps(s)).toBe(false)
  })

  it('is deterministic', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    addChild(doc, addChild(doc, root, 'a'), 'b')
    const a = scene(doc, root)
    const b = scene(doc, root)
    expect([...a.boxes.values()]).toEqual([...b.boxes.values()])
  })

  it('hides collapsed branches and reports the hidden count', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'a')
    const a1 = addChild(doc, a, 'a1')
    addChild(doc, a1, 'a2')
    setCollapsed(doc, [a], true)
    const s = scene(doc, root)
    expect(s.boxes.has(a1)).toBe(false)
    expect(s.hidden.get(a)).toBe(2)
    expect(scene(doc, root, { reveal: new Set([a]) }).boxes.has(a1)).toBe(true)
  })

  it('limits depth and supports focus mode', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'a')
    const a1 = addChild(doc, a, 'a1')
    addChild(doc, a1, 'a2')
    expect(scene(doc, root, { maxDepth: 1 }).boxes.size).toBe(2)
    const focus = scene(doc, root, { focusId: a })
    expect(focus.rootId).toBe(a)
    expect(focus.boxes.size).toBe(3)
  })

  it('lays out 2,000 topics quickly', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    doc.ydoc.transact(() => {
      for (let i = 0; i < 23; i++) {
        const b = addChild(doc, root, `branch ${i}`)
        for (let j = 0; j < 9; j++) {
          const c = addChild(doc, b, `child ${i}.${j}`)
          for (let k = 0; k < 9; k++) addChild(doc, c, `leaf ${k}`)
        }
      }
    })
    const topics = snapshotTopics(doc)
    expect(Object.keys(topics).length).toBeGreaterThan(2000)
    const t0 = performance.now()
    const s = buildScene(topics, { rootId: root, maxDepth: null, focusId: null, reveal: NONE })
    expect(performance.now() - t0).toBeLessThan(300)
    expect(s.boxes.size).toBe(Object.keys(topics).length)
  })
})
