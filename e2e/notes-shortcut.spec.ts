import { expect, test } from '@playwright/test'
import { chip, dialog, firstNote, newPage } from './notesHelpers'

/**
 * F8 ("Open notes") in a real browser (Chrome): from the map it opens the side panel on the Notes tab and closes it again; inside a note
 * it minimizes the note; on the map it brings the last minimized note back; the command palette lists "Open notes" with F8; the tooltips of
 * the Notes tab, the notes icon on a topic and the Minimize icon show F8. Ctrl+N is not taken by the page.
 * NOT covered: laptops that need Fn for the F-keys, a real phone or tablet (they have no F-keys), Safari, Firefox.
 */
test('F8 opens and closes the Notes tab from the map, minimizes a note from inside it, and restores it from the map', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const panel = page.locator('#settings-panel')
  // The map has the focus (a topic is selected): F8 opens the side panel on the Notes tab.
  await page.locator('[data-topic]').first().click()
  await page.keyboard.press('Escape')
  await page.locator('[data-topic]').first().click()
  await page.keyboard.press('F8')
  await expect(panel.locator('[data-add-note-bar]')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('F8')
  await expect(panel).toBeHidden()
  // Alt+Shift+E (the older shortcut) does the same as F8.
  await page.keyboard.press('Alt+Shift+E')
  await expect(panel.locator('[data-add-note-bar]')).toBeVisible()

  // A note is open and the cursor is in its text: F8 minimizes it (the popup takes the key itself).
  await panel.locator('[data-add-note-bar]').click()
  await page.getByLabel('Note title').fill('Quick')
  await page.getByLabel('Note text').click()
  await page.keyboard.type('written with F8')
  await page.keyboard.press('F8')
  await expect(dialog(page)).toBeHidden()
  await expect(chip(page, 'Quick')).toBeVisible()
  // On the map F8 brings the last minimized note back, with the text.
  await page.locator('[data-topic]').first().click()
  await page.keyboard.press('F8')
  await expect(dialog(page)).toHaveAccessibleName('Note: Quick')
  await expect(dialog(page).getByLabel('Note text')).toContainText('written with F8')
  // Ctrl+N is the browser's: the page does not react to it (no popup, no new note).
  await page.keyboard.press('Escape')
  const before = await page.locator('[data-note-row]').count()
  await page.keyboard.press('Control+n')
  await expect(dialog(page)).toBeHidden()
  expect(await page.locator('[data-note-row]').count()).toBe(before)
  expect(errors).toEqual([])
  await ctx.close()
})

test('the command palette lists "Open notes" with F8, and the tooltips of the Notes tab, the notes icon and Minimize show F8', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  await firstNote(page, 'Tip note', 'x')
  const tip = page.locator('[role="tooltip"], [data-tooltip]')
  // Minimize.
  await dialog(page).getByRole('button', { name: 'Minimize' }).hover()
  await expect(tip.first()).toContainText('F8')
  await dialog(page).getByRole('button', { name: 'Minimize' }).click()
  await page.mouse.move(5, 400)
  // The Notes tab of the side panel (the old native title is gone: the shared tooltip is used).
  const tab = page.getByRole('tab', { name: 'Notes' })
  expect(await tab.getAttribute('title')).toBeNull()
  await tab.hover()
  await expect(tip.first()).toContainText('F8')
  // The notes icon on the topic.
  await page.mouse.move(5, 400)
  await page.locator('[data-notes-chip]').first().hover()
  await expect(tip.first()).toContainText('F8')
  // The palette.
  await page.keyboard.press('Control+k')
  await page.keyboard.type('Open notes')
  const entry = page.getByRole('option', { name: /Open notes/ }).or(page.getByText('Open notes').first())
  await expect(entry.first()).toBeVisible()
  await expect(page.getByText('F8').first()).toBeVisible()
  await ctx.close()
})
