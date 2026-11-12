import { expect, test, type Browser, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The checklist in the note editor, in a real browser (Chrome): the Checklist tool, typing items, ticking and unticking, nesting,
 * Ctrl+Enter, converting lines, reload, the toolbar More menu on a narrow popup, a phone-size touch window and dark mode.
 * Pictures for the report go to docs/screenshots/checklist. NOT covered: a real phone or tablet, Safari, Firefox, a screen reader.
 */
const SHOTS = join('docs', 'screenshots', 'checklist')
mkdirSync(SHOTS, { recursive: true })

async function newPage(browser: Browser, opts: { width: number; height: number; touch?: boolean; dark?: boolean }) {
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, hasTouch: !!opts.touch, isMobile: !!opts.touch })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
  if (opts.dark) {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  }
  return { page, ctx }
}

async function openNewNote(page: Page) {
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  await page.getByRole('menuitem', { name: 'Notes' }).click()
  await page.getByRole('button', { name: 'Add a note' }).click()
  const dialog = page.getByRole('dialog', { name: /^Note/ })
  await expect(dialog).toBeVisible()
  return dialog
}

/** Types "Order stock", "Call supplier" and a nested "Ask about the invoice" as a checklist. */
async function typeChecklist(page: Page) {
  await page.getByLabel('Note text').click()
  await page.getByRole('button', { name: 'Checklist' }).click()
  await page.keyboard.type('Order the cold stock')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Call the supplier')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ask about the invoice')
  await page.keyboard.press('Tab')
}

const items = (page: Page) => page.locator('.note-editor ul[data-type="taskList"] li')
const struck = (page: Page, n: number) => items(page).nth(n).locator('> div > p').first().evaluate((el) => getComputedStyle(el).textDecorationLine)

for (const [name, size, touch, dark] of [
  ['desktop', { width: 1366, height: 768 }, false, false],
  ['phone', { width: 390, height: 780 }, true, false],
  ['dark-desktop', { width: 1366, height: 768 }, false, true],
  ['dark-phone', { width: 390, height: 780 }, true, true],
] as const) {
  test(`checklist: type, tick, untick, nest, Ctrl+Enter, reload (${name})`, async ({ browser }) => {
    const { page, ctx } = await newPage(browser, { ...size, touch, dark })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const dialog = await openNewNote(page)
    await typeChecklist(page)

    // Three items; the third is nested under the second; the Checklist tool is highlighted while the cursor is in the list.
    await expect(items(page)).toHaveCount(3)
    await expect(page.locator('.note-editor ul[data-type="taskList"] ul[data-type="taskList"] li')).toHaveCount(1)
    await expect(dialog.getByRole('button', { name: 'Checklist' })).toHaveAttribute('aria-pressed', 'true')

    // Tick the first item with its box: the whole line is struck through and grey; untick restores it.
    const box = items(page).nth(0).locator('> label > input')
    expect(await struck(page, 0)).toBe('none')
    await box.click()
    await expect(items(page).nth(0)).toHaveAttribute('data-checked', 'true')
    expect(await struck(page, 0)).toBe('line-through')
    await box.click()
    await expect(items(page).nth(0)).toHaveAttribute('data-checked', 'false')
    expect(await struck(page, 0)).toBe('none')

    // The box is brand green; on a touch screen its tap area is at least 44 px; it has a name that says the state.
    const colour = await box.evaluate((el) => getComputedStyle(el).accentColor)
    expect(colour).toBe(dark ? 'rgb(45, 212, 191)' : 'rgb(13, 148, 136)')
    const label = await items(page).nth(0).locator('label').boundingBox()
    if (touch) {
      expect(Math.round(label?.width ?? 0)).toBeGreaterThanOrEqual(44)
      expect(Math.round(label?.height ?? 0)).toBeGreaterThanOrEqual(44)
    }
    await expect(box).toHaveAttribute('aria-label', 'Order the cold stock, not done')

    // Ctrl+Enter from the keyboard ticks the item the cursor is in (the nested one), not its parent.
    await items(page).nth(2).locator('> div > p').click()
    await page.keyboard.press('End')
    await page.keyboard.press('Control+Enter')
    await expect(items(page).nth(2)).toHaveAttribute('data-checked', 'true')
    await expect(items(page).nth(1)).toHaveAttribute('data-checked', 'false')
    await items(page).nth(1).locator('> label > input').click()
    await box.click() // the first one is ticked as well: two of three
    await expect(page.locator('.note-editor li[data-checked="true"]')).toHaveCount(3)
    await items(page).nth(1).locator('> label > input').click() // and the second is open again
    await page.screenshot({ path: join(SHOTS, `checklist-${name}.png`) })

    // Everything is saved: close, reload, open the note again.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(900)
    await page.reload()
    await page.locator('[data-topic]').first().waitFor()
    const sheet = page.getByRole('button', { name: 'Close the settings panel' })
    if (await sheet.isVisible()) await sheet.click() // the phone sheet may be open and cover the topic
    await page.locator('[data-notes-chip]').first().click()
    await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
    await expect(items(page)).toHaveCount(3)
    await expect(items(page).nth(0)).toHaveAttribute('data-checked', 'true')
    await expect(items(page).nth(1)).toHaveAttribute('data-checked', 'false')
    await expect(items(page).nth(2)).toHaveAttribute('data-checked', 'true')
    expect(errors).toEqual([])
    await ctx.close()
  })
}

test('checklist: Enter on an empty item leaves the list, Backspace on an empty item makes a paragraph, and selected lines convert to a checklist and back', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  await openNewNote(page)
  await page.getByLabel('Note text').click()
  await page.keyboard.type('line one')
  await page.keyboard.press('Enter')
  await page.keyboard.type('line two')
  // Select both lines, make them a checklist, then back.
  await page.keyboard.press('Control+a')
  await page.getByRole('button', { name: 'Checklist' }).click()
  await expect(items(page)).toHaveCount(2)
  await page.getByRole('button', { name: 'Checklist' }).click()
  await expect(items(page)).toHaveCount(0)
  await expect(page.locator('.note-editor p', { hasText: 'line two' })).toBeVisible()
  // A new checklist: Enter on the empty item leaves it.
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Checklist' }).click()
  await page.keyboard.type('only item')
  await page.keyboard.press('Enter')
  await expect(items(page)).toHaveCount(2)
  await page.keyboard.press('Enter')
  await expect(items(page)).toHaveCount(1)
  // Backspace on an empty item.
  await page.getByRole('button', { name: 'Checklist' }).click()
  await page.keyboard.type('x')
  await page.keyboard.press('Enter')
  const before = await items(page).count()
  await page.keyboard.press('Backspace')
  expect(await items(page).count()).toBeLessThan(before)
  await ctx.close()
})

test('checklist in Read mode: the boxes show but cannot be ticked, nothing is saved, and Edit mode can tick again', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openNewNote(page)
  await typeChecklist(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(900)

  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByTestId('read-badge')).toBeVisible()
  await page.locator('[data-notes-chip]').first().click()
  await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
  await expect(items(page)).toHaveCount(3)
  expect(await page.getByRole('button', { name: 'Checklist' }).count()).toBe(0) // no toolbar in Read mode
  const first = items(page).nth(0)
  await first.locator('> label > input').click({ force: true })
  await expect(first).toHaveAttribute('data-checked', 'false')
  await page.keyboard.press('Control+Enter')
  await expect(page.locator('.note-editor li[data-checked="true"]')).toHaveCount(0)
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')

  // Nothing was written: back in Edit mode the same note is still all unticked, and a tick works again.
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.locator('[data-notes-chip]').first().click()
  await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
  await expect(page.locator('.note-editor li[data-checked="true"]')).toHaveCount(0)
  await items(page).nth(0).locator('> label > input').click()
  await expect(items(page).nth(0)).toHaveAttribute('data-checked', 'true')
  expect(errors).toEqual([])
  await ctx.close()
})

for (const [name, size, touch, dark] of [
  ['desktop', { width: 1366, height: 768 }, false, false],
  ['phone', { width: 390, height: 780 }, true, false],
  ['dark-desktop', { width: 1366, height: 768 }, false, true],
  ['dark-phone', { width: 390, height: 780 }, true, true],
] as const) {
  test(`checklist: the progress count in the notes list, the toolbar and its More menu (${name})`, async ({ browser }) => {
    const { page, ctx } = await newPage(browser, { ...size, touch, dark })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const dialog = await openNewNote(page)
    await page.getByLabel('Note title').fill('Cold stock')
    await page.getByLabel('Note text').click()
    await page.getByRole('button', { name: 'Checklist' }).click()
    for (let i = 1; i <= 6; i++) {
      await page.keyboard.type(`Task ${i}`)
      if (i < 6) await page.keyboard.press('Enter')
    }
    for (const n of [0, 1, 2]) await items(page).nth(n).locator('> label > input').click()
    await expect(page.locator('.note-editor li[data-checked="true"]')).toHaveCount(3)

    // The toolbar with the new icon; on a narrow popup the rest of the tools are in the More menu.
    await page.screenshot({ path: join(SHOTS, `toolbar-${name}.png`), clip: { x: 0, y: 0, width: size.width, height: size.width < 500 ? 120 : 330 } })
    const more = dialog.getByRole('button', { name: 'More formatting' })
    if (await more.count()) {
      await more.click()
      await expect(page.getByRole('menu', { name: 'More formatting' })).toBeVisible()
      await page.screenshot({ path: join(SHOTS, `toolbar-more-${name}.png`), clip: { x: 0, y: 0, width: size.width, height: size.width < 500 ? 420 : 480 } })
      await page.keyboard.press('Escape')
    }
    await expect(dialog.getByRole('button', { name: 'Checklist' })).toBeVisible()

    // The notes list shows "3/6" for the note.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(900)
    const sheet = page.getByRole('button', { name: 'Close the settings panel' })
    if (await sheet.isVisible()) await sheet.click()
    await page.locator('[data-notes-chip]').first().click()
    const row = page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first()
    await expect(row.locator('[data-checklist-progress]')).toHaveText('3/6')
    await expect(row.locator('[data-checklist-progress]')).toHaveAttribute('aria-label', '3 of 6 done')
    await expect(row).toContainText('[x] Task 1')
    await page.screenshot({ path: join(SHOTS, `notes-list-progress-${name}.png`) })
    expect(errors).toEqual([])
    await ctx.close()
  })
}
