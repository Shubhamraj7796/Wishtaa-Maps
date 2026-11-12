import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Notes and tasks in a real browser (Chrome): several notes per topic, the icon with a count on the map and in the Outline, the list, the
 * popup editor (typing, a toolbar icon, Escape, autosave, reload), on a computer, a tablet and a phone-size window. Pictures for the report
 * go to docs/screenshots/notes-tasks. NOT covered: a real phone or tablet, Safari, Firefox, a real screen reader.
 */
const SHOTS = join('docs', 'screenshots', 'notes-tasks')
mkdirSync(SHOTS, { recursive: true })

async function openBlankMap(page: Page) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
}

async function addTopic(page: Page, text: string) {
  await page.getByRole('button', { name: /Add sub topic/ }).click()
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
}

/** Adds a note to the selected topic from the Insert menu: the Notes tab lists the notes, its plus icon makes a new one. */
async function addNoteViaInsert(page: Page) {
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  await page.getByRole('menuitem', { name: 'Notes' }).click()
  await page.getByRole('button', { name: 'Add a note' }).click()
  await expect(page.getByRole('dialog', { name: /^Note/ })).toBeVisible()
}

test.describe('notes', () => {
  test('several notes on one topic: icon with a count, list, popup editor, autosave, reload', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width: 1366, height: 768 })
    await openBlankMap(page)
    await addTopic(page, 'Dose')
    await page.locator('[data-topic]', { hasText: 'Dose' }).first().click()

    // First note, written in the popup.
    await addNoteViaInsert(page)
    const dialog = page.getByRole('dialog', { name: /^Note/ })
    await page.getByLabel('Note title').fill('Storage')
    await page.getByLabel('Note text').click()
    await page.keyboard.type('Keep cold')
    const bold = dialog.getByRole('button', { name: 'Bold' })
    await bold.click()
    await expect(bold).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.type(' always')
    await page.screenshot({ path: join(SHOTS, 'note-popup-desktop.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    // The topic now shows a small notes icon (no count for one note).
    const chip = page.locator('[data-notes-chip]').first()
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAttribute('aria-label', 'Note. Open the list')

    // A second note from the list: the icon gets a count.
    await chip.click()
    const menu = page.getByRole('menu', { name: 'Notes of this topic' })
    await expect(menu.locator('[data-note-row]')).toHaveCount(1)
    await menu.getByRole('menuitem', { name: 'Add a note' }).click()
    await page.getByLabel('Note title').fill('Dispatch')
    await page.getByLabel('Note text').click()
    await page.keyboard.type('Ship on Monday')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-notes-chip]').first()).toHaveAttribute('aria-label', '2 notes. Open the list')
    await page.locator('[data-notes-chip]').first().click()
    await page.screenshot({ path: join(SHOTS, 'notes-list-desktop.png') })
    await page.keyboard.press('Escape')

    // Everything is saved: after a reload both notes are there with their text.
    await page.waitForTimeout(1200)
    await page.reload()
    await page.locator('[data-topic]').first().waitFor()
    await page.locator('[data-notes-chip]').first().click()
    const rows = page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('Storage')
    await expect(rows.nth(0)).toContainText('Keep cold always')
    await expect(rows.nth(1)).toContainText('Dispatch')
    await rows.nth(0).click()
    await expect(page.getByLabel('Note text').locator('strong')).toHaveText('always')
    await page.keyboard.press('Escape')

    // The Outline shows the same icon.
    await page.getByRole('button', { name: 'Outline view' }).click()
    await expect(page.locator('[data-notes-chip]').first()).toHaveAttribute('aria-label', '2 notes. Open the list')
    await page.screenshot({ path: join(SHOTS, 'outline-notes-icon-desktop.png') })

    // Search finds the topic by the text of its second note.
    await page.getByRole('button', { name: 'Map view' }).click()
    await page.keyboard.press('Control+f')
    await page.getByRole('searchbox').or(page.getByPlaceholder(/Find|Search/i)).first().fill('Monday')
    await expect(page.locator('[data-topic]', { hasText: 'Dose' }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('on a phone-size window the popup fills the screen; on a tablet it is centred', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await openBlankMap(page) // the central topic is already selected
    await addNoteViaInsert(page)
    const box = await page.getByRole('dialog', { name: /^Note/ }).boundingBox()
    expect(Math.round(box?.width ?? 0)).toBe(390)
    expect(Math.round(box?.height ?? 0)).toBe(780)
    await page.getByLabel('Note text').click()
    await page.keyboard.type('Phone note')
    await page.screenshot({ path: join(SHOTS, 'note-popup-phone.png') })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.locator('[data-notes-chip]').first().click()
    await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
    const tablet = await page.getByRole('dialog', { name: /^Note/ }).boundingBox()
    expect(tablet?.width ?? 0).toBeLessThan(1024)
    expect(tablet?.x ?? 0).toBeGreaterThan(20)
    await page.screenshot({ path: join(SHOTS, 'note-popup-tablet.png') })
  })
})

async function addTaskViaInsert(page: Page) {
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  await page.getByRole('menuitem', { name: 'Task' }).click()
  await page.locator('[data-details-task], #settings-panel').first().waitFor()
  await page.getByRole('button', { name: 'Add a task' }).click()
  await expect(page.getByRole('dialog', { name: /^Task/ })).toBeVisible()
}

test.describe('tasks on a topic', () => {
  test('add a task in the popup: title, status, date, priority; icon with count; list; reload', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width: 1366, height: 768 })
    await openBlankMap(page)
    await addTopic(page, 'Dose')
    await page.locator('[data-topic]', { hasText: 'Dose' }).first().click()

    await addTaskViaInsert(page)
    const dialog = page.getByRole('dialog', { name: /^Task/ })
    await page.getByLabel('Task title').fill('Order stock')
    await dialog.getByRole('radio', { name: 'Doing' }).click()
    await expect(dialog.getByRole('radio', { name: 'Doing' })).toHaveAttribute('aria-checked', 'true')
    await dialog.getByLabel('Due date', { exact: true }).fill('2026-12-01')
    await dialog.getByRole('radio', { name: 'Priority 2' }).click()
    await page.screenshot({ path: join(SHOTS, 'task-popup-desktop.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    const chip = page.locator('[data-tasks-chip]').first()
    await expect(chip).toHaveAttribute('aria-label', 'Task. Open the list')
    await chip.click()
    const menu = page.getByRole('menu', { name: 'Tasks of this topic' })
    await expect(menu.locator('[data-task-row]')).toHaveCount(1)
    await expect(menu).toContainText('Order stock')
    await menu.getByRole('menuitem', { name: 'Add a task' }).click()
    await page.getByLabel('Task title').fill('Call supplier')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-tasks-chip]').first()).toHaveAttribute('aria-label', '2 tasks. Open the list')

    await page.waitForTimeout(1200)
    await page.reload()
    await page.locator('[data-topic]').first().waitFor()
    await page.locator('[data-tasks-chip]').first().click()
    const rows = page.getByRole('menu', { name: 'Tasks of this topic' }).locator('[data-task-row]')
    await expect(rows).toHaveCount(2)
    await rows.nth(0).click()
    await expect(page.getByLabel('Task title')).toHaveValue('Order stock')
    await expect(page.getByLabel('Due date', { exact: true })).toHaveValue('2026-12-01')
    await expect(page.getByRole('radio', { name: 'Priority 2' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: 'Doing' })).toHaveAttribute('aria-checked', 'true')
    expect(errors).toEqual([])
  })
})

const ymdOf = (offset: number) => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function addAgendaTask(page: Page, title: string, due: string | null, priority?: number) {
  await page.getByRole('button', { name: 'Add a task' }).click()
  const dialog = page.getByRole('dialog', { name: /^Task/ })
  await page.getByLabel('Task title').fill(title)
  if (due) await dialog.getByLabel('Due date', { exact: true }).fill(due)
  if (priority) await dialog.getByRole('radio', { name: new RegExp(`^Priority ${priority}`) }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}

test.describe('the Task view', () => {
  test('Agenda groups by date, tick completes, filters narrow the list, popup opens from a row', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width: 1366, height: 768 })
    await openBlankMap(page)
    await addTopic(page, 'Dose')
    await page.locator('[data-topic]', { hasText: 'Dose' }).first().click()
    await page.getByRole('button', { name: 'Task view' }).click()
    await expect(page.locator('[data-task-view]')).toBeVisible()
    await expect(page.getByText(/No tasks in this map yet/)).toBeVisible()

    await addAgendaTask(page, 'Late one', ymdOf(-2), 2)
    await addAgendaTask(page, 'Due today', ymdOf(0), 1)
    await addAgendaTask(page, 'Far away', ymdOf(60))
    await addAgendaTask(page, 'Someday', null)
    const groups = await page.locator('[data-agenda-group]').evaluateAll((g) => g.map((x) => x.getAttribute('data-agenda-group')))
    expect(groups).toEqual(['overdue', 'today', 'later', 'nodate'])
    await expect(page.locator('[data-agenda-group="today"] [data-task-path]')).toHaveText('Central Topic › Dose')
    await page.screenshot({ path: join(SHOTS, 'task-view-agenda-desktop.png') })

    // Filters are hidden until asked for; priority narrows the list.
    await expect(page.locator('[data-task-filters]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Filters' }).click()
    await page.getByRole('checkbox', { name: 'Show priority 1' }).click()
    await expect(page.locator('[data-task-item]')).toHaveCount(1)
    await page.screenshot({ path: join(SHOTS, 'task-view-filters-desktop.png') })
    await page.getByRole('button', { name: 'Clear the filters' }).click()
    await expect(page.locator('[data-task-item]')).toHaveCount(4)

    // The tick completes a task: it leaves the open list; Done can be shown from the filters.
    await page.locator('[data-agenda-group="today"] [role="checkbox"]').click()
    await expect(page.locator('[data-agenda-group="today"]')).toHaveCount(0)
    await page.getByRole('checkbox', { name: 'Show Done tasks' }).click()
    await expect(page.locator('[data-agenda-group="done"]')).toContainText('Due today')

    // A row opens the popup.
    await page.locator('[data-agenda-group="overdue"] [data-task-row]').click()
    await expect(page.getByLabel('Task title')).toHaveValue('Late one')
    await page.keyboard.press('Escape')

    // Map keys do nothing to the hidden map while the Task view is showing.
    await page.locator('[data-task-view]').click({ position: { x: 5, y: 300 } })
    await page.keyboard.press('Enter')
    await page.keyboard.press('Delete')
    await page.getByRole('button', { name: 'Map view' }).click()
    await expect(page.locator('[data-topic]')).toHaveCount(2)
    expect(errors).toEqual([])
  })

  test('on a phone-size window the Task view fits and the popup is a full-screen sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 })
    await openBlankMap(page)
    await page.getByRole('button', { name: 'Task view' }).click()
    await addAgendaTask(page, 'Phone task', ymdOf(0), 1)
    await page.getByRole('button', { name: 'Filters' }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.screenshot({ path: join(SHOTS, 'task-view-phone.png') })
    await page.locator('[data-task-row]').click()
    const box = await page.getByRole('dialog', { name: /^Task/ }).boundingBox()
    expect(Math.round(box?.width ?? 0)).toBe(390)
    await page.screenshot({ path: join(SHOTS, 'task-popup-phone.png') })
  })
})

async function addTimedTask(page: Page, title: string, due: string, time: string | null) {
  await page.getByRole('button', { name: 'Add a task' }).click()
  const dialog = page.getByRole('dialog', { name: /^Task/ })
  await page.getByLabel('Task title').fill(title)
  await dialog.getByLabel('Due date', { exact: true }).fill(due)
  if (time) await dialog.getByLabel('Due time').fill(time)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
}

test.describe('the Task view by time, and Arrange', () => {
  for (const [name, size] of [
    ['desktop', { width: 1366, height: 768 }],
    ['tablet', { width: 1024, height: 768 }],
    ['phone', { width: 390, height: 780 }],
  ] as const) {
    test(`times on the rows and the Arrange popover at ${name} size`, async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.setViewportSize(size)
      await openBlankMap(page)
      await page.getByRole('button', { name: 'Task view' }).click()
      await addTimedTask(page, 'Evening call', ymdOf(2), '17:00')
      await addTimedTask(page, 'Morning call', ymdOf(2), '09:00')
      await addTimedTask(page, 'Whole day', ymdOf(2), null)
      const titles = () => page.locator('[data-task-item] [data-task-row] > span:first-child > span:first-child').allTextContents()
      expect(await titles()).toEqual(['Whole day', 'Morning call', 'Evening call'])
      await expect(page.locator('[data-task-item]').first().locator('[data-task-time]')).toHaveText('All day')
      await expect(page.locator('[data-task-item]').nth(1).locator('[data-task-time]')).toContainText(/9:00|09:00/)
      if (name === 'desktop') await page.screenshot({ path: join(SHOTS, 'task-view-times-desktop.png') })

      // Arrange: group by priority, sort by name, turn round.
      await page.getByRole('button', { name: 'Arrange' }).click()
      const menu = page.getByRole('menu', { name: 'Arrange the tasks' })
      await expect(menu).toBeVisible()
      const box = await menu.boundingBox()
      expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= size.width).toBe(true)
      await page.screenshot({ path: join(SHOTS, `arrange-popover-${name}.png`) })
      await menu.getByRole('group', { name: 'Group by' }).getByRole('menuitemradio', { name: 'None (one list)' }).click()
      await menu.getByRole('group', { name: 'Sort by' }).getByRole('menuitemradio', { name: 'Name (A to Z)' }).click()
      expect(await titles()).toEqual(['Evening call', 'Morning call', 'Whole day'])
      await menu.getByRole('menuitem', { name: /Ascending/ }).click()
      expect(await titles()).toEqual(['Whole day', 'Morning call', 'Evening call'])
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()

      // Remembered on this device after a reload.
      await page.reload()
      await page.locator('[data-topic]').first().waitFor()
      await page.getByRole('button', { name: 'Task view' }).click()
      expect(await titles()).toEqual(['Whole day', 'Morning call', 'Evening call'])
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      expect(errors).toEqual([])
    })
  }
})

test.describe('the size of the note popup', () => {
  test('Wider, Full screen and Narrower on a computer and a tablet; the size is remembered; on a phone it stays a sheet with a toolbar that does not wrap', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewportSize({ width: 1366, height: 768 })
    await openBlankMap(page)
    await addNoteViaInsert(page)
    const dialog = page.getByRole('dialog', { name: /^Note/ })
    await page.getByLabel('Note text').click()
    await page.keyboard.type('A longer note for the wide popup')
    const width = async () => Math.round((await dialog.boundingBox())?.width ?? 0)
    const normal = await width()
    expect(normal).toBeLessThanOrEqual(640)
    // Every tool fits in one row at normal size on a computer.
    await expect(page.locator('[data-note-toolbar]')).toHaveAttribute('data-tools-hidden', '0')
    await page.getByRole('button', { name: 'Wider' }).click()
    const wide = await width()
    expect(wide).toBeGreaterThan(normal + 200)
    await page.screenshot({ path: join(SHOTS, 'note-popup-wide-desktop.png') })
    await page.getByRole('button', { name: 'Full screen' }).click()
    expect(await width()).toBe(1366)
    expect(Math.round((await dialog.boundingBox())?.height ?? 0)).toBe(768)
    await page.screenshot({ path: join(SHOTS, 'note-popup-full-desktop.png') })

    // Remembered: close, open again, it is still full screen.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(700)
    await page.locator('[data-notes-chip]').first().click()
    await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
    expect(await width()).toBe(1366)
    await page.getByRole('button', { name: 'Narrower' }).click()
    expect(await width()).toBe(normal)
    await page.keyboard.press('Escape')

    // A phone-size window: always a full sheet, no size button, the toolbar shows a More icon instead of wrapping.
    await page.setViewportSize({ width: 390, height: 780 })
    await page.getByRole('button', { name: 'Close the settings panel' }).click() // the Insert menu left it open
    await page.locator('[data-notes-chip]').first().click()
    await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
    expect(await width()).toBe(390)
    await expect(page.getByRole('button', { name: 'Wider' })).toBeHidden()
    const bar = page.locator('[data-note-toolbar]')
    await expect(page.getByRole('button', { name: 'More formatting' })).toBeVisible()
    const h = await bar.evaluate((el) => ({ box: el.getBoundingClientRect().height, scroll: el.scrollWidth - el.clientWidth }))
    expect(h.box).toBeLessThan(50) // one row
    expect(h.scroll).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'More formatting' }).click()
    await page.screenshot({ path: join(SHOTS, 'note-toolbar-more-phone.png') })
    await page.getByRole('menuitem', { name: 'Redo typing' }).or(page.getByRole('menuitem', { name: 'Quote' })).first().click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

    // A tablet: wide is wider than normal and still inside the window.
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.locator('[data-notes-chip]').first().click()
    await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
    await page.getByRole('button', { name: 'Wider' }).click()
    const tw = await width()
    expect(tw).toBeGreaterThan(640)
    expect(tw).toBeLessThanOrEqual(1024)
    await expect(page.locator('[data-note-toolbar]')).toHaveAttribute('data-tools-hidden', '0')
    expect(errors).toEqual([])
  })
})
