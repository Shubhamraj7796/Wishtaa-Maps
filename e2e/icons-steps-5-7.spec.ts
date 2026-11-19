import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Icons first, steps 5 to 7 in a real browser (Chrome): the map toolbar has no captions (it is 39 px high at 1366 wide, it was 51), every icon has
 * its name as a tooltip and as an accessible name, no element on the main screens carries a native `title`, and the Files sort icon opens its menu.
 * Pictures go to docs/screenshots/icons-first-5-7.
 * NOT covered: a screen reader, a real long press on a phone or tablet, Safari, Firefox.
 */
const SHOTS = join('docs', 'screenshots', 'icons-first-5-7')
mkdirSync(SHOTS, { recursive: true })

async function newMap(browser: import('@playwright/test').Browser, size: { width: number; height: number }, touch = false, dark = false) {
  const ctx = await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch && size.width < 800 })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
  if (dark) {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  }
  return { ctx, page }
}

const NAMES = [
  'Map view', 'Outline view', 'Task view', 'Undo', 'Redo', 'Add topic (next to the selected one)', 'Add sub topic', 'Add a floating topic', 'Delete',
  'Relationship line between two topics', 'Callout note on a topic', 'Boundary around topics', 'Summary of sibling topics',
]

for (const [name, size, touch, dark] of [
  ['desktop', { width: 1366, height: 768 }, false, false],
  ['tablet', { width: 1024, height: 768 }, true, false],
  ['phone', { width: 390, height: 844 }, true, false],
  ['dark', { width: 1366, height: 768 }, false, true],
] as const) {
  test(`map toolbar without captions: ${name}`, async ({ browser }) => {
    const { ctx, page } = await newMap(browser, size, touch, dark)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const bar = page.getByRole('toolbar', { name: 'Editing tools' })
    await expect(bar).toBeVisible()
    // Every tool is there by name, with no words under the icon.
    for (const n of NAMES) await expect(bar.getByRole('button', { name: n })).toHaveCount(1)
    for (const word of ['Sub Topic', 'Floating', 'Relationship', 'Callout', 'Boundary', 'Summary']) await expect(bar.getByText(word, { exact: true })).toHaveCount(0)
    const h = Math.round(((await bar.boundingBox()) as { height: number }).height)
    expect(h).toBeLessThanOrEqual(40)
    if (size.width >= 1280) expect(h).toBe(39)
    // No native title on the screen; the name comes from the shared tooltip.
    expect(await page.locator('[title]').count()).toBe(0)
    if (!touch) {
      await bar.getByRole('button', { name: 'Add sub topic' }).hover()
      await expect(page.locator('[data-tooltip]').first()).toContainText('Add sub topic')
    }
    await page.screenshot({ path: join(SHOTS, `map-toolbar-${name}.png`) })
    expect(errors).toEqual([])
    await ctx.close()
  })
}

test('Files: Sort is an icon with a menu; no native titles on Home, Files and the map', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } })
  const page = await ctx.newPage()
  await page.goto('/home')
  expect(await page.locator('[title]').count()).toBe(0)
  await page.goto('/files')
  await expect(page.getByRole('button', { name: /^Sort by: / })).toBeVisible()
  expect(await page.locator('select#sort-key').count()).toBe(0)
  await page.getByRole('button', { name: /^Sort by: / }).click()
  const menu = page.getByRole('menu', { name: 'Sort by' })
  await expect(menu.getByRole('menuitemradio')).toHaveCount(3)
  await page.screenshot({ path: join(SHOTS, 'files-sort-menu-desktop.png') })
  await menu.getByRole('menuitemradio', { name: 'Name' }).click()
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Sort by: Name' })).toBeVisible()
  await page.keyboard.press('Escape')
  expect(await page.locator('[title]').count()).toBe(0)
  await ctx.close()
})
