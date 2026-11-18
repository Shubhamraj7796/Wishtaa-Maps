import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { box, dialog, fill, firstNote, newPage, nextNote } from './notesHelpers'

/**
 * The note popup beside the side panel, the "Note n of m" header with Previous / Next, the highlighted note in the list, switching notes
 * from the side list without losing text, the Add a note bar, and (later commits) minimize, the tray and F8. In a real browser (Chrome) at
 * 1366, 1024 and 768 px wide, on a phone-size touch window and in dark mode. Pictures go to docs/screenshots/notes-layout.
 * NOT covered: a real phone or tablet, Safari, Firefox, a screen reader.
 */
const SHOTS = join('docs', 'screenshots', 'notes-layout')
mkdirSync(SHOTS, { recursive: true })

for (const [name, width, height, dark] of [
  ['1366', 1366, 768, false],
  ['1024', 1024, 768, false],
  ['768', 768, 1024, false],
  ['dark-1366', 1366, 768, true],
] as const) {
  test(`the popup is beside the side panel, never over it; header, highlight, switching, Previous / Next (${name})`, async ({ browser }) => {
    const { page, ctx } = await newPage(browser, { width, height, dark })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await firstNote(page, 'Alpha', 'text of alpha')
    await nextNote(page, 'Beta', 'text of beta')
    await nextNote(page, 'Gamma', 'text of gamma')

    // The header says which note it is; the panel is open on the Notes tab.
    await expect(page.locator('[data-note-position]')).toHaveText('Note 3 of 3 · Topic: Central Topic')
    const panel = page.locator('#settings-panel')
    await expect(panel).toBeVisible()
    await expect(panel.locator('[data-add-note-bar]')).toBeVisible() // the Notes tab is showing

    // Beside, not over: the popup ends where the panel starts, the dim layer too, and a click lands on the panel.
    await page.waitForTimeout(400)
    const d = await box(page, '[data-item-popup]')
    const p = await panel.boundingBox()
    expect(d.x + d.width).toBeLessThanOrEqual((p?.x ?? 0) + 1)
    const bd = await box(page, '[data-item-popup-backdrop]')
    expect(bd.x + bd.width).toBeLessThanOrEqual((p?.x ?? 0) + 1)
    const hit = await page.evaluate(([x, y]) => (document.elementFromPoint(x as number, y as number) as HTMLElement | null)?.closest('#settings-panel') !== null, [(p?.x ?? 0) + 40, (p?.y ?? 0) + 200])
    expect(hit).toBe(true)
    // At every size the popup is inside the window, to the left of the panel.
    expect(d.x).toBeGreaterThanOrEqual(0)

    // The open note is highlighted in the side list.
    const active = panel.locator('[data-note-row][data-active="true"]')
    await expect(active).toHaveCount(1)
    await expect(active).toContainText('Gamma')
    await page.screenshot({ path: join(SHOTS, `beside-panel-${name}.png`) })

    // Choosing another note from the side list switches the popup at once; what was typed in the old one is kept.
    await page.keyboard.type(' typed right before switching')
    await panel.locator('[data-note-row]', { hasText: 'Alpha' }).click()
    await expect(dialog(page)).toHaveAccessibleName('Note: Alpha')
    await expect(page.locator('[data-note-position]')).toHaveText('Note 1 of 3 · Topic: Central Topic')
    await expect(page.getByLabel('Note text')).toContainText('text of alpha')
    await expect(panel.locator('[data-note-row][data-active="true"]')).toContainText('Alpha')
    // Previous is off on the first note; Next goes on; the Gamma text typed a moment before is there.
    await expect(page.getByRole('button', { name: 'Previous note' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next note' }).click()
    await expect(dialog(page)).toHaveAccessibleName('Note: Beta')
    await page.getByRole('button', { name: 'Next note' }).click()
    await expect(page.getByLabel('Note text')).toContainText('text of gamma typed right before switching')
    if (name === '1366') await page.screenshot({ path: join(SHOTS, 'header-prev-next-1366.png'), clip: { x: 0, y: 0, width: Math.min(d.x + d.width + 8, width), height: 330 } })

    // Closing with Escape leaves the panel as it was; everything is saved after a reload.
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await page.waitForTimeout(900)
    await page.reload()
    await page.locator('[data-topic]').first().waitFor()
    await page.locator('[data-notes-chip]').first().click()
    await expect(page.getByRole('menu', { name: 'Notes of this topic' }).locator('[data-note-row]')).toHaveCount(3)
    expect(errors).toEqual([])
    await ctx.close()
  })
}

test('on a phone-size window there is no room beside the panel: the popup is a full sheet and its header has a Notes list icon', async ({ browser }) => {
  const { page, ctx } = await newPage(browser, { width: 390, height: 780, touch: true })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await firstNote(page, 'Alpha', 'text of alpha')
  // The popup is a full sheet and covers the panel: the second note comes from the list icon in its header.
  await dialog(page).getByRole('button', { name: 'Notes of this topic' }).click()
  await page.getByRole('menu', { name: 'Notes of this topic' }).getByRole('menuitem', { name: 'Add a note' }).click()
  await expect(page.getByLabel('Note title')).toHaveValue('')
  await fill(page, 'Beta', 'text of beta')
  const d = await box(page, '[data-item-popup]')
  expect(Math.round(d.width)).toBe(390)
  await expect(page.locator('[data-note-position]')).toHaveText('Note 2 of 2 · Topic: Central Topic')
  const icon = dialog(page).getByRole('button', { name: 'Notes of this topic' })
  await expect(icon).toBeVisible()
  const ib = await icon.boundingBox()
  expect(Math.round(ib?.width ?? 0)).toBeGreaterThanOrEqual(44)
  expect(Math.round(ib?.height ?? 0)).toBeGreaterThanOrEqual(44)
  await icon.click()
  const menu = page.getByRole('menu', { name: 'Notes of this topic' })
  await expect(menu).toBeVisible()
  await expect(menu.locator('[data-note-row][data-active="true"]')).toContainText('Beta')
  await page.screenshot({ path: join(SHOTS, 'phone-notes-list-icon.png') })
  await menu.locator('[data-note-row]', { hasText: 'Alpha' }).click()
  await expect(dialog(page)).toHaveAccessibleName('Note: Alpha')
  await expect(page.getByLabel('Note text')).toContainText('text of alpha')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  expect(errors).toEqual([])
  await ctx.close()
})

test('the Add a note bar: full width under the list, sticky when the list is long, 44 px on touch, keyboard, dark mode', async ({ browser }) => {
  for (const [dark, touch, size] of [
    [false, false, { width: 1366, height: 768 }],
    [true, false, { width: 1366, height: 768 }],
    [false, true, { width: 390, height: 780 }],
  ] as const) {
    const { page, ctx } = await newPage(browser, { ...size, dark, touch })
    await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
    await page.getByRole('menuitem', { name: 'Notes' }).click()
    const bar = page.locator('[data-add-note-bar]')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('Add a note')
    const panel = page.locator('#settings-panel')
    const bb = await bar.boundingBox()
    const pb = await panel.boundingBox()
    expect(Math.round(bb?.width ?? 0)).toBeGreaterThanOrEqual(Math.round((pb?.width ?? 0) - 4))
    if (touch) expect(Math.round(bb?.height ?? 0)).toBeGreaterThanOrEqual(44)
    // Keyboard: focus, Enter adds a note and opens it.
    await bar.focus()
    await expect(bar).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await page.getByLabel('Note title').fill('One')
    await page.getByLabel('Note text').click()
    await page.keyboard.type('x')
    if (!touch) {
      // Several notes make the list long: the bar stays at the bottom of the panel, in view.
      for (let i = 2; i <= 9; i++) await nextNote(page, `Note ${i}`, 'x')
      await page.keyboard.press('Escape')
      const after = await bar.boundingBox()
      const pa = await panel.boundingBox()
      expect((after?.y ?? 0) + (after?.height ?? 0)).toBeLessThanOrEqual((pa?.y ?? 0) + (pa?.height ?? 0) + 1)
      expect(after?.y ?? 0).toBeGreaterThan((pa?.y ?? 0) + 100)
      await page.screenshot({ path: join(SHOTS, `add-note-bar-${dark ? 'dark-' : ''}desktop.png`) })
    } else {
      await page.keyboard.press('Escape')
      await page.screenshot({ path: join(SHOTS, 'add-note-bar-phone.png') })
    }
    await ctx.close()
  }
})
