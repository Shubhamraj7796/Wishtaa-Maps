import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { newPage } from './notesHelpers'

/**
 * The Task view's Month calendar and Board in a real browser (Chrome): the calendar fits the window with no sideways scroll, tasks sit on their
 * days, a click picks a day and opens a task, the keyboard moves between days and months; the Board drags a card to another column with the
 * mouse and moves it with the card's icons; phone-size (touch) and dark mode. Pictures go to docs/screenshots/task-month-board.
 * NOT covered: a real phone or tablet, finger dragging (the card icons are the touch way), Safari, Firefox, a screen reader.
 */
const SHOTS = join('docs', 'screenshots', 'task-month-board')
mkdirSync(SHOTS, { recursive: true })

const ymdOf = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function addTask(page: Page, title: string, due: string | null, opts: { time?: string; priority?: number } = {}) {
  await page.getByRole('button', { name: /^Add a task/ }).first().click()
  const dialog = page.getByRole('dialog', { name: /^Task/ })
  await page.getByLabel('Task title').fill(title)
  if (due) await dialog.getByLabel('Due date', { exact: true }).fill(due)
  if (opts.time) await dialog.getByLabel('Due time', { exact: true }).fill(opts.time)
  if (opts.priority) await dialog.getByRole('radio', { name: new RegExp(`^Priority ${opts.priority}`) }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}

async function seed(page: Page) {
  await page.getByRole('button', { name: 'Task view' }).click()
  await expect(page.locator('[data-task-view]')).toBeVisible()
  await addTask(page, 'Order stock', ymdOf(0), { priority: 1 })
  await addTask(page, 'Call supplier', ymdOf(0), { time: '15:30' })
  await addTask(page, 'Cold chain audit', ymdOf(2), { priority: 2 })
  await addTask(page, 'File returns', ymdOf(9))
  await addTask(page, 'Someday idea', null)
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

for (const [name, size, touch, dark] of [
  ['desktop', { width: 1366, height: 768 }, false, false],
  ['phone', { width: 390, height: 844 }, true, false],
  ['dark', { width: 1366, height: 768 }, false, true],
] as const) {
  test(`Month: ${name}`, async ({ browser }) => {
    const { page, ctx } = await newPage(browser, { ...size, touch, dark })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await seed(page)
    await page.getByRole('radio', { name: 'Month' }).click()
    const view = page.locator('[data-month-view]')
    await expect(view).toBeVisible()
    expect(await noSideScroll(page)).toBe(true)
    // Today is marked and holds its two tasks; the calendar fits inside the window.
    const today = ymdOf(0)
    await expect(page.locator(`[data-day="${today}"]`)).toHaveAttribute('aria-current', 'date')
    await expect(page.locator(`[data-day="${today}"]`)).toHaveAttribute('aria-label', /2 tasks$/)
    const box = (await page.locator('[role="grid"]').boundingBox()) as { x: number; width: number; y: number; height: number }
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1)
    if (!touch) {
      await expect(page.locator(`[data-cell="${today}"] [data-task-chip]`)).toHaveCount(2)
      // the timed task is first and shows its time
      await expect(page.locator(`[data-cell="${today}"] [data-task-chip]`).first()).toContainText('Call supplier')
    }
    // the cells are finger-sized
    if (touch) {
      const cell = (await page.locator(`[data-cell="${today}"]`).boundingBox()) as { width: number; height: number }
      expect(Math.round(cell.width)).toBeGreaterThanOrEqual(44)
      expect(Math.round(cell.height)).toBeGreaterThanOrEqual(44)
      const nav = (await page.getByRole('button', { name: 'Next month' }).boundingBox()) as { width: number; height: number }
      expect(Math.round(nav.height)).toBeGreaterThanOrEqual(44)
    }
    // Pick a day: its tasks are listed beside (or below) the calendar; a task opens.
    await page.locator(`[data-day="${today}"]`).click()
    const list = page.locator('[data-day-list]')
    await expect(list).toContainText('Order stock')
    await expect(list).toContainText('Call supplier')
    await page.screenshot({ path: join(SHOTS, `month-${name}.png`) })
    await list.getByRole('button', { name: /Order stock/ }).click()
    const dialog = page.getByRole('dialog', { name: /^Task/ })
    await expect(dialog).toBeVisible()
    await expect(page.getByLabel('Task title')).toHaveValue('Order stock')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    // The no-date tasks have their own icon.
    await page.getByRole('button', { name: 'Tasks with no date, 1' }).click()
    await expect(list).toContainText('Someday idea')
    await page.getByRole('button', { name: 'Tasks with no date, 1' }).click()
    expect(errors).toEqual([])
    await ctx.close()
  })

  test(`Board: ${name}`, async ({ browser }) => {
    const { page, ctx } = await newPage(browser, { ...size, touch, dark })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await seed(page)
    await page.getByRole('radio', { name: 'Board' }).click()
    const col = (s: string) => page.locator(`[data-board-column="${s}"]`)
    await expect(col('todo')).toHaveAttribute('aria-label', 'To do, 5')
    await expect(col('doing')).toHaveAttribute('aria-label', 'Doing, 0')
    await expect(col('done')).toHaveAttribute('aria-label', 'Done, 0')
    expect(await noSideScroll(page)).toBe(true)
    // Priority 1 is the first card of To do.
    await expect(col('todo').locator('[data-board-card]').first()).toContainText('Order stock')
    await page.screenshot({ path: join(SHOTS, `board-${name}.png`) })
    // The card's icons (the touch and keyboard way) move it.
    const card = col('todo').locator('[data-board-card]', { hasText: 'Order stock' })
    if (touch) {
      const mv = (await card.getByRole('button', { name: 'Move to Doing' }).boundingBox()) as { width: number; height: number }
      expect(Math.round(mv.height)).toBeGreaterThanOrEqual(44)
    }
    await card.getByRole('button', { name: 'Move to Doing' }).click()
    await expect(col('doing')).toHaveAttribute('aria-label', 'Doing, 1')
    await expect(col('doing')).toContainText('Order stock')
    if (!touch) {
      // The mouse drags a card to another column.
      await col('todo').locator('[data-board-card]', { hasText: 'Call supplier' }).dragTo(col('done'))
      await expect(col('done')).toHaveAttribute('aria-label', 'Done, 1')
      await expect(col('done')).toContainText('Call supplier')
    }
    // It was really saved in the task: the Agenda agrees.
    await page.getByRole('radio', { name: 'Agenda' }).click()
    await expect(page.locator('[data-agenda-group="today"]')).toContainText('Order stock')
    if (!touch) await expect(page.locator('[data-agenda-group="today"]')).not.toContainText('Call supplier') // Done: hidden by the default filter
    expect(errors).toEqual([])
    await ctx.close()
  })
}

test('Month: keys move between days and months; the choice of view is remembered after a reload', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  await seed(page)
  await page.getByRole('radio', { name: 'Month' }).click()
  const today = ymdOf(0)
  await page.locator(`[data-day="${today}"]`).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator(`[data-day="${ymdOf(1)}"]`)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(`[data-day="${ymdOf(8)}"]`)).toBeFocused()
  const label = await page.locator('[data-month-label]').textContent()
  await page.keyboard.press('PageDown')
  await expect(page.locator('[data-month-label]')).not.toHaveText(label ?? '')
  await page.getByRole('button', { name: 'Go to today' }).click()
  await expect(page.locator('[data-month-label]')).toHaveText(label ?? '')
  await page.reload()
  await page.getByRole('button', { name: 'Task view' }).click()
  await expect(page.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true')
  await ctx.close()
})
