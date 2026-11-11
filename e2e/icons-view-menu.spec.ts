import { expect, test, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Icons first: screenshots of the PDF View menu before and after the change, at desktop and tablet size (MEASURE_LABEL=before|after), and
 * (after) a tooltip showing over an open menu. Pictures go to test-results/icons and a copy to docs/screenshots/icons-first.
 */
const LABEL = process.env.SHOT_LABEL ?? 'after'
const OUT = join('test-results', 'icons')
const KEEP = join('docs', 'screenshots', 'icons-first')
const SIZES = [
  { name: 'desktop-1366', viewport: { width: 1366, height: 800 }, touch: false },
  { name: 'tablet-1180', viewport: { width: 1180, height: 820 }, touch: true },
]

async function makePdf(): Promise<string> {
  mkdirSync(OUT, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 6; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Icons page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 14; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(OUT, 'icons.pdf')
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

const keep = (name: string) => {
  mkdirSync(KEEP, { recursive: true })
  copyFileSync(join(OUT, name), join(KEEP, name))
}

for (const size of SIZES) {
  test(`View menu screenshots (${LABEL}): ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, serviceWorkers: 'block' })
    const page = await context.newPage()
    await openMapWithPdf(page, await makePdf())
    // Two pages, so the menu shows its Two-page choices as in the owner's screenshot.
    await page.getByRole('button', { name: 'View options' }).first().click()
    await page.getByRole('menuitemradio', { name: 'Two-page view' }).click() // (the book button is on the bar only from 520 px)
    const menu = page.locator('[data-view-menu]')
    await expect(menu).toBeVisible()
    await page.waitForTimeout(300)
    const mb = (await menu.boundingBox())!
    expect(mb.x).toBeGreaterThanOrEqual(0)
    expect(mb.x + mb.width).toBeLessThanOrEqual(size.viewport.width) // never runs off the window
    const full = `${LABEL}-view-menu-${size.name}-page.png`
    const crop = `${LABEL}-view-menu-${size.name}.png`
    await page.screenshot({ path: join(OUT, full) })
    await menu.screenshot({ path: join(OUT, crop) })
    const overflow = await menu.evaluate((m) => ({ scrolls: m.scrollHeight > m.clientHeight + 1, height: Math.round(m.getBoundingClientRect().height), width: Math.round(m.getBoundingClientRect().width) }))
    console.log(`View menu ${LABEL} ${size.name}: ${overflow.width} x ${overflow.height} px, scrolls: ${overflow.scrolls}`)
    keep(full)
    keep(crop)
    await context.close()
  })
}
