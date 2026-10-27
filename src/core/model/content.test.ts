import { describe, expect, it } from 'vitest'
import { addChild, deleteTopics } from './commands'
import {
  MAX_ATTACHMENTS,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  addAttachment,
  addTag,
  cleanTag,
  clearMarks,
  normalizeTable,
  patchTask,
  removeAttachment,
  removeTag,
  setAllImageWidths,
  setImagePosition,
  setInlineNote,
  setLatex,
  setLink,
  setNote,
  setTable,
  toggleMarkOn,
} from './content'
import { createMapDoc, ensureRoot, snapshotObjects } from './doc'
import { setImage } from './commands'
import { addBoundary, addCallout, addRelationship, addSummary, deleteObject, updateObject } from './objectCommands'
import { OBJECT_COLLECTION, type ObjectKind } from './objects'

function setup() {
  const doc = createMapDoc()
  const root = ensureRoot(doc)
  const a = addChild(doc, root, 'A')
  const b = addChild(doc, root, 'B')
  const c = addChild(doc, root, 'C')
  const a1 = addChild(doc, a, 'a1')
  return { doc, root, a, b, c, a1 }
}

describe('marks on topics', () => {
  it('adds to all selected, removes when all have it, and undoes in one step', () => {
    const { doc, a, b } = setup()
    toggleMarkOn(doc, [a, b], 'e:🔥')
    expect(doc.topics.get(a)?.marks).toEqual(['e:🔥'])
    expect(doc.topics.get(b)?.marks).toEqual(['e:🔥'])
    toggleMarkOn(doc, [a, b], 'e:🔥')
    expect(doc.topics.get(a)?.marks).toEqual([])
    doc.undo.undo()
    expect(doc.topics.get(b)?.marks).toEqual(['e:🔥'])
  })
  it('replaces the priority, ignores junk and clears all', () => {
    const { doc, a } = setup()
    toggleMarkOn(doc, [a], 'p:1')
    toggleMarkOn(doc, [a], 'p:7')
    expect(doc.topics.get(a)?.marks).toEqual(['p:7'])
    toggleMarkOn(doc, [a], 'nonsense')
    expect(doc.topics.get(a)?.marks).toEqual(['p:7'])
    clearMarks(doc, [a])
    expect(doc.topics.get(a)?.marks).toEqual([])
  })
})

describe('tags, task, link, notes, formula, table', () => {
  it('cleans and de-duplicates tags', () => {
    const { doc, a } = setup()
    expect(cleanTag('  <b>urgent</b>\n ')).toBe('burgent/b')
    expect(addTag(doc, [a], '  urgent ')).toBe(true)
    addTag(doc, [a], 'urgent')
    expect(addTag(doc, [a], '   ')).toBe(false)
    expect(doc.topics.get(a)?.tags).toEqual(['urgent'])
    removeTag(doc, [a], 'urgent')
    expect(doc.topics.get(a)?.tags).toEqual([])
    expect(cleanTag('x'.repeat(100)).length).toBe(30)
  })

  it('patches a task and drops empty fields', () => {
    const { doc, a } = setup()
    patchTask(doc, a, { dueDate: '2026-12-01', assignee: 'Asha' })
    expect(doc.topics.get(a)?.task).toEqual({ done: false, dueDate: '2026-12-01', assignee: 'Asha' })
    patchTask(doc, a, { done: true, assignee: '' })
    expect(doc.topics.get(a)?.task).toEqual({ done: true, dueDate: '2026-12-01' })
  })

  it('stores links, notes, inline notes, formulas', () => {
    const { doc, a } = setup()
    setLink(doc, a, 'https://example.com/')
    setNote(doc, a, '<p>hello</p>')
    setInlineNote(doc, a, '  short   note  ')
    setLatex(doc, a, '  x^2 + y^2 = z^2 ')
    expect(doc.topics.get(a)).toMatchObject({ link: 'https://example.com/', note: '<p>hello</p>', inlineNote: 'short note', latex: 'x^2 + y^2 = z^2' })
    setLatex(doc, a, '   ')
    expect(doc.topics.get(a)?.latex).toBeNull()
    setLink(doc, a, null)
    expect(doc.topics.get(a)?.link).toBeNull()
  })

  it('keeps tables a sensible size and rectangular', () => {
    expect(normalizeTable(null)).toBeNull()
    expect(normalizeTable([])).toBeNull()
    expect(normalizeTable([['a'], ['b', 'c']])).toEqual([['a', ''], ['b', 'c']])
    const big = Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => 'x'.repeat(200)))
    const t = normalizeTable(big) as string[][]
    expect(t).toHaveLength(MAX_TABLE_ROWS)
    expect(t[0]).toHaveLength(MAX_TABLE_COLS)
    expect(t[0]?.[0]?.length).toBe(80)
    const { doc, a } = setup()
    setTable(doc, a, [['1', '2']])
    expect(doc.topics.get(a)?.table).toEqual([['1', '2']])
  })

  it('limits attachments', () => {
    const { doc, a } = setup()
    for (let i = 0; i < MAX_ATTACHMENTS; i++) expect(addAttachment(doc, a, { id: `f${i}`, name: 'x.pdf', size: 1, type: 'application/pdf' })).toBe(true)
    expect(addAttachment(doc, a, { id: 'extra', name: 'y', size: 1, type: 'x' })).toBe(false)
    removeAttachment(doc, a, 'f0')
    expect(doc.topics.get(a)?.attachments).toHaveLength(MAX_ATTACHMENTS - 1)
  })
})

describe('pictures', () => {
  it('sets a position and applies one width to every picture', () => {
    const { doc, a, b } = setup()
    setImage(doc, a, { imageId: 'i1', width: 200, height: 100 })
    setImage(doc, b, { imageId: 'i2', width: 100, height: 200 })
    setImagePosition(doc, a, 'left')
    expect(doc.topics.get(a)?.image?.position).toBe('left')
    setAllImageWidths(doc, 300)
    expect(doc.topics.get(a)?.image).toMatchObject({ width: 300, height: 150, position: 'left' })
    expect(doc.topics.get(b)?.image).toMatchObject({ width: 300, height: 600 })
    doc.undo.undo()
    expect(doc.topics.get(b)?.image).toMatchObject({ width: 100, height: 200 })
    setAllImageWidths(doc, 99999)
    expect(doc.topics.get(a)?.image?.width).toBe(1200)
  })
})

describe('diagram objects', () => {
  it('knows which collection holds each kind (not just "kind + s")', () => {
    const { doc, a, b } = setup()
    const ids: Record<ObjectKind, string> = {
      relationship: addRelationship(doc, a, b) as string,
      callout: addCallout(doc, a) as string,
      boundary: addBoundary(doc, [a]) as string,
      summary: addSummary(doc, [a, b]) as string,
    }
    const o = snapshotObjects(doc)
    for (const kind of Object.keys(ids) as ObjectKind[]) {
      expect(o[OBJECT_COLLECTION[kind]][ids[kind]], kind).toBeTruthy()
    }
    expect(OBJECT_COLLECTION.boundary).toBe('boundaries')
    expect(OBJECT_COLLECTION.summary).toBe('summaries')
  })

  it('creates, edits and deletes each kind', () => {
    const { doc, a, b, c } = setup()
    const rel = addRelationship(doc, a, b) as string
    expect(addRelationship(doc, a, a)).toBeNull()
    expect(addRelationship(doc, a, 'ghost')).toBeNull()
    expect(addRelationship(doc, a, b)).toBe(rel) // same pair again: no duplicate
    updateObject(doc, 'relationship', rel, { label: 'depends on', arrows: 'both' })
    const call = addCallout(doc, a, 'remember this') as string
    const bound = addBoundary(doc, [a, b]) as string
    const sum = addSummary(doc, [a, c]) as string
    const o = snapshotObjects(doc)
    expect(o.relationships[rel]).toMatchObject({ label: 'depends on', arrows: 'both' })
    expect(o.callouts[call]?.text).toBe('remember this')
    expect(o.boundaries[bound]?.topicIds).toEqual([a, b])
    expect(o.summaries[sum]?.topicIds).toEqual([a, b, c]) // spans the siblings between the first and last
    deleteObject(doc, 'relationship', rel)
    expect(snapshotObjects(doc).relationships[rel]).toBeUndefined()
    doc.undo.undo()
    expect(snapshotObjects(doc).relationships[rel]?.label).toBe('depends on')
  })

  it('summaries need siblings under one parent', () => {
    const { doc, root, a, a1 } = setup()
    expect(addSummary(doc, [a, a1])).toBeNull()
    expect(addSummary(doc, [root])).toBeNull()
    expect(addSummary(doc, [])).toBeNull()
  })

  it('boundaries fold nested selections and ignore unknown topics', () => {
    const { doc, a, a1 } = setup()
    const id = addBoundary(doc, [a, a1, 'ghost']) as string
    expect(snapshotObjects(doc).boundaries[id]?.topicIds).toEqual([a])
    expect(addBoundary(doc, ['ghost'])).toBeNull()
  })

  it('removes or trims objects when their topics are deleted, and undo brings them back', () => {
    const { doc, a, b, c } = setup()
    const rel = addRelationship(doc, a, b) as string
    const call = addCallout(doc, a, 'x') as string
    const bound = addBoundary(doc, [a, b]) as string
    const sum = addSummary(doc, [a, b, c]) as string
    deleteTopics(doc, [a])
    const o = snapshotObjects(doc)
    expect(o.relationships[rel]).toBeUndefined()
    expect(o.callouts[call]).toBeUndefined()
    expect(o.boundaries[bound]?.topicIds).toEqual([b])
    expect(o.summaries[sum]?.topicIds).toEqual([b, c])
    deleteTopics(doc, [b, c])
    expect(snapshotObjects(doc).boundaries[bound]).toBeUndefined()
    expect(snapshotObjects(doc).summaries[sum]).toBeUndefined()
    doc.undo.undo() // undo deleting b and c
    expect(snapshotObjects(doc).boundaries[bound]?.topicIds).toEqual([b])
    expect(snapshotObjects(doc).summaries[sum]?.topicIds).toEqual([b, c])
    expect(snapshotObjects(doc).relationships[rel]).toBeUndefined() // still gone with `a`
    doc.undo.undo() // undo deleting a
    const back = snapshotObjects(doc)
    expect(back.relationships[rel]).toBeTruthy()
    expect(back.callouts[call]).toBeTruthy()
    expect(back.boundaries[bound]?.topicIds).toEqual([a, b])
    expect(back.summaries[sum]?.topicIds).toEqual([a, b, c])
  })

  it('stacks several callouts on one topic without covering each other', () => {
    const { doc, a } = setup()
    const c1 = addCallout(doc, a) as string
    const c2 = addCallout(doc, a) as string
    const o = snapshotObjects(doc)
    expect(o.callouts[c1]?.dy).not.toBe(o.callouts[c2]?.dy)
  })
})
