import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { mergeMaps } from '../drive/merge'
import { buildFileIndex } from '../files/indexer'
import { parseOutline, toOutline } from '../io/outline'
import { searchTopics } from '../search'
import { addChild, setText } from './commands'
import { setNote } from './content'
import { createMapDoc, ensureRoot, snapshotNotes, snapshotTopics } from './doc'
import { itemCountsOf } from './itemCounts'
import { itemLines } from './itemLines'
import { addNote, deleteNote, legacyNoteId, noteCounts, notesOf, patchNote } from './notes'

const bytes = (d: ReturnType<typeof createMapDoc>) => Y.encodeStateAsUpdate(d.ydoc)
const load = (b: Uint8Array) => {
  const d = createMapDoc()
  Y.applyUpdate(d.ydoc, b)
  return d
}
function fresh() {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central')
  const kid = addChild(doc, root, 'Dose') as string
  return { doc, root, kid }
}

describe('several notes per topic', () => {
  it('the first note stays in topic.note and is listed first; the others follow in order', () => {
    const { doc, kid } = fresh()
    setNote(doc, kid, '<p>first</p>')
    const a = addNote(doc, kid, { title: 'Second' }, 100) as string
    const b = addNote(doc, kid, { title: 'Third' }, 200) as string
    const list = notesOf(snapshotTopics(doc), snapshotNotes(doc), kid)
    expect(list.map((n) => n.id)).toEqual([legacyNoteId(kid), a, b])
    expect(list[0]?.legacy).toBe(true)
    expect(list[1]?.createdAt).toBe(100)
  })

  it('an empty first note is not listed; counts include it only when it has text', () => {
    const { doc, kid } = fresh()
    expect(notesOf(snapshotTopics(doc), snapshotNotes(doc), kid)).toEqual([])
    addNote(doc, kid)
    expect(noteCounts(snapshotTopics(doc), snapshotNotes(doc))[kid]).toBe(1)
    setNote(doc, kid, '<p>x</p>')
    expect(itemCountsOf(snapshotTopics(doc), snapshotNotes(doc))[kid]).toEqual({ notes: 2, tasks: 0 })
  })

  it('editing moves the edited time only when something changed; deleting a note and emptying the first one', () => {
    const { doc, kid } = fresh()
    setNote(doc, kid, '<p>keep</p>')
    const id = addNote(doc, kid, {}, 1) as string
    patchNote(doc, id, { html: '<p>hi</p>' }, 50)
    patchNote(doc, id, { html: '<p>hi</p>' }, 99)
    expect(doc.notes.get(id)?.updatedAt).toBe(50)
    deleteNote(doc, id)
    expect(doc.notes.has(id)).toBe(false)
    deleteNote(doc, legacyNoteId(kid))
    expect(snapshotTopics(doc)[kid]?.note).toBe('')
  })

  it('a title is cleaned and clipped', () => {
    const { doc, kid } = fresh()
    const id = addNote(doc, kid, { title: `  a \n b ${'x'.repeat(200)}` }) as string
    const t = doc.notes.get(id)?.title ?? ''
    expect(t.startsWith('a b x')).toBe(true)
    expect(t.length).toBeLessThanOrEqual(80)
  })

  it('creating a note is one undo step', () => {
    const { doc, kid } = fresh()
    doc.undo.clear()
    const id = addNote(doc, kid) as string
    doc.undo.undo()
    expect(doc.notes.has(id)).toBe(false)
  })
})

describe('notes in a merge (two devices)', () => {
  it('different notes of one topic, written on two devices, are both kept', () => {
    const { doc, kid } = fresh()
    const n1 = addNote(doc, kid, { title: 'A' }, 1) as string
    const n2 = addNote(doc, kid, { title: 'B' }, 2) as string
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    patchNote(phone, n1, { html: '<p>from phone</p>' }, 10)
    patchNote(laptop, n2, { html: '<p>from laptop</p>' }, 11)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 20, remoteAt: 10 })
    const merged = snapshotNotes(load(r.content))
    expect(merged[n1]?.html).toBe('<p>from phone</p>')
    expect(merged[n2]?.html).toBe('<p>from laptop</p>')
    expect(r.conflicts).toEqual([])
  })

  it('a new note added on each device: both survive', () => {
    const { doc, kid } = fresh()
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    const a = addNote(phone, kid, { title: 'phone note' }) as string
    const b = addNote(laptop, kid, { title: 'laptop note' }) as string
    const merged = snapshotNotes(load(mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 2, remoteAt: 1 }).content))
    expect(Object.keys(merged).sort()).toEqual([a, b].sort())
  })

  it('the same note changed on both: the newer text is kept and the other is reported', () => {
    const { doc, kid } = fresh()
    const id = addNote(doc, kid, {}, 1) as string
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    patchNote(phone, id, { html: '<p>phone text</p>' }, 10)
    patchNote(laptop, id, { html: '<p>laptop text</p>' }, 11)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 20, remoteAt: 10 })
    expect(snapshotNotes(load(r.content))[id]?.html).toBe('<p>laptop text</p>')
    const c = r.conflicts.find((x) => x.map === 'notes' && x.field === 'html')
    expect(c?.lostValue).toBe('<p>phone text</p>')
    expect(c?.label).toContain('Note')
  })

  it('a note edited on one device is not lost when the other deleted it', () => {
    const { doc, kid } = fresh()
    const id = addNote(doc, kid, {}, 1) as string
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    deleteNote(phone, id)
    patchNote(laptop, id, { html: '<p>edited</p>' }, 5)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 9, remoteAt: 8 })
    expect(snapshotNotes(load(r.content))[id]?.html).toBe('<p>edited</p>')
  })
})

describe('notes in search, the file index and the outline', () => {
  it('search finds a topic by the title or the text of one of its other notes', () => {
    const { doc, kid } = fresh()
    addNote(doc, kid, { title: 'Storage', html: '<p>keep at 2-8 degrees</p>' })
    const topics = snapshotTopics(doc)
    const notes = snapshotNotes(doc)
    expect(searchTopics(topics, 'storage', notes)).toEqual([kid])
    expect(searchTopics(topics, 'degrees', notes)).toEqual([kid])
    expect(searchTopics(topics, 'degrees')).toEqual([])
  })

  it('the file index carries the other notes (so the Files notes list and search see them)', () => {
    const { doc, kid } = fresh()
    setNote(doc, kid, '<p>first</p>')
    addNote(doc, kid, { title: 'Second', html: '<p>more text</p>' })
    const idx = buildFileIndex('f', snapshotTopics(doc), snapshotNotes(doc))
    const note = idx.topics.find((t) => t.id === kid)?.note ?? ''
    expect(note).toContain('first')
    expect(note).toContain('Second: more text')
    expect(buildFileIndex('f', snapshotTopics(doc)).topics.find((t) => t.id === kid)?.note).toBe('first')
  })

  it('the outline export writes the notes under their topic and reading it back makes no topics of them', () => {
    const { doc, root, kid } = fresh()
    setText(doc, kid, 'Dose')
    setNote(doc, kid, '<p>first</p>')
    addNote(doc, kid, { title: 'Storage', html: '<p>cold</p>' })
    const topics = snapshotTopics(doc)
    const text = toOutline(topics, [root], (id) => itemLines(topics, snapshotNotes(doc), id))
    expect(text).toBe('Central\n\tDose\n\t\t[Note] first\n\t\t[Note] Storage: cold')
    const back = parseOutline(text)
    expect(back).toHaveLength(1)
    expect(back[0]?.children[0]?.text).toBe('Dose')
    expect(back[0]?.children[0]?.children).toEqual([])
    expect(toOutline(topics, [root])).toBe('Central\n\tDose')
  })
})
