import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * How much of the screen the controls above the PDF page take (Part 2, Group A). Prints, for each screen and each panel size:
 *  - panelControls: from the top of the PDF panel to the top of the page area
 *  - pageTop: from the top of the browser window to the top of the page area (includes the app header and the map toolbar)
 * The numbers are written to test-results/pdf-layout/measure-<label>.json so before and after can be compared.
 * Set MEASURE_LABEL=before|after.
 */
const DIR = join('test-results', 'pdf-layout')
const LABEL = process.env.MEASURE_LABEL ?? 'after'
const SCREENS = [
  { name: 'desktop 1366x768', viewport: { width: 1366, height: 768 }, touch: false },
  { name: 'tablet landscape 1180x820', viewport: { width: 1180, height: 820 }, touch: true },
  { name: 'tablet portrait 820x1180', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'phone 390x844', viewport: { width: 390, height: 844 }, touch: true },
]

async function makePdf(): Promise<string> {
  mkdirSync(DIR, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 12; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Measure page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 20; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(DIR, 'measure-12.pdf')
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

const measure = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-pdf-panel]') as HTMLElement
    const scroller = document.querySelector('[data-pdf-scroller]') as HTMLElement
    const p = panel.getBoundingClientRect()
    const s = scroller.getBoundingClientRect()
    return { size: panel.dataset.pdfSize, panelControls: Math.round(s.top - p.top), pageTop: Math.round(s.top), pageAreaHeight: Math.round(s.height), viewportHeight: window.innerHeight }
  })

test('measure the space above the page', async ({ browser }) => {
  const pdf = await makePdf()
  const results: Record<string, unknown> = {}
  for (const screen of SCREENS) {
    const context = await browser.newContext({ viewport: screen.viewport, hasTouch: screen.touch, serviceWorkers: 'block' })
    const page = await context.newPage()
    await openMapWithPdf(page, pdf)
    const rows: Record<string, unknown> = {}
    // Go through Normal, Wide and Full with the size button; in each size also measure Focus mode (every control hidden).
    for (let i = 0; i < 4; i++) {
      const m = await measure(page)
      rows[String(m.size)] ??= m
      if (page.url() && (await page.locator('[data-focus-button]').isVisible())) await page.locator('[data-focus-button]').click()
      else {
        await page.locator('[data-more]').click()
        await page.getByRole('menuitem', { name: /Focus mode/ }).click()
      }
      await expect(page.locator('[data-focus-handle]')).toBeVisible()
      await page.waitForTimeout(150)
      rows[`${String(m.size)} + Focus`] = await measure(page)
      await page.locator('[data-focus-handle]').click()
      await expect(page.locator('[data-pdf-bar]')).toBeVisible()
      if (m.size === 'full') break
      await page.locator('[data-expand]').click()
      await page.waitForTimeout(250)
    }
    results[screen.name] = rows
    await page.screenshot({ path: join(DIR, `${LABEL}-${screen.name.replace(/[^a-z0-9]+/gi, '-')}-full.png`) })
    await context.close()
  }
  if (LABEL === 'after') {
    for (const [name, rows] of Object.entries(results) as [string, Record<string, { panelControls: number; pageTop: number }>][]) {
      const wide = rows['wide'] ?? rows['full']
      expect(wide?.panelControls, `${name}: Wide controls above the page`).toBeLessThanOrEqual(90)
      expect(rows['full']?.panelControls, `${name}: Full controls above the page`).toBeLessThanOrEqual(48)
      expect(rows['full']?.pageTop, `${name}: Full, the page starts at the top of the window`).toBeLessThanOrEqual(48)
      expect(rows['full + Focus']?.panelControls, `${name}: Full + Focus`).toBeLessThanOrEqual(4)
    }
  }
  writeFileSync(join(DIR, `measure-${LABEL}.json`), JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
})
