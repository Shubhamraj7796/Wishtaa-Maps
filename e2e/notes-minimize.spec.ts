import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { box, chip, dialog, firstNote, newPage, nextNote, overlap, type Rect } from './notesHelpers'

/**
 * Minimize and the tray of minimized notes, in a real browser (Chrome): a note becomes a chip, the map stays usable, the text, cursor and
 * scroll come back exactly, autosave goes on while it is minimized, several chips, keyboard, dark mode, and on a phone-size touch window
 * the tray never covers the side sheet or the floating buttons. Pictures go to docs/screenshots/notes-layout.
 * NOT covered: a real phone or tablet, Safari, Firefox, a screen reader.
 */
const SHOTS = join('docs', 'screenshots', 'notes-layout')
mkdirSync(SHOTS, { recursive: true })

test('minimize: the note becomes a chip, the map stays usable, text, cursor and scroll come back exactly, and autosave goes on while it is minimized', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await firstNote(page, 'Long one', 'start')
  // A long text, so there is a scroll position; the cursor is put at the start of line 3, after its first letter.
  for (let i = 1; i <= 40; i++) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(`line ${i}`)
  }
  await page.locator('.note-editor p', { hasText: /^line 3$/ }).click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  // Text typed just before minimizing is saved while the note is minimized (checked after a reload below).
  await page.keyboard.type('MIN')
  // Then the text is scrolled away from the cursor (scrolling does not move the cursor).
  await page.locator('[data-note-body]').evaluate((el) => (el.scrollTop = 300))
  const scroll = await page.locator('[data-note-body]').evaluate((el) => el.scrollTop)
  expect(scroll).toBeGreaterThan(0)

  const min = dialog(page).getByRole('button', { name: 'Minimize' })
  await min.click()
  await expect(dialog(page)).toBeHidden()
  await expect(chip(page, 'Long one')).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.closest('[data-item-popup]') === null)).toBe(true) // the focus is not left in the hidden popup

  // No dim layer: the map is fully usable (a click selects a topic); the chip stays; Escape does nothing to it.
  await page.locator('[data-topic]').first().click()
  await expect(chip(page, 'Long one')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chip(page, 'Long one')).toBeVisible()
  // The chip stays when the view changes.
  await page.getByRole('button', { name: 'Outline view' }).click()
  await expect(chip(page, 'Long one')).toBeVisible()
  await page.getByRole('button', { name: 'Task view' }).click()
  await expect(chip(page, 'Long one')).toBeVisible()
  await page.getByRole('button', { name: 'Map view' }).click()
  await expect(chip(page, 'Long one')).toBeVisible()
  await page.waitForTimeout(1200) // longer than the autosave time

  // Restore with a click on the bar: same scroll, and the cursor is where it was (typing goes there).
  await chip(page, 'Long one').getByRole('button', { name: /Restore note/ }).click()
  await expect(dialog(page)).toBeVisible()
  expect(Math.abs((await page.locator('[data-note-body]').evaluate((el) => el.scrollTop)) - scroll)).toBeLessThan(3)
  await page.keyboard.type('X')
  await expect(page.locator('.note-editor p', { hasText: /lMINXine 3/ })).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await page.waitForTimeout(900)
  await page.reload()
  await page.locator('[data-topic]').first().waitFor()
  await page.locator('[data-notes-chip]').first().click()
  await page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first().click()
  await expect(page.getByLabel('Note text')).toContainText('lMINXine 3')
  expect(errors).toEqual([])
  await ctx.close()
})

test('autosave while minimized: typed text is in the saved copy (after a reload) though the note was never restored', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 1366, height: 768 })
  await firstNote(page, 'Quiet', 'first')
  await page.keyboard.type(' and then typed at the last moment')
  await dialog(page).getByRole('button', { name: 'Minimize' }).click()
  await expect(chip(page, 'Quiet')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.reload()
  await page.locator('[data-topic]').first().waitFor()
  await page.locator('[data-notes-chip]').first().click()
  await expect(page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]').first()).toContainText('typed at the last moment')
  await ctx.close()
})

for (const [name, dark] of [
  ['light', false],
  ['dark', true],
] as const) {
  test(`the tray holds several minimized notes; a click restores one and the open one takes its place; keyboard (${name})`, async ({ browser }) => {
    const { page, ctx } = await newPage(browser, { width: 1366, height: 768, dark })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await firstNote(page, 'Alpha', 'text of alpha')
    await dialog(page).getByRole('button', { name: 'Minimize' }).click()
    await nextNote(page, 'Beta', 'text of beta')
    await dialog(page).getByRole('button', { name: 'Minimize' }).click()
    await nextNote(page, 'Gamma', 'text of gamma')
    await dialog(page).getByRole('button', { name: 'Minimize' }).click()
    await expect(page.locator('[data-min-note]')).toHaveCount(3)
    await page.screenshot({ path: join(SHOTS, `tray-three-${name}.png`) })
    // A fourth note is open while three wait in the tray: the popup leaves the strip with the tray free.
    await nextNote(page, 'Delta', 'text of delta')
    const tray = await box(page, '[data-min-tray]')
    const popup = await box(page, '[data-item-popup-backdrop]:not([hidden]) [data-item-popup]')
    expect(overlap(tray, popup)).toBe(false)
    await page.screenshot({ path: join(SHOTS, `tray-with-open-popup-${name}.png`) })
    // Restoring a chip puts the open note into the tray, still alive and saved.
    await chip(page, 'Alpha').getByRole('button', { name: /Restore note/ }).click()
    await expect(dialog(page)).toHaveAccessibleName('Note: Alpha')
    await expect(dialog(page).getByLabel('Note text')).toContainText('text of alpha')
    await expect(page.locator('[data-min-note]')).toHaveCount(3)
    await expect(chip(page, 'Delta')).toBeVisible()
    // Keyboard: minimize with the button, then the focus on a chip and Enter restores it.
    await dialog(page).getByRole('button', { name: 'Minimize' }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeHidden()
    await chip(page, 'Beta').getByRole('button', { name: /Restore note/ }).focus()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toHaveAccessibleName('Note: Beta')
    // The chip close icon closes a note (it was saved: it is still in the list).
    await chip(page, 'Gamma').getByRole('button', { name: 'Close the note' }).click()
    await expect(page.locator('[data-min-note]')).toHaveCount(2)
    await expect(page.locator('#settings-panel [data-note-row]', { hasText: 'Gamma' })).toHaveCount(1)
    expect(errors).toEqual([])
    await ctx.close()
  })
}

test('on a phone-size window the tray never covers the side sheet or the floating buttons', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 390, height: 780, touch: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await firstNote(page, 'Alpha', 'text of alpha')
  await dialog(page).getByRole('button', { name: 'Minimize' }).click()
  // The settings sheet is open under the popup: the tray sits on top of it and covers nothing of it.
  await expect(chip(page, 'Alpha')).toBeVisible()
  const trayA = await box(page, '[data-min-tray]')
  const sheet = (await page.locator('#settings-panel').boundingBox()) as Rect
  expect(overlap(trayA, sheet)).toBe(false)
  const barBox = (await page.locator('[data-add-note-bar]').boundingBox()) as Rect
  expect(overlap(trayA, barBox)).toBe(false)
  const chipBox = await box(page, '[data-min-note]')
  expect(Math.round(chipBox.height)).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: join(SHOTS, 'tray-phone-with-sheet.png') })
  // The sheet closed: the floating Style pill is there; the tray is at the bottom left and stops short of it.
  await page.getByRole('button', { name: 'Close the settings panel' }).click()
  const pill = page.getByTestId('panel-touch-button')
  await expect(pill).toBeVisible()
  const trayB = await box(page, '[data-min-tray]')
  expect(overlap(trayB, (await pill.boundingBox()) as Rect)).toBe(false)
  expect(trayB.x + trayB.width).toBeLessThanOrEqual(390 - 160)
  await page.screenshot({ path: join(SHOTS, 'tray-phone.png') })
  // Restore: the popup is a full sheet; no sideways scroll.
  await chip(page, 'Alpha').getByRole('button', { name: /Restore note/ }).click()
  await expect(dialog(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
  await ctx.close()
})
