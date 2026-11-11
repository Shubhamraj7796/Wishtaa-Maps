import { describe, expect, it } from 'vitest'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTasks, snapshotTopics } from '../model/doc'
import { addTask, allTasks, type TaskEntry } from '../model/tasks'
import { addDays, agendaGroups, defaultFilters, endOfWeek, filterTasks, filtersActive, groupOf, ymd } from './agenda'

// Wednesday 2026-11-11: tomorrow is Thursday, the week ends on Sunday 2026-11-15.
const TODAY = '2026-11-11'
const e = (over: Partial<TaskEntry>): TaskEntry => ({ id: 'x', topicId: null, title: 't', details: '', status: 'todo', legacy: false, createdAt: 1, updatedAt: 1, order: 0, ...over })

describe('dates', () => {
  it('adds days across a month end and finds the Sunday that ends the week', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(endOfWeek('2026-11-11')).toBe('2026-11-15')
    expect(endOfWeek('2026-11-15')).toBe('2026-11-15')
    expect(endOfWeek('2026-11-16')).toBe('2026-11-22')
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('the groups of the agenda', () => {
  it('Overdue, Today, Tomorrow, This week, Later, No date, and Done', () => {
    expect(groupOf(e({ due: '2026-11-10' }), TODAY)).toBe('overdue')
    expect(groupOf(e({ due: '2026-11-11' }), TODAY)).toBe('today')
    expect(groupOf(e({ due: '2026-11-12' }), TODAY)).toBe('tomorrow')
    expect(groupOf(e({ due: '2026-11-13' }), TODAY)).toBe('week')
    expect(groupOf(e({ due: '2026-11-15' }), TODAY)).toBe('week')
    expect(groupOf(e({ due: '2026-11-16' }), TODAY)).toBe('later')
    expect(groupOf(e({}), TODAY)).toBe('nodate')
    // A finished task is never overdue.
    expect(groupOf(e({ due: '2026-11-01', status: 'done' }), TODAY)).toBe('done')
    expect(groupOf(e({ due: '2026-11-11', status: 'doing' }), TODAY)).toBe('today')
  })

  it('on a Saturday, "this week" is empty and Sunday is tomorrow', () => {
    expect(groupOf(e({ due: '2026-11-15' }), '2026-11-14')).toBe('tomorrow')
    expect(groupOf(e({ due: '2026-11-16' }), '2026-11-14')).toBe('later')
  })

  it('groups come in that order, empty ones are left out, and each is sorted by date then priority', () => {
    const list = [
      e({ id: 'a', due: '2026-12-01' }),
      e({ id: 'b', due: '2026-11-13', priority: 3 }),
      e({ id: 'c', due: '2026-11-13', priority: 1 }),
      e({ id: 'd' }),
      e({ id: 'f', due: '2026-11-09' }),
    ]
    const g = agendaGroups(list, TODAY)
    expect(g.map((x) => x.id)).toEqual(['overdue', 'week', 'later', 'nodate'])
    expect(g[1]?.items.map((x) => x.id)).toEqual(['c', 'b'])
  })
})

describe('the filters', () => {
  function map() {
    const doc = createMapDoc()
    const root = ensureRoot(doc, 'Central')
    const a = addChild(doc, root, 'Dose') as string
    const a1 = addChild(doc, a, 'Storage') as string
    const b = addChild(doc, root, 'Billing') as string
    addTask(doc, { topicId: a, title: 'On Dose', due: '2026-11-12', priority: 1 })
    addTask(doc, { topicId: a1, title: 'On Storage', status: 'doing', priority: 2 })
    addTask(doc, { topicId: b, title: 'On Billing', due: '2026-12-01', status: 'done', details: 'invoice 7' })
    addTask(doc, { title: 'Loose task' })
    const topics = snapshotTopics(doc)
    return { topics, all: allTasks(topics, snapshotTasks(doc)), a, a1, b }
  }
  const titles = (l: TaskEntry[]) => l.map((x) => x.title).sort()

  it('starts with the open tasks (not Done) and says when anything else is chosen', () => {
    const { topics, all } = map()
    expect(titles(filterTasks(all, topics, defaultFilters()))).toEqual(['Loose task', 'On Dose', 'On Storage'])
    expect(filtersActive(defaultFilters())).toBe(false)
    expect(filtersActive({ ...defaultFilters(), priorities: [1] })).toBe(true)
  })

  it('by status, priority, and with no status chosen all are shown', () => {
    const { topics, all } = map()
    expect(titles(filterTasks(all, topics, { ...defaultFilters(), statuses: ['done'] }))).toEqual(['On Billing'])
    expect(titles(filterTasks(all, topics, { ...defaultFilters(), statuses: [] }))).toHaveLength(4)
    expect(titles(filterTasks(all, topics, { ...defaultFilters(), priorities: [2] }))).toEqual(['On Storage'])
  })

  it('by topic: this topic only, or with its sub topics', () => {
    const { topics, all, a } = map()
    expect(titles(filterTasks(all, topics, { ...defaultFilters(), topicId: a, withSub: false }))).toEqual(['On Dose'])
    expect(titles(filterTasks(all, topics, { ...defaultFilters(), topicId: a, withSub: true }))).toEqual(['On Dose', 'On Storage'])
  })

  it('by due dates (tasks with no date drop out), and by words in the title, details or topic path', () => {
    const { topics, all } = map()
    const open = { ...defaultFilters(), statuses: [] }
    expect(titles(filterTasks(all, topics, { ...open, from: '2026-11-12', to: '2026-11-30' }))).toEqual(['On Dose'])
    expect(titles(filterTasks(all, topics, { ...open, from: '2026-12-01' }))).toEqual(['On Billing'])
    expect(titles(filterTasks(all, topics, { ...open, text: 'invoice' }))).toEqual(['On Billing'])
    expect(titles(filterTasks(all, topics, { ...open, text: 'dose' }))).toEqual(['On Dose', 'On Storage'])
    expect(titles(filterTasks(all, topics, { ...open, text: 'loose' }))).toEqual(['Loose task'])
  })
})
