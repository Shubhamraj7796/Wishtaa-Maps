import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/** Part 2, Group A in a real browser: the thin bar, the floating pen bar, Focus mode, the markup drawer, thumbnails and the Full-screen app chrome. */
const DIR = join('test-results', 'pdf-clean')
const SIZES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, touch: false },
  { name: 'tablet', viewport: { width: 1180, height: 820 }, touch: true },
]

async function makePdf(pages = 60): Promise<string> {
  mkdirSync(DIR, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Clean page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 14; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(DIR, `clean-${pages}.pdf`)
  writeFileSync(file, await doc.save())
  return file
}

async function openMapWithPdf(page: Page, pdf: string) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'PDF from this device' }).click()
  await (await chooser).setFiles(pdf)
  await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 30_000 })
}
const more = (page: Page) => page.locator('[data-more]').click()

for (const size of SIZES) {
  test(`clean reading interface: ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openMapWithPdf(page, await makePdf())
    await page.screenshot({ path: join(DIR, `${size.name}-1-normal.png`) })

    // The pen bar floats only after Markup is chosen, and folds away when idle.
    await expect(page.locator('[data-floating-tools]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Markup', exact: true }).click()
    await expect(page.locator('[data-floating-tools]')).toBeVisible()
    await expect(page.locator('[data-floating-tools="collapsed"]')).toHaveCount(0)
    await expect(page.locator('[data-floating-tools="collapsed"]')).toBeVisible({ timeout: 9000 }) // about 4 s without activity
    await page.getByRole('button', { name: 'Show the markup tools' }).click()
    await expect(page.locator('[data-floating-tools="collapsed"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Markup', exact: true }).click()
    await expect(page.locator('[data-floating-tools]')).toHaveCount(0)

    // Thumbnails: off by default, a few drawn, going to a page works, and far-away ones stay undrawn (memory).
    await more(page)
    await page.getByRole('menuitemcheckbox', { name: /Page thumbnails/ }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-thumbs]')).toBeVisible()
    await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('[data-thumbs] canvas')].filter((c) => c.width > 4).length)).toBeGreaterThan(2)
    const drawnThumbs = await page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('[data-thumbs] canvas')].length)
    console.log(`${size.name}: 60 pages, ${drawnThumbs} thumbnail pictures in the page at once`)
    expect(drawnThumbs).toBeLessThan(60)
    await page.locator('[data-thumb="2"]').click()
    await expect(page.getByLabel('Page number')).toHaveValue('2')
    await page.screenshot({ path: join(DIR, `${size.name}-2-thumbs.png`) })
    await more(page)
    await page.getByRole('menuitemcheckbox', { name: /Page thumbnails/ }).click()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-thumbs]')).toHaveCount(0)

    // The markup list is a drawer, not a row.
    await more(page)
    await page.getByRole('menuitem', { name: /Markup list/ }).click()
    await expect(page.locator('[data-markup-drawer]')).toBeVisible()
    await expect(page.locator('[data-pdf-scroller]')).toBeVisible()
    await page.screenshot({ path: join(DIR, `${size.name}-3-markup-drawer.png`) })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-markup-drawer]')).toHaveCount(0)

    // Full screen: the app header and map toolbar step aside; Focus mode hides the bar; Escape steps back one level at a time.
    await page.locator('[data-expand]').click()
    await page.locator('[data-expand]').click()
    await expect(page.locator('[data-pdf-size="full"]')).toBeVisible()
    await expect(page.locator('header').first()).toBeHidden()
    await expect(page.locator('[role="toolbar"][aria-label="Editing tools"]')).toBeHidden()
    await more(page)
    await page.getByRole('menuitem', { name: /Focus mode/ }).click()
    await expect(page.locator('[data-pdf-bar]')).toHaveCount(0)
    await expect(page.locator('[data-focus-handle]')).toBeVisible()
    await page.screenshot({ path: join(DIR, `${size.name}-4-focus.png`) })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-pdf-bar]')).toBeVisible()
    await expect(page.locator('[data-pdf-size="full"]')).toBeVisible() // Escape left Focus first, Full is still on
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-pdf-size="normal"],[data-pdf-size="wide"]')).toBeVisible()
    await expect(page.locator('header').first()).toBeVisible()
    expect(errors).toEqual([])
    await context.close()
  })
}

test('the page chip shows the page and fades', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf(12))
  await expect(page.locator('[data-page-chip]')).toHaveText('Page 1 of 12')
  await expect.poll(() => page.locator('[data-page-chip]').evaluate((e) => getComputedStyle(e).opacity), { timeout: 6000 }).toBe('0')
  await context.close()
})
