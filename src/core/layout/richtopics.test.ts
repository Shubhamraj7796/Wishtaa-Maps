import { describe, expect, it } from 'vitest'
import { addChild, setImage } from '../model/commands'
import { patchTask, setImagePosition, setInlineNote, setLatex, setNote, setTable, addTag, toggleMarkOn } from '../model/content'
import { createMapDoc, ensureRoot, snapshotTopics, type MapDoc } from '../model/doc'
import { computeNumbers } from '../numbering'
import { LAYOUTS } from './catalog'
import { buildScene, measureTopic, type Scene, type SceneOptions } from './engine'

const NONE = new Set<string>()
const scene = (doc: MapDoc, root: string, over: Partial<SceneOptions> = {}): Scene =>
  buildScene(snapshotTopics(doc), { rootId: root, maxDepth: null, focusId: null, reveal: NONE, layout: 'mindmap:right', ...over })

function overlapping(s: Scene) {
  const b = [...s.boxes.values()]
  let n = 0
  for (let i = 0; i < b.length; i++)
    for (let j = i + 1; j < b.length; j++) {
      const p = b[i]!
      const q = b[j]!
      if (p.x + 0.5 < q.x + q.w && q.x + 0.5 < p.x + p.w && p.y + 0.5 < q.y + q.h && q.y + 0.5 < p.y + p.h) n++
    }
  return n
}

const make = () => {
  const doc = createMapDoc()
  const root = ensureRoot(doc)
  const a = addChild(doc, root, 'Alpha')
  addChild(doc, root, 'Beta')
  return { doc, root, a }
}
const topicOf = (doc: MapDoc, id: string) => doc.topics.get(id)!

describe('topic size grows with what it holds', () => {
  it('marks, numbers, notes, formulas, tables and badges each add room', () => {
    const { doc, a } = make()
    const base = measureTopic(topicOf(doc, a), 1)
    toggleMarkOn(doc, [a], 'p:1')
    toggleMarkOn(doc, [a], 'e:🔥')
    const marked = measureTopic(topicOf(doc, a), 1)
    expect(marked.w).toBeGreaterThan(base.w)
    expect(measureTopic(topicOf(doc, a), 1, 'rounded', '1.2.3 ').w).toBeGreaterThanOrEqual(marked.w)

    const heights = [marked.h]
    setInlineNote(doc, a, 'a short remark')
    heights.push(measureTopic(topicOf(doc, a), 1).h)
    setLatex(doc, a, '\\int_0^1 x\\,dx')
    heights.push(measureTopic(topicOf(doc, a), 1).h)
    setTable(doc, a, [['a', 'b'], ['c', 'd'], ['e', 'f']])
    heights.push(measureTopic(topicOf(doc, a), 1).h)
    addTag(doc, [a], 'urgent')
    heights.push(measureTopic(topicOf(doc, a), 1).h)
    for (let i = 1; i < heights.length; i++) expect(heights[i]!, `step ${i}`).toBeGreaterThan(heights[i - 1]!)
    const withTable = measureTopic(topicOf(doc, a), 1)
    expect(withTable.w).toBeGreaterThanOrEqual(2 * 84)
  })

  it('a task due date and a note badge widen the badge row', () => {
    const { doc, a } = make()
    addTag(doc, [a], 'x')
    const one = measureTopic(topicOf(doc, a), 1).w
    patchTask(doc, a, { dueDate: '2026-12-01' })
    setNote(doc, a, '<p>has a note</p>')
    expect(measureTopic(topicOf(doc, a), 1).w).toBeGreaterThanOrEqual(one)
  })

  it('a plain topic keeps its original size', () => {
    const { doc, a } = make()
    expect(measureTopic(topicOf(doc, a), 1)).toEqual({ w: 75, h: 38 })
  })
})

describe('pictures in every position', () => {
  const dims = (pos: 'above' | 'below' | 'left' | 'right' | 'behind') => {
    const { doc, a } = make()
    setImage(doc, a, { imageId: 'i', width: 200, height: 120 })
    setImagePosition(doc, a, pos)
    return measureTopic(topicOf(doc, a), 1)
  }
  it('above/below stack the picture with the text; left/right put it beside; behind overlaps', () => {
    const above = dims('above')
    const below = dims('below')
    const left = dims('left')
    const right = dims('right')
    const behind = dims('behind')
    expect(above).toEqual(below)
    expect(above.h).toBe(20 + 120 + 6 + 22) // picture + text row
    expect(left).toEqual(right)
    expect(left.w).toBeGreaterThan(above.w) // side by side is wider...
    expect(left.h).toBeLessThan(above.h) // ...and shorter
    expect(behind.h).toBeLessThan(above.h)
    expect(behind.w).toBeLessThanOrEqual(above.w)
  })
})

describe('numbering', () => {
  it('numbers branches 1, 1.1, 1.1.1 in sibling order and ignores collapsing', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'A')
    const b = addChild(doc, root, 'B')
    const a1 = addChild(doc, a, 'a1')
    const a2 = addChild(doc, a, 'a2')
    const a21 = addChild(doc, a2, 'a21')
    const n = computeNumbers(snapshotTopics(doc), root)
    expect([n.get(a), n.get(b), n.get(a1), n.get(a2), n.get(a21)]).toEqual(['1', '2', '1.1', '1.2', '1.2.1'])
    expect(n.has(root)).toBe(false)
  })

  it('shows numbers in the scene and makes room for them', () => {
    const { doc, root, a } = make()
    const plain = scene(doc, root)
    const numbered = scene(doc, root, { numbering: true })
    expect(plain.numbers.size).toBe(0)
    expect(numbered.numbers.get(a)).toBe('1')
    expect(numbered.boxes.get(a)!.w).toBeGreaterThanOrEqual(plain.boxes.get(a)!.w)
  })

  it('keeps numbers of hidden topics stable', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    const a = addChild(doc, root, 'A')
    const b = addChild(doc, root, 'B')
    const hidden = scene(doc, root, { numbering: true, maxDepth: 0 })
    expect(hidden.boxes.has(a)).toBe(false)
    const shown = scene(doc, root, { numbering: true })
    expect(shown.numbers.get(b)).toBe('2')
  })
})

describe('rich topics in every layout', () => {
  it('never overlap when topics hold marks, notes, formulas, tables, tags and pictures', () => {
    const doc = createMapDoc()
    const root = ensureRoot(doc)
    for (let i = 0; i < 4; i++) {
      const b = addChild(doc, root, `Branch ${i}`)
      toggleMarkOn(doc, [b], `p:${i + 1}`)
      for (let j = 0; j < 3; j++) {
        const k = addChild(doc, b, `Child ${i}.${j}`)
        addTag(doc, [k], 'tag')
        if (j === 0) setInlineNote(doc, k, 'inline remark')
        if (j === 1) setLatex(doc, k, 'E = mc^2')
        if (j === 2) setTable(doc, k, [['a', 'b'], ['c', 'd']])
        if (i === 1 && j === 0) {
          setImage(doc, k, { imageId: 'i', width: 160, height: 100 })
          setImagePosition(doc, k, 'left')
        }
        if (i === 2 && j === 1) setImage(doc, k, { imageId: 'j', width: 180, height: 90 })
      }
    }
    for (const l of LAYOUTS) {
      const s = scene(doc, root, { layout: l.id, numbering: true })
      expect(overlapping(s), l.id).toBe(0)
    }
  })
})
