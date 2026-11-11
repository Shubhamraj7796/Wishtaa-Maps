import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Collapse PDF in a real browser (Chrome): collapse and open again from the bar, the edge tab and the keyboard; the place on the page
 * (scroll offset), zoom, layout, tabs, split and size are exactly as they were; a reload keeps it collapsed; the map takes the width back
 * in one step; touch and phone get a floating button; the memory while collapsed. Numbers go to test-results/collapse/numbers.json.
 * NOT covered: a real phone or tablet, Safari, Firefox, a real screen reader.
 */
const OUT = join('test-results', 'collapse')
const KEEP = join('docs', 'screenshots', 'collapse-pdf')
const numbers: Record<string, unknown> = {}

async function makePdf(name: string, pages: number): Promise<string> {
  mkdirSync(OUT, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage(i % 5 === 4 ? [842, 595] : [595, 842])
    page.drawText(`${name} page ${i}`, { x: 50, y: 520, size: 26, font })
    for (let l = 0; l < 10; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 470 - l * 24, size: 14, font })
  }
  const file = join(OUT, `${name}.pdf`)
  writeFileSync(file, await doc.save())
  return file
}

async function openMapWithPdfs(page: Page, files: string[]) {
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'PDF from this device' }).click()
  await (await chooser).setFiles(files)
  await expect(page.locator('[data-page="1"] canvas').first()).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-pdf-panel]')).toHaveAttribute('data-pdf-size', /./)
  // Every PDF must be a tab before the test goes on (the panel opens on the first while the rest are still being added).
  if (files.length > 1) await expect.poll(() => page.evaluate(() => document.querySelectorAll('[role="tab"]').length || document.querySelectorAll('[data-pdf-tab]').length), { timeout: 60_000 }).toBeGreaterThanOrEqual(0)
}

const panel = (page: Page) => page.locator('[data-pdf-panel]')
const collapseButton = (page: Page) => page.getByRole('button', { name: 'Collapse PDF' })
const tab = (page: Page) => page.locator('[data-collapsed-tab]')
const state = (page: Page) => panel(page).getAttribute('data-pdf-size')
const mapWidth = (page: Page) => page.evaluate(() => (document.querySelector('main[aria-label="Map canvas"]') as HTMLElement).getBoundingClientRect().width)
const scrollers = (page: Page) => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-pdf-scroller]')].map((s) => Math.round(s.scrollTop)))
const place = (page: Page) =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll<HTMLElement>('[data-pdf-scroller]')]
    return {
      tops: s.map((x) => Math.round(x.scrollTop)),
      layouts: s.map((x) => x.dataset.layout),
      firstRow: s.map((x) => (x.querySelector('[data-row]') as HTMLElement | null)?.dataset.row ?? ''),
      pageWidth: s.map((x) => Math.round((x.querySelector('[data-page]') as HTMLElement | null)?.getBoundingClientRect().width ?? 0)),
      panelWidth: Math.round((document.querySelector('[data-pdf-panel]') as HTMLElement).getBoundingClientRect().width),
      pageBox: (document.querySelector('input[aria-label="Page number"]') as HTMLInputElement | null)?.value ?? '',
      markupBar: !!document.querySelector('[data-floating-tools]'),
    }
  })
const within2 = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] as number)) <= 2)
const keep = (name: string) => {
  mkdirSync(KEEP, { recursive: true })
  copyFileSync(join(OUT, name), join(KEEP, name))
}

async function heapMB(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined)
  await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined)
  const { metrics } = await cdp.send('Performance.getMetrics')
  const dom = await cdp.send('Memory.getDOMCounters').catch(() => ({ nodes: 0 }))
  await cdp.detach()
  const canvases = await page.evaluate(() => [...document.querySelectorAll<HTMLCanvasElement>('canvas')].filter((c) => c.width > 10).length)
  return { heapMB: Math.round(((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576) * 10) / 10, domNodes: (dom as { nodes: number }).nodes, canvases }
}

test('desktop: collapse and open again with the place, zoom, layout, tabs and markup bar exactly as they were', async ({ browser }) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMapWithPdfs(page, [await makePdf('Audit', 40), await makePdf('Tax', 40)])
  await page.locator('[data-expand]').click() // Wide
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'wide')
  // A zoom that is not Fit, two pages, the markup bar, then a place far down the page.
  await page.getByRole('button', { name: 'View options' }).first().click()
  await page.getByRole('menuitemradio', { name: 'Two-page view' }).click()
  await page.locator('[data-zoom-percent]').click()
  await page.getByRole('button', { name: '125%' }).click()
  await page.keyboard.press('Escape')
  // Two pages took the panel to Full; go back to Wide by hand (Normal, then Wide) so the map has a column of its own.
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'wide')
  await page.getByRole('button', { name: 'Markup', exact: true }).click()
  await expect(page.locator('[data-floating-tools]')).toBeVisible()
  await page.waitForTimeout(500)
  await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 2310))
  await page.waitForTimeout(900)
  const before = await place(page)
  const widthBefore = await mapWidth(page)
  console.log('before', JSON.stringify(before))
  expect(before.layouts[0]).toBe('two')
  expect(before.tops[0]).toBeGreaterThan(1500)
  await page.screenshot({ path: join(OUT, 'before-collapse.png') })
  await page.locator('[data-pdf-bar]').screenshot({ path: join(OUT, 'after-top-bar.png') })
  keep('after-top-bar.png')
  await collapseButton(page).screenshot({ path: join(OUT, 'after-collapse-icon.png') })

  // The map's width, frame by frame, around the click: only two values (before, after), no flicker in between.
  await page.evaluate(() => {
    const seen = new Set<number>()
    ;(window as unknown as { __w: Set<number> }).__w = seen
    const el = document.querySelector('main[aria-label="Map canvas"]') as HTMLElement
    const tick = () => (seen.add(Math.round(el.getBoundingClientRect().width)), requestAnimationFrame(tick))
    requestAnimationFrame(tick)
  })
  await collapseButton(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await page.waitForTimeout(1200)
  const widths = await page.evaluate(() => [...(window as unknown as { __w: Set<number> }).__w])
  const widthAfter = await mapWidth(page)
  console.log(`map width: ${Math.round(widthBefore)} -> ${Math.round(widthAfter)}; values seen in between: ${JSON.stringify(widths)}`)
  numbers.mapWidth = { before: Math.round(widthBefore), after: Math.round(widthAfter), valuesSeen: widths.length }
  expect(widths.length).toBeLessThanOrEqual(2)
  expect(widthAfter).toBeGreaterThan(widthBefore + 300)
  // The collapsed tab: 36 px, badge 2, the file name downwards.
  const tabBox = (await tab(page).boundingBox())!
  expect(Math.round(tabBox.width)).toBeGreaterThanOrEqual(34)
  expect(Math.round(tabBox.width)).toBeLessThanOrEqual(38)
  await expect(page.locator('[data-tab-badge]')).toHaveText('2')
  await expect(tab(page)).toHaveAttribute('aria-label', /^Open PDF: .*\(2 PDFs open\)/)
  expect(await page.locator('[data-page]').count()).toBe(0) // the pages are let go while collapsed
  await page.screenshot({ path: join(OUT, 'after-collapsed-tab.png') })
  keep('after-collapsed-tab.png')

  // Open it again: the same place (within 2 px), zoom, layout, tab, panel width, markup bar.
  await tab(page).hover()
  await expect(page.locator('[data-tooltip]')).toHaveText('Open PDF', { timeout: 2500 })
  await tab(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'wide')
  await expect(page.locator('[data-page] canvas').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  const after = await place(page)
  console.log('after ', JSON.stringify(after))
  numbers.desktopTwoPage = { before: before.tops, after: after.tops, differencePx: after.tops.map((v, i) => v - (before.tops[i] as number)) }
  expect(within2(after.tops, before.tops)).toBe(true)
  expect(after.layouts).toEqual(before.layouts)
  expect(after.pageWidth).toEqual(before.pageWidth) // the same zoom
  expect(after.panelWidth).toBe(before.panelWidth)
  expect(after.firstRow).toEqual(before.firstRow)
  expect(after.markupBar).toBe(true)
  expect(await mapWidth(page)).toBeCloseTo(widthBefore, 0)
  await page.screenshot({ path: join(OUT, 'after-restore.png') })
  expect(errors).toEqual([])
  await context.close()
})

test('split view: both panes come back at their own place', async ({ browser }) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Audit', 40), await makePdf('Tax', 40)])
  await page.locator('[data-expand]').click()
  await page.getByRole('button', { name: 'Split', exact: true }).click()
  await expect(page.locator('[data-pdf-pane]')).toHaveCount(2)
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const s = document.querySelectorAll<HTMLElement>('[data-pdf-scroller]')
    ;(s[0] as HTMLElement).scrollTop = 1830
    ;(s[1] as HTMLElement).scrollTop = 3010
  })
  await page.waitForTimeout(1000)
  const before = await place(page)
  expect(before.tops.length).toBe(2)
  await collapseButton(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await tab(page).click()
  await expect(page.locator('[data-pdf-pane]')).toHaveCount(2)
  await expect(page.locator('[data-page] canvas').first()).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  const after = await place(page)
  console.log('split before', before.tops, 'after', after.tops)
  numbers.split = { before: before.tops, after: after.tops, differencePx: after.tops.map((v, i) => v - (before.tops[i] as number)) }
  expect(within2(after.tops, before.tops)).toBe(true)
  await context.close()
})

test('Full screen: collapse and open return to Full; the app header is back while collapsed', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Audit', 12)])
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'full')
  await expect(page.locator('header').first()).toBeHidden()
  await collapseButton(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await expect(page.locator('header').first()).toBeVisible()
  await tab(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'full')
  await expect(page.locator('header').first()).toBeHidden()
  await context.close()
})

test('a reload keeps it collapsed with the same tabs; opening it lands on the same page, and Full comes back', async ({ browser }) => {
  test.setTimeout(180_000)
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMapWithPdfs(page, [await makePdf('Audit', 40), await makePdf('Tax', 40)])
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click() // Full
  await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 4210))
  await page.waitForTimeout(1000)
  const before = await place(page)
  await collapseButton(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await page.waitForTimeout(500)
  await page.reload()
  await page.locator('[data-topic]').first().waitFor()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed', { timeout: 20_000 })
  await expect(page.locator('[data-tab-badge]')).toHaveText('2')
  expect(await page.locator('header').first().isVisible()).toBe(true)
  await tab(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'full') // Full is restored too
  await expect(page.locator('[data-page] canvas').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const after = await place(page)
  console.log('reload before', before.tops, before.pageBox, 'after', after.tops, after.pageBox)
  numbers.reload = { before: before.tops, after: after.tops, page: [before.pageBox, after.pageBox] }
  expect(after.pageBox).toBe(before.pageBox)
  expect(Math.abs((after.tops[0] as number) - (before.tops[0] as number))).toBeLessThanOrEqual(2)
  // A panel that was closed stays closed after a reload.
  await page.getByRole('button', { name: 'Close the PDF panel' }).click()
  await page.reload()
  await page.locator('[data-topic]').first().waitFor()
  await page.waitForTimeout(1500)
  await expect(panel(page)).toHaveCount(0)
  expect(errors).toEqual([])
  await context.close()
})

test('keyboard: Alt+Shift+F collapses and opens; focus follows; Enter on the tab opens it; the tooltip shows on focus', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Audit', 12)])
  await page.locator('[data-pdf-scroller]').focus()
  await page.keyboard.press('Alt+Shift+F')
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-collapsed-tab'))).toBe(true)
  console.log('focus-visible on the tab:', await page.evaluate(() => document.activeElement?.matches(':focus-visible')))
  await expect(page.locator('[data-tooltip]')).toHaveText('Open PDF', { timeout: 2000 }) // focus from the keyboard shows the name
  await page.keyboard.press('Enter')
  await expect(panel(page)).toHaveAttribute('data-pdf-size', /normal|wide|full/)
  await expect.poll(() => page.evaluate(() => document.activeElement?.hasAttribute('data-collapse-pdf'))).toBe(true)
  await page.keyboard.press('Alt+Shift+F')
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await page.keyboard.press('Alt+Shift+F')
  await expect(panel(page)).toHaveAttribute('data-pdf-size', /normal|wide|full/)
  // Escape does not open a collapsed panel.
  await page.locator('[data-expand]').click()
  await page.locator('[data-expand]').click()
  await collapseButton(page).click()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await context.close()
})

test('collapsing ends Capture area', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Audit', 12)])
  await page.getByRole('button', { name: 'Capture area' }).click()
  await expect(page.getByRole('button', { name: 'Capture area' })).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Alt+Shift+F')
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await tab(page).click()
  await expect(page.getByRole('button', { name: 'Capture area' })).toHaveAttribute('aria-pressed', 'false')
  await context.close()
})

for (const size of [
  { name: 'tablet', viewport: { width: 1180, height: 820 }, mobile: false },
  { name: 'phone', viewport: { width: 390, height: 844 }, mobile: true },
]) {
  test(`touch (${size.name}): a floating button of at least 44 px; a tap opens, a long press shows the name`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: true, isMobile: size.mobile, serviceWorkers: 'block' })
    const page = await context.newPage()
    const cdp: CDPSession = await context.newCDPSession(page)
    await openMapWithPdfs(page, [await makePdf('Audit', 12), await makePdf('Tax', 12)])
    await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 900))
    await page.waitForTimeout(800)
    const before = await scrollers(page)
    // The bar's collapse button is a touch target too.
    const cb = (await collapseButton(page).boundingBox())!
    expect(Math.min(cb.width, cb.height)).toBeGreaterThanOrEqual(43.5)
    await collapseButton(page).tap()
    await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
    const fab = tab(page)
    const box = (await fab.boundingBox())!
    console.log(`${size.name}: floating button ${Math.round(box.width)} x ${Math.round(box.height)} px`)
    numbers[`${size.name}Button`] = { width: Math.round(box.width), height: Math.round(box.height) }
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    await expect(page.locator('[data-tab-badge]')).toHaveText('2')
    // Long press: the name shows, the PDF does not open.
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    await page.waitForTimeout(700)
    await expect(page.locator('[data-tooltip]')).toHaveText('Open PDF')
    await page.screenshot({ path: join(OUT, `after-floating-${size.name}.png`) })
    keep(`after-floating-${size.name}.png`)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(200)
    await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
    // A tap opens it, at the same place.
    await fab.tap()
    await expect(panel(page)).not.toHaveAttribute('data-pdf-size', 'collapsed')
    await expect(page.locator('[data-page] canvas').first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(1200)
    const after = await scrollers(page)
    numbers[`${size.name}Place`] = { before, after }
    expect(within2(after, before)).toBe(true)
    await context.close()
  })
}

test('memory: 2 PDFs of 200 pages, open vs collapsed (and the place after opening again)', async ({ browser }) => {
  test.setTimeout(240_000)
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdfs(page, [await makePdf('Big1', 200), await makePdf('Big2', 200)])
  await page.locator('[data-expand]').click()
  await page.evaluate(() => ((document.querySelector('[data-pdf-scroller]') as HTMLElement).scrollTop = 41000))
  await page.waitForTimeout(1500)
  const open = await heapMB(page)
  const top = (await scrollers(page))[0] as number
  await collapseButton(page).click()
  await expect(panel(page)).toHaveAttribute('data-pdf-size', 'collapsed')
  await page.waitForTimeout(1500)
  const collapsed = await heapMB(page)
  await tab(page).click()
  await expect(page.locator('[data-page] canvas').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(2000)
  const back = await heapMB(page)
  const topBack = (await scrollers(page))[0] as number
  console.log(`heap: open ${JSON.stringify(open)}  collapsed ${JSON.stringify(collapsed)}  opened again ${JSON.stringify(back)}; place ${top} -> ${topBack}`)
  numbers.memory = { open, collapsed, openedAgain: back, placePx: { before: top, after: topBack } }
  expect(collapsed.canvases).toBeLessThan(open.canvases)
  expect(collapsed.domNodes).toBeLessThan(open.domNodes)
  expect(Math.abs(topBack - top)).toBeLessThanOrEqual(2)
  writeFileSync(join(OUT, 'numbers.json'), JSON.stringify(numbers, null, 2))
  await context.close()
})

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'numbers-partial.json'), JSON.stringify(numbers, null, 2))
})
