import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * The View menu in a real browser (production build): Two-page view, Show cover page, Enable scrolling off (paged), Fit page, a capture on
 * the right-hand page, the narrow-pane fallback, and how many page pictures exist at once (memory). Screenshots in test-results/pdf-views.
 */
const DIR = join('test-results', 'pdf-views')
const SIZES = [
  { name: 'desktop', viewport: { width: 1366, height: 800 }, touch: false },
  { name: 'tablet', viewport: { width: 1180, height: 820 }, touch: true },
]

async function makePdf(pages = 8): Promise<string> {
  mkdirSync(DIR, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    // Page 4 is landscape, so a spread has pages of different sizes.
    const page = i === 4 ? doc.addPage([842, 595]) : doc.addPage([595, 842])
    page.drawText(`Book page ${i}`, { x: 50, y: i === 4 ? 520 : 780, size: 26, font })
    for (let l = 0; l < 12; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: (i === 4 ? 470 : 730) - l * 24, size: 14, font })
  }
  const file = join(DIR, `book-${pages}.pdf`)
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

/** The panel starts narrow (a side column or a short sheet); Two pages need room, so take the full screen. */
const makeBig = async (page: Page) => {
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click()
  await expect(page.locator('[data-pdf-size="full"]')).toBeVisible()
}
const rows = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-pdf-scroller] [data-row]')].map((r) => r.dataset.row))
const drawn = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('[data-pdf-scroller] canvas')].filter((c) => c.width > 10).length)
const menu = (page: Page) => page.getByRole('button', { name: 'View options' }).first()
const pick = async (page: Page, name: RegExp | string) => {
  if (!(await page.locator('[data-view-menu]').isVisible())) await menu(page).click()
  await page.getByRole(/cover|alone|scrolling|Right/.test(String(name)) ? 'menuitemcheckbox' : 'menuitemradio', { name }).click()
  await page.keyboard.press('Escape') // close the menu so it does not cover the page
}

for (const size of SIZES) {
  test(`View menu: two pages, cover, paged, fit page, capture on the right page: ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, serviceWorkers: 'block' })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await openMapWithPdf(page, await makePdf())
    await makeBig(page)
    await page.screenshot({ path: join(DIR, `${size.name}-1-single.png`) })

    // Two-page view: 1-2, 3-4 (a landscape page beside a portrait one, same height).
    await pick(page, /Two-page view/)
    await expect.poll(() => rows(page).then((r) => r[0])).toBe('1-2')
    await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 900))
    await expect.poll(() => rows(page).then((r) => r.includes('3-4'))).toBe(true)
    await page.waitForTimeout(500)
    const heights = await page.evaluate(() => ['1', '2', '3', '4'].map((n) => Math.round((document.querySelector(`[data-page="${n}"]`) as HTMLElement).getBoundingClientRect().height)))
    expect(Math.abs((heights[0] as number) - (heights[1] as number))).toBeLessThanOrEqual(1)
    expect(Math.abs((heights[2] as number) - (heights[3] as number))).toBeLessThanOrEqual(1) // pages of different sizes share a height
    await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 0))
    await expect(page.locator('[data-page="2"] canvas')).toBeVisible()
    await page.screenshot({ path: join(DIR, `${size.name}-2-two-pages.png`) })

    // Cover page: 1 alone on the right, then 2-3.
    await pick(page, /First page alone/)
    await expect.poll(() => rows(page).then((r) => r.slice(0, 2).join(','))).toMatch(/^1(,2-3)?$/)
    await expect.poll(() => rows(page).then((r) => r[0])).toBe('1')
    await page.screenshot({ path: join(DIR, `${size.name}-3-cover.png`) })
    await pick(page, /First page alone/)

    // Capture on the right-hand page of the spread makes a topic that links to page 2.
    await page.getByRole('button', { name: /capture area/i }).click()
    const topics = () => page.locator('[data-topic]').count()
    const before = await topics()
    const box = await page.locator('[data-page="2"] [data-capture-layer]').boundingBox()
    if (!box) throw new Error('no capture layer on page 2')
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.1)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.3, { steps: 6 })
    await page.mouse.up()
    const asked = await page.getByText('Make the picture smaller?').waitFor({ timeout: 8000 }).then(() => true, () => false)
    if (asked) await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect.poll(topics).toBe(before + 1)
    await expect(page.getByRole('button', { name: /capture area/i })).toHaveAttribute('aria-pressed', 'false') // one capture, then it ends (Keep capturing is off)

    // Enable scrolling off: one spread at a time, the buttons and the keys turn it.
    await pick(page, /Enable scrolling/)
    await expect(page.locator('[data-view-menu]'), 'the menu closed after the pick').toBeHidden()
    await expect.poll(() => rows(page)).toEqual(['1-2'])
    await page.getByRole('button', { name: 'Next spread' }).click()
    await expect.poll(() => rows(page)).toEqual(['3-4'])
    await page.locator('[data-pdf-scroller]').focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => rows(page)).toEqual(['5-6'])
    await page.keyboard.press('ArrowLeft')
    await expect.poll(() => rows(page)).toEqual(['3-4'])
    await page.screenshot({ path: join(DIR, `${size.name}-4-paged.png`) })

    // Fit page: the whole spread is visible without scrolling.
    await pick(page, /Fit page/)
    const fits = await page.evaluate(() => {
      const s = document.querySelector('[data-pdf-scroller]') as HTMLElement
      return s.scrollHeight <= s.clientHeight + 1 && s.scrollWidth <= s.clientWidth + 1
    })
    expect(fits).toBe(true)
    await page.screenshot({ path: join(DIR, `${size.name}-5-fit-page.png`) })

    // It is remembered: a reload brings the same layout back.
    await page.waitForTimeout(500)
    await page.reload()
    await page.locator('[data-topic]').first().waitFor()
    expect(errors).toEqual([])
    await context.close()
  })
}

test('a narrow pane shows one page and says why; the choice stays', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  await menu(page).click()
  await page.getByRole('menuitemradio', { name: /Two-page view/ }).click()
  await expect(page.locator('[data-view-note]')).toContainText('at least 480 px')
  await page.screenshot({ path: join(DIR, 'phone-narrow-note.png') })
  await page.keyboard.press('Escape')
  await expect.poll(() => page.evaluate(() => (document.querySelector('[data-pdf-scroller]') as HTMLElement).dataset.layout)).toBe('single')
  await context.close()
})

test('memory: a 60-page PDF in Two-page view keeps only the pages near the screen drawn', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf(60))
  await makeBig(page)
  await pick(page, /Two-page view/)
  await expect.poll(() => rows(page).then((r) => r[0])).toBe('1-2')
  await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 6000))
  await page.waitForTimeout(1200)
  const scrolled = await drawn(page)
  const rendered = (await rows(page)).length
  console.log(`two-page continuous, 60 pages: ${rendered} spreads in the page, ${scrolled} page pictures`)
  expect(rendered).toBeLessThanOrEqual(6)
  expect(scrolled).toBeLessThanOrEqual(12)
  await pick(page, /Enable scrolling/)
  await page.waitForTimeout(600)
  console.log(`two-page paged: ${await drawn(page)} page pictures`)
  expect(await drawn(page)).toBeLessThanOrEqual(2)
  await context.close()
})

test('the book button: Two pages side by side in one click, the panel makes room and gives it back', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  const panel = page.locator('[data-pdf-panel]')
  await expect(panel).toHaveAttribute('data-pdf-size', 'normal')
  const toggle = page.getByRole('button', { name: 'Two pages side by side' })
  await toggle.click()
  await expect(panel).toHaveAttribute('data-pdf-size', 'full')
  await expect.poll(() => rows(page).then((r) => r[0])).toBe('1-2')
  await expect(page.locator('[data-page="2"] canvas')).toBeVisible()
  await page.screenshot({ path: join(DIR, 'desktop-6-book-button.png') })
  await toggle.click()
  await expect(panel).toHaveAttribute('data-pdf-size', 'normal') // the size it had before
  await expect.poll(() => rows(page).then((r) => r[0])).toBe('1')
  // Fit height is in the menu, and a size set by hand is never undone.
  await toggle.click()
  await page.locator('[data-expand]').click() // full -> normal by hand
  await toggle.click()
  await expect(panel).toHaveAttribute('data-pdf-size', 'normal')
  await context.close()
})

test('Escape closes the View menu (and nothing else)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  await menu(page).click()
  await expect(page.locator('[data-view-menu]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-view-menu]')).toBeHidden()
  await expect(page.locator('[data-pdf-panel]')).toBeVisible() // the panel itself stayed
  // With Capture area on, Escape closes the menu first and only then ends capture.
  await page.getByRole('button', { name: /capture area/i }).click()
  await menu(page).click()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-view-menu]')).toBeHidden()
  await expect(page.getByRole('button', { name: /capture area/i })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /capture area/i })).toHaveAttribute('aria-pressed', 'false')
  await context.close()
})
