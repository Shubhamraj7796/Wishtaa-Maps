import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Open PDF in the toolbar, in a real browser (Chrome): the file-plus icon on the bar with ONE PDF open, its popover (a portal, not clipped,
 * keyboard and touch), the same popover from the "+" of the tab row, the empty panel with large labelled buttons, and the order in which the
 * bar's buttons leave as the panel gets narrower (the file name keeps room; nothing overlaps). The Drive choice is only checked as far as it
 * starts the existing flow: there is no real Google here. NOT covered: a real Google Drive, a real Brave, a real phone.
 */
const OUT = join('test-results', 'open-pdf')
const KEEP = join('docs', 'screenshots', 'open-pdf')

async function makePdf(name: string, pages = 4): Promise<string> {
  mkdirSync(OUT, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`${name} page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 10; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(OUT, `${name}.pdf`)
  writeFileSync(file, await doc.save())
  return file
}
const keep = (name: string) => {
  mkdirSync(KEEP, { recursive: true })
  copyFileSync(join(OUT, name), join(KEEP, name))
}

async function newMap(page: Page) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
}
async function openMapWithPdfs(page: Page, files: string[]) {
  await newMap(page)
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'PDF from this device' }).click()
  await (await chooser).setFiles(files)
  await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 60_000 })
}

const bar = (page: Page) => page.locator('[data-pdf-bar]')
const openIcon = (page: Page) => bar(page).getByRole('button', { name: 'Open a PDF' })
const popover = (page: Page) => page.locator('[data-popover]')
const tooltip = (page: Page) => page.locator('[data-tooltip]')

test('wide panel, one PDF: the icon is on the bar, the popover opens in the page layer, the device choice opens the file chooser', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMapWithPdfs(page, [await makePdf('Audit')])
  await page.locator('[data-expand]').click() // Wide
  await expect(page.locator('[data-pdf-tabs]')).toHaveCount(0) // one PDF: no tab row, yet the icon is there
  await expect(openIcon(page)).toBeVisible()
  expect((await openIcon(page).innerText()).trim()).toBe('')
  expect(await openIcon(page).getAttribute('title')).toBeNull()
  expect(await openIcon(page).evaluate((b) => b.querySelector('svg')?.getAttribute('class') ?? '')).toContain('file-plus')
  await bar(page).screenshot({ path: join(OUT, 'after-top-bar.png') })
  keep('after-top-bar.png')

  await openIcon(page).hover()
  await expect(tooltip(page)).toHaveText('Open a PDF', { timeout: 2000 })
  await openIcon(page).click()
  await expect(popover(page)).toBeVisible()
  expect(await popover(page).evaluate((p) => p.parentElement === document.body)).toBe(true)
  await expect(popover(page).getByRole('menuitem', { name: 'From this device' })).toBeVisible()
  await expect(popover(page).getByRole('menuitem', { name: 'From Google Drive' })).toBeVisible()
  const pb = (await popover(page).boundingBox())!
  expect(pb.x).toBeGreaterThanOrEqual(0)
  expect(pb.x + pb.width).toBeLessThanOrEqual(1366)
  const ib = (await openIcon(page).boundingBox())!
  expect(pb.y).toBeGreaterThanOrEqual(ib.y + ib.height) // under the icon
  await page.screenshot({ path: join(OUT, 'after-popover.png'), clip: { x: 0, y: 0, width: 1000, height: 240 } })
  keep('after-popover.png')

  // The device choice opens the file chooser, and the file becomes a PDF of the map.
  const chooser = page.waitForEvent('filechooser')
  await popover(page).getByRole('menuitem', { name: 'From this device' }).click()
  await (await chooser).setFiles(await makePdf('Tax'))
  await expect(popover(page)).toHaveCount(0)
  await expect(page.locator('[data-pdf-tabs]')).toBeVisible({ timeout: 30_000 }) // two PDFs now: the tab row shows
  await expect(page.locator('[data-pdf-tabs]').getByRole('tab')).toHaveCount(2)

  // The "+" of the tab row is the same icon and the same popover.
  const plus = page.locator('[data-pdf-tabs]').getByRole('button', { name: 'Open a PDF' })
  await expect(plus).toBeVisible()
  expect(await plus.evaluate((b) => b.querySelector('svg')?.getAttribute('class') ?? '')).toContain('file-plus')
  await plus.click()
  await expect(popover(page).getByRole('menuitem', { name: 'From this device' })).toBeVisible()
  await expect(popover(page)).toHaveAttribute('aria-label', 'Open a PDF')
  await page.keyboard.press('Escape')
  await expect(popover(page)).toHaveCount(0)
  expect(errors).toEqual([])
  await context.close()
})

test('the Drive choice starts the existing Drive flow and the popover closes', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  let popups = 0
  context.on('page', () => popups++) // the Google sign-in window, when a Google client is configured (the live site)
  await openMapWithPdfs(page, [await makePdf('Audit')])
  const outcome = () => page.evaluate(() => [...document.querySelectorAll('[role="status"], [role="alert"], [role="dialog"]')].map((e) => (e as HTMLElement).innerText).join(' | '))
  await openIcon(page).click()
  await popover(page).getByRole('menuitem', { name: 'From Google Drive' }).click()
  await expect(popover(page)).toHaveCount(0)
  await page.waitForTimeout(2500)
  const viaPopover = { popups, text: await outcome() }
  console.log(`Drive choice from the popover: ${viaPopover.popups} window(s) opened, messages "${viaPopover.text.replace(/\s+/g, ' ').slice(0, 100)}"`)
  // The existing flow ran: either the Google sign-in window opened, or its message came (here: no Google client, or the window was closed).
  expect(viaPopover.popups > 0 || /Google|Drive|sign-in/i.test(viaPopover.text)).toBe(true)
  expect(errors).toEqual([])
  await context.close()
})

test('keyboard only: Tab to the icon, Enter opens, arrows move, Escape closes and returns the focus', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Audit')])
  await page.keyboard.press('Tab')
  await openIcon(page).focus()
  await expect(tooltip(page)).toHaveText('Open a PDF')
  await page.keyboard.press('Enter')
  await expect(popover(page)).toBeVisible()
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('From this device')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('From Google Drive')
  await page.keyboard.press('Escape')
  await expect(popover(page)).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Open a PDF')
  await expect(page.locator('[data-pdf-panel]')).toBeVisible() // Escape did not touch the panel
  await context.close()
})

test('the bar at many widths: the buttons leave in order, the file name keeps room, nothing overlaps', async ({ browser }) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('A very long file name for the audit of the year')])
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click() // Full: the panel is the whole window, so the window width is the panel width
  const names = ['Focus mode', 'Split', 'Next page', 'Two pages side by side', 'Close the PDF panel', 'Open a PDF']
  const rows: string[] = []
  for (const w of [1366, 900, 700, 680, 660, 640, 620, 600, 580, 560, 540, 500, 480, 460, 440, 430]) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.waitForTimeout(250)
    const r = await page.evaluate((list) => {
      const bar = document.querySelector('[data-pdf-bar]') as HTMLElement
      const present = list.map((n) => !!bar.querySelector(`button[aria-label^="${n}"], button[aria-label="${n}"]`))
      const nameBtn = [...bar.querySelectorAll<HTMLElement>('button')].find((b) => b.getAttribute('aria-haspopup') === 'menu' && b.textContent?.includes('.pdf'))
      const nameW = Math.round(nameBtn?.getBoundingClientRect().width ?? 0)
      const boxes = [...bar.children].map((c) => c.getBoundingClientRect()).filter((b) => b.width > 0).sort((a, b) => a.left - b.left)
      let overlap = false
      for (let i = 1; i < boxes.length; i++) if ((boxes[i] as DOMRect).left < (boxes[i - 1] as DOMRect).right - 0.5) overlap = true
      const last = boxes[boxes.length - 1] as DOMRect
      return { present, nameW, overlap, fits: last.right <= bar.getBoundingClientRect().right + 0.5 }
    }, names)
    rows.push(`${w}px: ${r.present.map((p) => (p ? 'Y' : '-')).join('')} name ${r.nameW}px`)
    expect(r.overlap, `overlap at ${w}`).toBe(false)
    expect(r.fits, `fits at ${w}`).toBe(true)
    expect(r.nameW, `the file name at ${w}`).toBeGreaterThanOrEqual(90)
    const want = [w >= 680, w >= 640, w >= 600, w >= 560, w >= 500, w >= 440]
    expect(r.present, `buttons at ${w}`).toEqual(want)
    // Whatever left is in "...": Open a PDF always is.
    await page.locator('[data-more]').click()
    await expect(page.getByRole('menuitem', { name: /Open a PDF from this device/ })).toBeVisible()
    await page.keyboard.press('Escape')
  }
  console.log(`bar widths (Focus Split arrows book Close Open):\n${rows.join('\n')}`)
  writeFileSync(join(OUT, 'bar-widths.txt'), rows.join('\n'))
  await context.close()
})

test('the bar at 460 px (a normal side panel on a computer)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Audit may 24 (final)')])
  await expect(page.locator('[data-pdf-panel]')).toHaveAttribute('data-pdf-size', 'normal')
  expect(Math.round((await page.locator('[data-pdf-panel]').boundingBox())!.width)).toBeLessThanOrEqual(470)
  await expect(openIcon(page)).toBeVisible()
  await bar(page).screenshot({ path: join(OUT, 'after-bar-460.png') })
  keep('after-bar-460.png')
  await openIcon(page).click()
  await expect(popover(page)).toBeVisible()
  const pb = (await popover(page).boundingBox())!
  expect(pb.x).toBeGreaterThanOrEqual(0)
  await page.screenshot({ path: join(OUT, 'after-popover-460.png'), clip: { x: 0, y: 0, width: 700, height: 220 } })
  keep('after-popover-460.png')
  await context.close()
})

test('empty panel: two large buttons with words; the device button opens the file chooser', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await newMap(page)
  await page.getByRole('button', { name: /^PDF sources/ }).click()
  await expect(page.locator('[data-pdf-panel]')).toBeVisible()
  await expect(page.getByText('No PDF yet')).toBeVisible()
  const device = page.getByRole('button', { name: 'Open from this device' })
  const drive = page.getByRole('button', { name: 'Open from Google Drive' })
  await expect(device).toContainText('Open from this device')
  await expect(drive).toContainText('Open from Google Drive')
  expect((await device.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.locator('[data-pdf-panel]')).not.toContainText('use the + button')
  await page.screenshot({ path: join(OUT, 'after-empty-panel.png'), clip: { x: 0, y: 90, width: 480, height: 560 } })
  keep('after-empty-panel.png')
  const chooser = page.waitForEvent('filechooser')
  await device.click()
  await (await chooser).setFiles(await makePdf('First'))
  await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 30_000 })
  await context.close()
})

for (const size of [
  { name: 'tablet', viewport: { width: 1180, height: 820 }, mobile: false, hasIcon: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, mobile: true, hasIcon: false },
]) {
  test(`touch (${size.name}): targets of 44 px, tap opens and closes, long-press shows the name`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: true, isMobile: size.mobile, serviceWorkers: 'block' })
    const page = await context.newPage()
    const cdp: CDPSession = await context.newCDPSession(page)
    await openMapWithPdfs(page, [await makePdf('Audit')])
    if (!size.hasIcon) {
      // On a phone-width bar Open a PDF is in "...", where it always is (and in the empty-panel buttons).
      await expect(openIcon(page)).toHaveCount(0)
      await page.locator('[data-more]').tap()
      await expect(page.getByRole('menuitem', { name: /Open a PDF from this device/ })).toBeVisible()
      const mb = (await page.getByRole('menuitem', { name: /Open a PDF from this device/ }).boundingBox())!
      expect(mb.height).toBeGreaterThanOrEqual(40)
      await context.close()
      return
    }
    const ib = (await openIcon(page).boundingBox())!
    expect(Math.min(ib.width, ib.height)).toBeGreaterThanOrEqual(43.5)
    // A long press shows the name and does not open the popover.
    const x = ib.x + ib.width / 2
    const y = ib.y + ib.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await page.waitForTimeout(700)
    await expect(tooltip(page)).toHaveText('Open a PDF')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(200)
    await expect(popover(page)).toHaveCount(0)
    // A tap opens it; both choices are 44 px; a tap outside closes it.
    await openIcon(page).tap()
    await expect(popover(page)).toBeVisible()
    for (const n of ['From this device', 'From Google Drive']) {
      const b = (await popover(page).getByRole('menuitem', { name: n }).boundingBox())!
      expect(Math.min(b.width, b.height), n).toBeGreaterThanOrEqual(43.5)
    }
    await page.screenshot({ path: join(OUT, `after-popover-${size.name}.png`), clip: { x: 0, y: 0, width: size.viewport.width, height: 360 } })
    keep(`after-popover-${size.name}.png`)
    await page.touchscreen.tap(size.viewport.width / 2, size.viewport.height - 60)
    await expect(popover(page)).toHaveCount(0)
    await context.close()
  })
}
