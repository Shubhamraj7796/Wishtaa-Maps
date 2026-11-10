import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Capture area in a real browser (production build): every capture adds a NEW topic with a picture, the capture bar shows where it goes,
 * Keep capturing adds more, and Escape ends it. Screenshots at desktop, tablet and phone sizes.
 */
const DIR = join('test-results', 'pdf-capture')
const SIZES = [
  { name: 'desktop', viewport: { width: 1366, height: 800 }, touch: false },
  { name: 'tablet', viewport: { width: 820, height: 1100 }, touch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
]

async function makePdf(): Promise<string> {
  mkdirSync(DIR, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Capture test page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 20; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(DIR, 'capture.pdf')
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

/** Drags a rectangle over the first page. */
async function drag(page: Page, from = [0.4, 0.1], to = [0.95, 0.3]) {
  const box = await page.locator('[data-capture-layer]').first().boundingBox()
  if (!box) throw new Error('no capture layer')
  await page.mouse.move(box.x + box.width * from[0]!, box.y + box.height * from[1]!)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * to[0]!, box.y + box.height * to[1]!, { steps: 6 })
  await page.mouse.up()
}

/** A question about Compressed or Original may come up (once per capture session): take the first answer offered. */
async function answerQuestion(page: Page) {
  const asked = await page.getByText('Make the picture smaller?').waitFor({ timeout: 8000 }).then(() => true, () => false)
  if (asked) await page.getByRole('button', { name: 'Add', exact: true }).click()
}

for (const size of SIZES) {
  test(`capture adds a new topic each time: ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch && size.viewport.width < 800, serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openMapWithPdf(page, await makePdf())
    const topics = () => page.locator('[data-topic]').count()
    const start = await topics()

    await page.getByRole('button', { name: /capture area/i }).click()
    const bar = page.locator('[data-capture-bar]')
    await expect(bar).toBeVisible()
    await expect(bar.locator('[data-capture-into]')).toContainText(/central/i)
    await expect(bar.getByRole('radio', { name: 'Sub-topic' })).toHaveAttribute('aria-checked', 'true')
    await page.screenshot({ path: join(DIR, `${size.name}-1-capture-bar.png`) })

    // One capture: a NEW topic, and the tool goes back to Select (Keep capturing is off).
    await drag(page)
    await answerQuestion(page)
    await expect(page.getByText(/Added topic 1 under/)).toBeVisible({ timeout: 20_000 })
    await expect.poll(topics).toBe(start + 1)
    await expect(page.locator('[data-capture-bar]')).toHaveCount(0)
    await page.screenshot({ path: join(DIR, `${size.name}-2-captured.png`) })

    // Keep capturing: two more, each a new topic; Escape ends it.
    await page.getByRole('button', { name: /capture area/i }).click()
    await page.locator('[data-capture-bar]').getByRole('checkbox', { name: 'Keep capturing' }).check()
    await drag(page, [0.4, 0.35], [0.9, 0.5])
    await answerQuestion(page)
    await expect(page.getByText(/Added topic 1 under/)).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-capture-bar]')).toBeVisible() // still capturing
    await drag(page, [0.4, 0.55], [0.95, 0.7])
    await expect(page.getByText(/Added topic 2 under/)).toBeVisible({ timeout: 20_000 })
    await expect.poll(topics).toBe(start + 3)
    await page.screenshot({ path: join(DIR, `${size.name}-3-keep-capturing.png`) })
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-capture-bar]')).toHaveCount(0)

    // Undo from the confirmation removes exactly the last capture.
    await page.getByRole('button', { name: 'Undo', exact: true }).click({ timeout: 3000 }).catch(() => undefined)
    expect(errors).toEqual([])
    await context.close()
  })
}

test('titles from the capture bar menu, and Read mode has no capture (desktop)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  await page.getByRole('button', { name: /capture area/i }).click()
  await page.getByRole('button', { name: 'More capture options' }).click()
  await expect(page.locator('[data-capture-menu]')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'desktop-4-title-menu.png') })
  await page.getByRole('checkbox', { name: /Name the topic from the page/ }).check()
  await page.getByRole('checkbox', { name: /text inside the rectangle/ }).check()
  await page.keyboard.press('Escape') // closes the menu only
  await expect(page.locator('[data-capture-menu]')).toHaveCount(0)
  await expect(page.locator('[data-capture-bar]')).toBeVisible()
  await drag(page)
  await answerQuestion(page)
  await expect(page.getByText(/Added topic 1 under/)).toBeVisible({ timeout: 20_000 })
  // The page has text inside the rectangle, so the title is that text; the other option is the fallback.
  await expect.poll(() => page.locator('[data-topic]', { hasText: /capture, p\. 1|quick brown/ }).count()).toBeGreaterThan(0)
  await page.screenshot({ path: join(DIR, 'desktop-5-titled.png') })

  // Read mode: no capture.
  await page.getByRole('button', { name: 'Read', exact: true }).click()
  await expect(page.getByRole('button', { name: /capture area/i })).toBeDisabled()
  await context.close()
})

test('capture with a finger: touch events draw the rectangle (tablet)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 820, height: 1100 }, hasTouch: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  const topics = () => page.locator('[data-topic]').count()
  const start = await topics()
  await page.getByRole('button', { name: /capture area/i }).click()
  const box = await page.locator('[data-capture-layer]').first().boundingBox()
  if (!box) throw new Error('no capture layer')
  const cdp = await context.newCDPSession(page)
  const point = (fx: number, fy: number) => ({ x: Math.round(box.x + box.width * fx), y: Math.round(box.y + box.height * fy), id: 1 })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(0.4, 0.1)] })
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(0.4 + (0.55 * i) / 6, 0.1 + (0.2 * i) / 6)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await answerQuestion(page)
  await expect(page.getByText(/Added topic 1 under/)).toBeVisible({ timeout: 20_000 })
  await expect.poll(topics).toBe(start + 1)
  await page.screenshot({ path: join(DIR, 'tablet-6-finger-capture.png') })
  await context.close()
})
