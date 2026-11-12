import { describe, expect, it } from 'vitest'
import { addChild } from '../model/commands'
import { createMapDoc, ensureRoot, snapshotTopics } from '../model/doc'
import type { TaskEntry } from '../model/tasks'
import { arrangeChanged, arrangeTasks, defaultArrange, defaultFilters, filterTasks, filtersActive, formatDueAt, formatTime, groupOf, isOverdue, parseArrange } from './agenda'

// Wednesday 2026-11-11.
const TODAY = '2026-11-11'
const e = (over: Partial<TaskEntry>): TaskEntry => ({ id: 'x', topicId: null, title: 't', details: '', status: 'todo', legacy: false, createdAt: 1, updatedAt: 1, order: 0, ...over })

describe('the clock: overdue, times, and the Timed / All day filter', () => {
  it('a task with a time is overdue only after that minute; one with no time only from the next day', () => {
    const t = { due: '2026-11-11', status: 'todo' as const, time: '17:00' }
    expect(groupOf(t, TODAY, '16:00')).toBe('today')
    expect(groupOf(t, TODAY, '17:00')).toBe('today')
    expect(groupOf(t, TODAY, '17:01')).toBe('overdue')
    expect(groupOf({ due: TODAY, status: 'todo' as const }, TODAY, '23:59')).toBe('today')
    expect(groupOf({ ...t, status: 'done' as const }, TODAY, '23:00')).toBe('done')
    expect(isOverdue(t, TODAY, '18:00')).toBe(true)
    expect(isOverdue(t, TODAY, '09:00')).toBe(false)
    // A time on another day does not matter.
    expect(groupOf({ ...t, due: '2026-11-12' }, TODAY, '23:59')).toBe('tomorrow')
  })

  it('formats a time and a date with a time', () => {
    expect(formatTime('17:05')).toMatch(/5:05/)
    expect(formatDueAt('2026-11-14', '17:00')).toMatch(/Nov.*14.*5:00|14.*Nov.*5:00/)
    expect(formatDueAt('2026-11-14')).not.toMatch(/:/)
  })

  it('the Timed / All day filter', () => {
    const list = [e({ id: 'a', due: '2026-11-12', time: '09:00' }), e({ id: 'b', due: '2026-11-12' }), e({ id: 'c' })]
    const ids = (f: Partial<ReturnType<typeof defaultFilters>>) => filterTasks(list, {}, { ...defaultFilters(), ...f }).map((x) => x.id)
    expect(ids({})).toEqual(['a', 'b', 'c'])
    expect(ids({ timing: 'timed' })).toEqual(['a'])
    expect(ids({ timing: 'allday' })).toEqual(['b', 'c'])
    expect(filtersActive({ ...defaultFilters(), timing: 'timed' })).toBe(true)
  })
})

describe('Arrange: every group by and sort by', () => {
  const doc = createMapDoc()
  const root = ensureRoot(doc, 'Central')
  const dose = addChild(doc, root, 'Dose') as string
  const bill = addChild(doc, root, 'Billing') as string
  const mk = (title: string, o: Partial<TaskEntry>): TaskEntry => e({ id: title, title, createdAt: 1, order: 0, ...o })
  const topics = snapshotTopics(doc)
  const list = [
    mk('Echo', { due: '2026-11-13', time: '15:00', priority: 2, status: 'doing', topicId: dose, createdAt: 2 }),
    mk('Alpha', { due: '2026-11-13', time: '09:00', priority: 2, topicId: bill, createdAt: 5 }),
    mk('Bravo', { due: '2026-11-13', priority: 1, topicId: dose, createdAt: 3 }),
    mk('Charlie', { due: '2026-11-20', status: 'done', createdAt: 4 }),
    mk('Delta', { createdAt: 1 }),
  ]
  const GB = ['date', 'priority', 'status', 'topic', 'none'] as const
  const SB = ['datetime', 'date', 'name', 'priority', 'status', 'created'] as const
  const ids = (g: ReturnType<typeof arrangeTasks>) => g.map((x) => `${x.label}: ${x.items.map((i) => i.id).join(',')}`)

  it('the starting arrangement is by date, soonest first, all-day before timed', () => {
    expect(defaultArrange()).toEqual({ groupBy: 'date', sortBy: 'datetime', desc: false })
    const g = arrangeTasks(list, topics, defaultArrange(), TODAY)
    expect(g.map((x) => x.label)).toEqual(['This week', 'No date', 'Done'])
    expect(g[0]?.items.map((x) => x.id)).toEqual(['Bravo', 'Alpha', 'Echo'])
  })

  it('groups: priority, status, topic, none; a missing value forms a last group; empty groups are hidden', () => {
    expect(ids(arrangeTasks(list, topics, { groupBy: 'priority', sortBy: 'name', desc: false }, TODAY))).toEqual(['Priority 1: Bravo', 'Priority 2: Alpha,Echo', 'No priority: Charlie,Delta'])
    expect(ids(arrangeTasks(list, topics, { groupBy: 'status', sortBy: 'name', desc: false }, TODAY))).toEqual(['To do: Alpha,Bravo,Delta', 'Doing: Echo', 'Done: Charlie'])
    expect(ids(arrangeTasks(list, topics, { groupBy: 'topic', sortBy: 'name', desc: false }, TODAY)).map((x) => x.replace(/^.*› /, ''))).toEqual(['Billing: Alpha', 'Dose: Bravo,Echo', 'No topic: Charlie,Delta'])
    const flat = arrangeTasks(list, topics, { groupBy: 'none', sortBy: 'name', desc: false }, TODAY)
    expect(flat).toHaveLength(1)
    expect(flat[0]?.items.map((x) => x.id)).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
    expect(arrangeTasks([], topics, defaultArrange(), TODAY)).toEqual([])
  })

  const flatOrder = (sortBy: (typeof SB)[number], desc: boolean) => arrangeTasks(list, topics, { groupBy: 'none', sortBy, desc }, TODAY)[0]?.items.map((x) => x.id).join(',')
  it('sorts, ascending and descending, with the missing values always last and ties broken by name', () => {
    expect(flatOrder('datetime', false)).toBe('Bravo,Alpha,Echo,Charlie,Delta')
    expect(flatOrder('datetime', true)).toBe('Charlie,Echo,Alpha,Bravo,Delta')
    expect(flatOrder('date', false)).toBe('Bravo,Alpha,Echo,Charlie,Delta')
    expect(flatOrder('date', true)).toBe('Charlie,Bravo,Alpha,Echo,Delta')
    expect(flatOrder('name', false)).toBe('Alpha,Bravo,Charlie,Delta,Echo')
    expect(flatOrder('name', true)).toBe('Echo,Delta,Charlie,Bravo,Alpha')
    expect(flatOrder('priority', false)).toBe('Bravo,Alpha,Echo,Charlie,Delta')
    expect(flatOrder('priority', true)).toBe('Alpha,Echo,Bravo,Charlie,Delta')
    expect(flatOrder('status', false)).toBe('Alpha,Bravo,Delta,Echo,Charlie')
    expect(flatOrder('status', true)).toBe('Charlie,Echo,Alpha,Bravo,Delta')
    expect(flatOrder('created', false)).toBe('Delta,Echo,Bravo,Charlie,Alpha')
    expect(flatOrder('created', true)).toBe('Alpha,Charlie,Bravo,Echo,Delta')
  })

  it('every group by and sort by combination keeps every task exactly once, with no empty group', () => {
    for (const groupBy of GB)
      for (const sortBy of SB)
        for (const desc of [false, true]) {
          const g = arrangeTasks(list, topics, { groupBy, sortBy, desc }, TODAY)
          expect(g.every((x) => x.items.length > 0)).toBe(true)
          expect(g.flatMap((x) => x.items.map((i) => i.id)).sort()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'])
        }
  })

  it('by date, a timed task past its time moves to Overdue; the direction turns the tasks round, not the groups', () => {
    const g = arrangeTasks([mk('Late', { due: TODAY, time: '08:00' }), mk('Soon', { due: TODAY, time: '20:00' })], topics, { groupBy: 'date', sortBy: 'datetime', desc: true }, TODAY, '12:00')
    expect(ids(g)).toEqual(['Overdue: Late', 'Today: Soon'])
    expect(g[0]?.alert).toBe(true)
  })

  it('reads a saved arrangement and ignores anything that is not one', () => {
    expect(parseArrange({ groupBy: 'topic', sortBy: 'name', desc: true })).toEqual({ groupBy: 'topic', sortBy: 'name', desc: true })
    expect(parseArrange({ groupBy: 'x', sortBy: 5 })).toEqual(defaultArrange())
    expect(parseArrange(null)).toEqual(defaultArrange())
    expect(arrangeChanged(defaultArrange())).toBe(false)
  })
})
