import { describe, expect, it } from 'vitest'
import type { TaskEntry } from '../model/tasks'
import { boardColumns, boardCompare } from './board'
import { monthCells, monthLabel, monthOf, moveDay, shiftMonth, tasksByDate, weekdayNames } from './month'

const t = (id: string, o: Partial<TaskEntry> = {}): TaskEntry =>
  ({ id, title: id, details: '', status: 'todo', topicId: null, createdAt: 0, updatedAt: 0, order: 0, legacy: false, ...o }) as TaskEntry

describe('the month calendar squares', () => {
  it('shows whole Monday to Sunday weeks: November 2026 starts on a Sunday, so 6 rows', () => {
    const cells = monthCells({ year: 2026, month: 10 }, '2026-11-19')
    expect(cells).toHaveLength(42)
    expect(cells[0]?.date).toBe('2026-10-26') // the Monday before Sunday 1 November
    expect(cells[6]?.date).toBe('2026-11-01')
    expect(cells[6]?.inMonth).toBe(true)
    expect(cells[0]?.inMonth).toBe(false)
    expect(cells[41]?.date).toBe('2026-12-06')
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30)
  })
  it('uses 5 rows when the month fits, and 4 for a February that starts on Monday', () => {
    expect(monthCells({ year: 2026, month: 5 }, '').length).toBe(35) // June 2026: starts on a Monday and has 30 days
    const feb = monthCells({ year: 2027, month: 1 }, '') // February 2027 starts on a Monday and has 28 days
    expect(feb).toHaveLength(28)
    expect(feb.every((c) => c.inMonth)).toBe(true)
  })
  it('marks today and the weekend', () => {
    const cells = monthCells({ year: 2026, month: 10 }, '2026-11-19')
    expect(cells.filter((c) => c.isToday).map((c) => c.date)).toEqual(['2026-11-19'])
    expect(cells.filter((c) => c.weekend).every((c) => [0, 6].includes(new Date(`${c.date}T00:00:00`).getDay()))).toBe(true)
  })
  it('crosses year ends in both directions and keeps a leap day', () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
    expect(shiftMonth({ year: 2026, month: 5 }, 25)).toEqual({ year: 2028, month: 6 })
    expect(monthCells({ year: 2028, month: 1 }, '').filter((c) => c.inMonth)).toHaveLength(29)
    expect(monthOf('2026-11-19')).toEqual({ year: 2026, month: 10 })
  })
  it('has seven weekday names starting on Monday and a month label', () => {
    const names = weekdayNames()
    expect(names).toHaveLength(7)
    expect(new Set(names).size).toBe(7)
    expect(monthLabel({ year: 2026, month: 10 })).toMatch(/2026/)
  })
})

describe('tasks on the calendar', () => {
  it('groups by due date, leaves out tasks with no date, and orders a day: timed first (earliest), then all-day by priority and name', () => {
    const map = tasksByDate([
      t('b-allday-p3', { due: '2026-11-20', priority: 3 }),
      t('a-allday-p1', { due: '2026-11-20', priority: 1 }),
      t('late', { due: '2026-11-20', time: '17:00' }),
      t('early', { due: '2026-11-20', time: '09:30' }),
      t('other-day', { due: '2026-11-21' }),
      t('nodate'),
    ])
    expect(map.get('2026-11-20')?.map((e) => e.id)).toEqual(['early', 'late', 'a-allday-p1', 'b-allday-p3'])
    expect(map.get('2026-11-21')?.map((e) => e.id)).toEqual(['other-day'])
    expect([...map.keys()].sort()).toEqual(['2026-11-20', '2026-11-21'])
  })
})

describe('moving between days with the keyboard', () => {
  it('arrows move a day or a week, across month ends', () => {
    expect(moveDay('2026-11-30', 'ArrowRight')).toBe('2026-12-01')
    expect(moveDay('2026-12-01', 'ArrowLeft')).toBe('2026-11-30')
    expect(moveDay('2026-11-19', 'ArrowDown')).toBe('2026-11-26')
    expect(moveDay('2026-11-03', 'ArrowUp')).toBe('2026-10-27')
  })
  it('Page keys move a month and keep the day when they can (31 Jan + 1 month = 28 Feb)', () => {
    expect(moveDay('2027-01-31', 'PageDown')).toBe('2027-02-28')
    expect(moveDay('2028-01-31', 'PageDown')).toBe('2028-02-29')
    expect(moveDay('2026-03-15', 'PageUp')).toBe('2026-02-15')
    expect(moveDay('2026-12-10', 'PageDown')).toBe('2027-01-10')
  })
  it('Home and End go to the first and last day of the month; other keys do nothing', () => {
    expect(moveDay('2026-11-19', 'Home')).toBe('2026-11-01')
    expect(moveDay('2026-11-19', 'End')).toBe('2026-11-30')
    expect(moveDay('2026-11-19', 'x')).toBeNull()
  })
})

describe('the board columns', () => {
  it('always has To do, Doing and Done, even when empty', () => {
    const cols = boardColumns([])
    expect(cols.map((c) => c.status)).toEqual(['todo', 'doing', 'done'])
    expect(cols.map((c) => c.label)).toEqual(['To do', 'Doing', 'Done'])
    expect(cols.every((c) => c.items.length === 0)).toBe(true)
  })
  it('puts each task in its status column and sorts: priority, then due date and time, then name; no priority and no date last', () => {
    const cols = boardColumns([
      t('z-nodate-nop'),
      t('d-p2-late', { priority: 2, due: '2026-12-01' }),
      t('c-p2-soon', { priority: 2, due: '2026-11-20' }),
      t('b-p1', { priority: 1, due: '2027-01-01' }),
      t('a-p2-soon-timed', { priority: 2, due: '2026-11-20', time: '08:00' }),
      t('e-doing', { status: 'doing' }),
      t('f-done', { status: 'done' }),
    ])
    expect(cols[0]?.items.map((e) => e.id)).toEqual(['b-p1', 'c-p2-soon', 'a-p2-soon-timed', 'd-p2-late', 'z-nodate-nop'])
    expect(cols[1]?.items.map((e) => e.id)).toEqual(['e-doing'])
    expect(cols[2]?.items.map((e) => e.id)).toEqual(['f-done'])
  })
  it('is stable: the same two tasks always come in the same order', () => {
    const a = t('same', { order: 1 })
    const b = t('same', { order: 2, id: 'same2' })
    expect(boardCompare(a, b)).toBeLessThan(0)
    expect(boardCompare(b, a)).toBeGreaterThan(0)
  })
})
