import * as Y from 'yjs'
import { describe, expect, it } from 'vitest'
import { mergeMaps } from '../drive/merge'
import { buildFileIndex } from '../files/indexer'
import { parseOutline, toOutline } from '../io/outline'
import { searchTopics } from '../search'
import { addChild } from './commands'
import { patchTask } from './content'
import { createMapDoc, ensureRoot, snapshotTasks, snapshotTopics } from './doc'
import { itemCountsOf } from './itemCounts'
import { itemLines } from './itemLines'
import { addTask, allTasks, deleteTaskEntry, legacyTaskId, patchTaskEntry, taskEntry, taskLine, tasksOfTopic, toggleTaskEntry, topicPath } from './tasks'

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
