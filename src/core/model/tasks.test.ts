import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { mergeMaps } from '../drive/merge'
import { buildFileIndex } from '../files/indexer'
import { parseOutline, toOutline } from '../io/outline'
import { searchTopics } from '../search'
import { addChild } from './commands'
import { patchTask } from './content'
import { createMapDoc, ensureRoot, snapshotNotes, snapshotTasks, snapshotTopics } from './doc'
import { itemCountsOf } from './itemCounts'
import { itemLines } from './itemLines'
import { addNote, deleteNote, patchNote } from './notes'
import { addTask, allTasks, deleteTaskEntry, legacyTaskId, patchTaskEntry, taskEntry, taskLine, tasksOfNote, tasksOfTopic, toggleTaskEntry, topicPath, validTime } from './tasks'

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
const all = (d: ReturnType<typeof createMapDoc>) => allTasks(snapshotTopics(d), snapshotTasks(d))

describe('tasks of their own', () => {
  it('add, change, tick, delete (each one undo step), and the edited time moves only on a change', () => {
    const { doc, kid } = fresh()
    const id = addTask(doc, { topicId: kid, title: '  Order stock ', due: '2026-11-20', priority: 2 }, 100)
    expect(doc.tasks.get(id)).toMatchObject({ title: 'Order stock', due: '2026-11-20', priority: 2, status: 'todo', topicId: kid, createdAt: 100 })
    patchTaskEntry(doc, id, { status: 'doing' }, 200)
    patchTaskEntry(doc, id, { status: 'doing' }, 300)
    expect(doc.tasks.get(id)?.updatedAt).toBe(200)
    toggleTaskEntry(doc, taskEntry(snapshotTopics(doc), snapshotTasks(doc), id)!, 400)
    expect(doc.tasks.get(id)?.status).toBe('done')
    toggleTaskEntry(doc, taskEntry(snapshotTopics(doc), snapshotTasks(doc), id)!, 500)
    expect(doc.tasks.get(id)?.status).toBe('todo')
    patchTaskEntry(doc, id, { due: null, priority: null })
    expect(doc.tasks.get(id)?.due).toBeUndefined()
    expect(doc.tasks.get(id)?.priority).toBeUndefined()
    deleteTaskEntry(doc, id)
    expect(doc.tasks.has(id)).toBe(false)
    doc.undo.undo()
    expect(doc.tasks.has(id)).toBe(true)
  })

  it('a bad date or priority is ignored; a missing topic means no topic', () => {
    const { doc } = fresh()
    const id = addTask(doc, { topicId: 'nope', title: 'x', due: '2026-13-45', priority: 9 })
    expect(doc.tasks.get(id)).toMatchObject({ topicId: null })
    expect(doc.tasks.get(id)?.due).toBeUndefined()
    expect(doc.tasks.get(id)?.priority).toBeUndefined()
  })
})

describe('a topic that is a task (the older flag) is listed too, and stays readable by older versions', () => {
  it('shows with the topic text as title, and its status follows the done flag', () => {
    const { doc, kid } = fresh()
    patchTask(doc, kid, { done: false, dueDate: '2026-11-18', priority: 3 })
    const e = taskEntry(snapshotTopics(doc), snapshotTasks(doc), legacyTaskId(kid))!
    expect(e).toMatchObject({ legacy: true, title: 'Dose', due: '2026-11-18', priority: 3, status: 'todo', topicId: kid })
    patchTaskEntry(doc, e.id, { status: 'doing' })
    expect(snapshotTopics(doc)[kid]?.task).toMatchObject({ done: false, status: 'doing' })
    patchTaskEntry(doc, e.id, { status: 'done' })
    expect(snapshotTopics(doc)[kid]?.task).toEqual({ done: true, dueDate: '2026-11-18', priority: 3 })
    expect(taskEntry(snapshotTopics(doc), snapshotTasks(doc), e.id)?.status).toBe('done')
    patchTaskEntry(doc, e.id, { status: 'todo' })
    expect(snapshotTopics(doc)[kid]?.task?.done).toBe(false)
    deleteTaskEntry(doc, e.id)
    expect(snapshotTopics(doc)[kid]?.task).toBeNull()
    expect(snapshotTopics(doc)[kid]?.text).toBe('Dose')
  })

  it('both kinds appear in one list; a topic lists its flag first', () => {
    const { doc, kid } = fresh()
    addTask(doc, { topicId: kid, title: 'Own' })
    patchTask(doc, kid, { done: false })
    expect(all(doc)).toHaveLength(2)
    expect(tasksOfTopic(snapshotTopics(doc), snapshotTasks(doc), kid).map((x) => x.legacy)).toEqual([true, false])
    expect(itemCountsOf(snapshotTopics(doc), {}, snapshotTasks(doc))[kid]).toEqual({ notes: 0, tasks: 1 })
  })

  it('a path reads from the central topic down', () => {
    const { doc, kid } = fresh()
    expect(topicPath(snapshotTopics(doc), kid)).toBe('Central › Dose')
  })
})

describe('tasks in a merge (two devices)', () => {
  it('completing a task on one device while the other edits its title keeps both', () => {
    const { doc, kid } = fresh()
    const id = addTask(doc, { topicId: kid, title: 'Order' }, 1)
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    patchTaskEntry(phone, id, { status: 'done' }, 10)
    patchTaskEntry(laptop, id, { title: 'Order cold stock' }, 11)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 20, remoteAt: 10 })
    const merged = snapshotTasks(load(r.content))[id]
    expect(merged).toMatchObject({ status: 'done', title: 'Order cold stock' })
    expect(r.conflicts).toEqual([])
  })

  it('the same field changed on both: the newer wins and the other is reported', () => {
    const { doc, kid } = fresh()
    const id = addTask(doc, { topicId: kid, title: 'Order', due: '2026-11-20' }, 1)
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    patchTaskEntry(phone, id, { due: '2026-11-25' }, 10)
    patchTaskEntry(laptop, id, { due: '2026-11-30' }, 11)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 20, remoteAt: 10 })
    expect(snapshotTasks(load(r.content))[id]?.due).toBe('2026-11-30')
    const c = r.conflicts.find((x) => x.map === 'tasks' && x.field === 'due')
    expect(c?.lostValue).toBe('2026-11-25')
    expect(c?.label).toContain('Task')
  })

  it('a task added on each device: both survive; one edited on a device survives a delete on the other', () => {
    const { doc, kid } = fresh()
    const keep = addTask(doc, { topicId: kid, title: 'Keep' }, 1)
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    const a = addTask(phone, { title: 'phone task' })
    const b = addTask(laptop, { title: 'laptop task' })
    deleteTaskEntry(phone, keep)
    patchTaskEntry(laptop, keep, { title: 'Keep edited' }, 5)
    const merged = snapshotTasks(load(mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 9, remoteAt: 8 }).content))
    expect(Object.keys(merged).sort()).toEqual([a, b, keep].sort())
    expect(merged[keep]?.title).toBe('Keep edited')
  })
})

describe('tasks in search, the file index and the outline', () => {
  it('search finds the topic of a task by its title or details', () => {
    const { doc, kid } = fresh()
    addTask(doc, { topicId: kid, title: 'Call supplier', details: 'about batch 42' })
    const topics = snapshotTopics(doc)
    expect(searchTopics(topics, 'supplier', {}, snapshotTasks(doc))).toEqual([kid])
    expect(searchTopics(topics, 'batch 42', {}, snapshotTasks(doc))).toEqual([kid])
    expect(searchTopics(topics, 'supplier')).toEqual([])
  })

  it('the file index carries the tasks on a topic', () => {
    const { doc, kid } = fresh()
    addTask(doc, { topicId: kid, title: 'Call supplier' })
    const note = buildFileIndex('f', snapshotTopics(doc), {}, snapshotTasks(doc)).topics.find((t) => t.id === kid)?.note
    expect(note).toContain('Task: Call supplier')
  })

  it('the outline export lists tasks under their topic (status, date, priority) and reads back as no topics', () => {
    const { doc, root, kid } = fresh()
    addTask(doc, { topicId: kid, title: 'Call supplier', due: '2026-11-20', priority: 2, status: 'doing' }, 1)
    patchTask(doc, kid, { done: true })
    const topics = snapshotTopics(doc)
    const tasks = snapshotTasks(doc)
    const text = toOutline(topics, [root], (id) => itemLines(topics, {}, id, tasks))
    expect(text).toBe('Central\n\tDose\n\t\t[Task] [x] Dose\n\t\t[Task] [~] Call supplier (due 2026-11-20, doing, priority 2)')
    expect(parseOutline(text)[0]?.children[0]?.children).toEqual([])
    expect(taskLine({ title: 'A', status: 'todo', details: 'x  y' })).toBe('[Task] [ ] A: x y')
  })
})

describe('a time of day and a link to a note', () => {
  it('accepts only HH:MM, only with a date, and old tasks stay all day', () => {
    expect(['00:00', '09:05', '23:59'].every(validTime)).toBe(true)
    expect(['24:00', '9:05', '12:60', '', 'noon', null].some(validTime)).toBe(false)
    const { doc, kid } = fresh()
    const old = addTask(doc, { topicId: kid, title: 'Old', due: '2026-11-14' }, 1)
    expect(taskEntry(snapshotTopics(doc), snapshotTasks(doc), old)?.time).toBeUndefined()
    const id = addTask(doc, { topicId: kid, title: 'Call', due: '2026-11-14', time: '17:00' }, 1)
    expect(snapshotTasks(doc)[id]?.time).toBe('17:00')
    patchTaskEntry(doc, id, { time: '25:00' }, 2)
    expect(snapshotTasks(doc)[id]?.time).toBeUndefined()
    patchTaskEntry(doc, id, { time: '08:30' }, 3)
    expect(snapshotTasks(doc)[id]?.time).toBe('08:30')
    // Clearing the date clears the time; a time with no date is not stored.
    patchTaskEntry(doc, id, { due: null }, 4)
    expect(snapshotTasks(doc)[id]?.time).toBeUndefined()
    const nodate = addTask(doc, { title: 'x', time: '10:00' })
    expect(snapshotTasks(doc)[nodate]?.time).toBeUndefined()
  })

  it('a task is linked to a note by noteId only; the note itself gets nothing', () => {
    const { doc, kid } = fresh()
    const n = addNote(doc, kid, { title: 'Meeting' }, 1) as string
    const before = JSON.stringify(snapshotNotes(doc))
    const t = addTask(doc, { topicId: kid, title: 'Follow up', noteId: n }, 2)
    expect(JSON.stringify(snapshotNotes(doc))).toBe(before)
    expect(tasksOfNote(snapshotTasks(doc), n).map((x) => x.id)).toEqual([t])
    patchTaskEntry(doc, t, { noteId: null }, 3)
    expect(tasksOfNote(snapshotTasks(doc), n)).toEqual([])
  })

  it('deleting a note keeps its task; the link is then dangling and harmless', () => {
    const { doc, kid } = fresh()
    const n = addNote(doc, kid, { title: 'Meeting' }, 1) as string
    const t = addTask(doc, { topicId: kid, title: 'Follow up', due: '2026-11-14', noteId: n }, 2)
    deleteNote(doc, n)
    expect(snapshotNotes(doc)[n]).toBeUndefined()
    expect(snapshotTasks(doc)[t]).toMatchObject({ title: 'Follow up', noteId: n })
  })

  it('two devices: one edits the note text while the other changes the task time, both are kept', () => {
    const { doc, kid } = fresh()
    const n = addNote(doc, kid, { title: 'Meeting', html: '<p>a</p>' }, 1) as string
    const t = addTask(doc, { topicId: kid, title: 'Call', due: '2026-11-14', time: '17:00', noteId: n }, 1)
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    patchNote(phone, n, { html: '<p>agenda changed</p>' }, 10)
    patchTaskEntry(laptop, t, { time: '18:30' }, 11)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 20, remoteAt: 10 })
    const m = load(r.content)
    expect(snapshotNotes(m)[n]?.html).toBe('<p>agenda changed</p>')
    expect(snapshotTasks(m)[t]).toMatchObject({ time: '18:30', noteId: n, due: '2026-11-14' })
    expect(r.conflicts).toEqual([])
  })

  it('two devices change the time of the same task: the newer wins and the other is reported', () => {
    const { doc, kid } = fresh()
    const t = addTask(doc, { topicId: kid, title: 'Call', due: '2026-11-14', time: '17:00' }, 1)
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    patchTaskEntry(phone, t, { time: '19:00' }, 10)
    patchTaskEntry(laptop, t, { time: '20:00' }, 11)
    const r = mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 20, remoteAt: 10 })
    expect(snapshotTasks(load(r.content))[t]?.time).toBe('20:00')
    expect(r.conflicts.find((x) => x.map === 'tasks' && x.field === 'time')?.lostValue).toBe('19:00')
  })

  it('one device deletes the note while the other edits its task: the task survives with the edit', () => {
    const { doc, kid } = fresh()
    const n = addNote(doc, kid, { title: 'Meeting' }, 1) as string
    const t = addTask(doc, { topicId: kid, title: 'Call', noteId: n }, 1)
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    deleteNote(phone, n)
    patchTaskEntry(laptop, t, { title: 'Call back' }, 5)
    const m = load(mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 9, remoteAt: 8 }).content)
    expect(snapshotNotes(m)[n]).toBeUndefined()
    expect(snapshotTasks(m)[t]?.title).toBe('Call back')
  })

  it('two devices each add a task to the same note: both are kept, oldest first', () => {
    const { doc, kid } = fresh()
    const n = addNote(doc, kid, { title: 'Meeting' }, 1) as string
    const base = bytes(doc)
    const phone = load(base)
    const laptop = load(base)
    const a = addTask(phone, { title: 'phone', noteId: n }, 100)
    const b = addTask(laptop, { title: 'laptop', noteId: n }, 200)
    const m = load(mergeMaps(base, bytes(laptop), bytes(phone), { localAt: 9, remoteAt: 8 }).content)
    expect(tasksOfNote(snapshotTasks(m), n).map((x) => x.id)).toEqual([a, b])
  })

  it('the outline line carries the time', () => {
    expect(taskLine({ title: 'Call', due: '2026-11-14', time: '17:00', status: 'todo', details: '' })).toBe('[Task] [ ] Call (due 2026-11-14 17:00)')
  })
})
