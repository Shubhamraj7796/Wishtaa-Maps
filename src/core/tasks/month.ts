import type { TaskEntry } from '../model/tasks'
import { addDays, ymd } from './agenda'

/** One square of the month calendar. */
export interface DayCell {
  /** "YYYY-MM-DD", local. */
  date: string
  /** Belongs to the month being shown (the others are the days of the neighbouring months that fill the first and last week). */
  inMonth: boolean
  isToday: boolean
  /** Saturday or Sunday. */
  weekend: boolean
}

export interface MonthRef {
  year: number
  /** 0 to 11. */
  month: number
}

export const monthOf = (date: string): MonthRef => {
  const [y, m] = date.split('-').map(Number)
  return { year: y ?? 1970, month: (m ?? 1) - 1 }
}

/** The month `delta` months from `ref` (negative: earlier). */
export function shiftMonth(ref: MonthRef, delta: number): MonthRef {
  const total = ref.year * 12 + ref.month + delta
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 }
}

/** "November 2026", in the device's language. */
export function monthLabel(ref: MonthRef): string {
  return new Date(ref.year, ref.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Monday to Sunday short names, in the device's language ("Mon", "Tue", ...). */
export function weekdayNames(): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }))
}

/**
 * The squares of a month, whole weeks Monday to Sunday (the same week the Agenda uses), 5 or 6 rows: the days of the month plus the days of the
 * neighbouring months that complete its first and last week.
 */
export function monthCells(ref: MonthRef, today: string): DayCell[] {
  const first = new Date(ref.year, ref.month, 1)
  const lead = (first.getDay() + 6) % 7 // days of the previous month shown before the 1st (Monday = 0)
  const days = new Date(ref.year, ref.month + 1, 0).getDate()
  const rows = Math.ceil((lead + days) / 7)
  const start = addDays(ymd(first), -lead)
  const cells: DayCell[] = []
  for (let i = 0; i < rows * 7; i++) {
    const date = addDays(start, i)
    const m = monthOf(date)
    cells.push({ date, inMonth: m.year === ref.year && m.month === ref.month, isToday: date === today, weekend: i % 7 >= 5 })
  }
  return cells
}

/** The tasks by the day they are due (tasks with no date are not here). Inside a day: with a time first (earliest first), then all-day, then by priority and name. */
export function tasksByDate(entries: TaskEntry[]): Map<string, TaskEntry[]> {
  const out = new Map<string, TaskEntry[]>()
  for (const e of entries) if (e.due) out.set(e.due, [...(out.get(e.due) ?? []), e])
  for (const list of out.values()) list.sort(byTimeThenPriority)
  return out
}

export function byTimeThenPriority(a: TaskEntry, b: TaskEntry): number {
  if (a.time && !b.time) return -1
  if (!a.time && b.time) return 1
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
  const p = (a.priority ?? 9) - (b.priority ?? 9)
  if (p) return p
  return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.order - b.order || a.id.localeCompare(b.id)
}

/** The day a key press moves to on the calendar: arrows by a day or a week, Page Up / Page Down by a month, Home / End the first and last day of the month. */
export function moveDay(date: string, key: string): string | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(date, -1)
    case 'ArrowRight':
      return addDays(date, 1)
    case 'ArrowUp':
      return addDays(date, -7)
    case 'ArrowDown':
      return addDays(date, 7)
    case 'PageUp':
    case 'PageDown': {
      const m = shiftMonth(monthOf(date), key === 'PageUp' ? -1 : 1)
      const day = Number(date.slice(8, 10))
      const last = new Date(m.year, m.month + 1, 0).getDate()
      return ymd(new Date(m.year, m.month, Math.min(day, last)))
    }
    case 'Home': {
      const m = monthOf(date)
      return ymd(new Date(m.year, m.month, 1))
    }
    case 'End': {
      const m = monthOf(date)
      return ymd(new Date(m.year, m.month + 1, 0))
    }
    default:
      return null
  }
}
