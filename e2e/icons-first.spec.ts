import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, StandardFonts } from 'pdf-lib'

/**
 * Icons first (rule 8) in a real browser (Chrome): the View menu fits without scrolling and every control is an icon with a name; the
 * tooltip shows on hover, on keyboard focus and on a long-press with a finger (which does not run the control), over an open menu and
 * never clipped by it; the top bar, capture bar and markup bar have names and no words. Pictures: test-results/icons and
 * docs/screenshots/icons-first. NOT covered: a real screen reader, and a real finger's long-press feel.
 */
const OUT = join('test-results', 'icons')
const KEEP = join('docs', 'screenshots', 'icons-first')

async function makePdf(): Promise<string> {
  mkdirSync(OUT, { recursive: true })
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= 6; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Icons page ${i}`, { x: 50, y: 780, size: 26, font })
    for (let l = 0; l < 14; l++) page.drawText(`Line ${l + 1}: the quick brown fox jumps over the lazy dog.`, { x: 50, y: 730 - l * 24, size: 14, font })
  }
  const file = join(OUT, 'icons-first.pdf')
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
const tooltip = (page: Page) => page.locator('[data-tooltip]')

test('View menu: icons only, no scrolling, names as tooltips (desktop)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await openMapWithPdf(page, await makePdf())
  await page.getByRole('button', { name: 'Two pages side by side' }).click()
  await page.getByRole('button', { name: 'View options' }).first().click()
  const menu = page.locator('[data-view-menu]')
  await expect(menu).toBeVisible()
  await page.waitForTimeout(300)

  // Fits without scrolling, and is much smaller than the old 600 px menu.
  const m = await menu.evaluate((e) => ({ scrolls: e.scrollHeight > e.clientHeight + 1, h: Math.round(e.getBoundingClientRect().height), w: Math.round(e.getBoundingClientRect().width) }))
  console.log(`View menu after, desktop: ${m.w} x ${m.h} px, scrolls: ${m.scrolls}`)
  expect(m.scrolls).toBe(false)
  expect(m.h).toBeLessThan(330)

  // Every control has a name and no words (the percentage is the one text).
  const bad = await menu.evaluate((root) =>
    [...root.querySelectorAll('button')]
      .filter((b) => !b.getAttribute('aria-label') || !/^(\d+%|–|)$/.test((b.textContent ?? '').trim()) || b.hasAttribute('title'))
      .map((b) => b.outerHTML.slice(0, 80))
  )
  expect(bad).toEqual([])

  // The chosen one is a highlighted background (Two-page view and Light), with no tick.
  await expect(page.getByRole('menuitemradio', { name: 'Two-page view' })).toHaveAttribute('aria-checked', 'true')
  expect(await page.getByRole('menuitemradio', { name: 'Two-page view' }).evaluate((b) => getComputedStyle(b).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
  expect(await menu.innerText()).not.toMatch(/[✓●]/)

  // Hover shows the name after about half a second, in a layer outside the menu.
  const fitPage = page.getByRole('menuitemradio', { name: 'Fit page' })
  await fitPage.hover()
  await expect(tooltip(page)).toHaveCount(0)
  await expect(tooltip(page)).toHaveText('Fit page', { timeout: 2000 })
  expect(await tooltip(page).evaluate((t) => t.parentElement === document.body)).toBe(true)

  // An icon at the bottom edge: its tooltip is NOT clipped by the menu (it is drawn below the menu's edge).
  await page.getByRole('menuitem', { name: 'Reset to default layout' }).hover()
  await expect(tooltip(page)).toContainText('Reset to default layout', { timeout: 2000 })
  const tb = (await tooltip(page).boundingBox())!
  const mb = (await menu.boundingBox())!
  expect(tb.y + tb.height).toBeGreaterThan(mb.y + mb.height) // sticks out below the menu: not cut off
  expect(tb.x).toBeGreaterThanOrEqual(0)
  expect(tb.x + tb.width).toBeLessThanOrEqual(1366)
  await page.screenshot({ path: join(OUT, 'after-tooltip-over-menu.png') })
  keep('after-tooltip-over-menu.png')

  // Moving to the next icon is quick; Escape takes the tooltip away and then closes the menu.
  await page.getByRole('menuitem', { name: 'Presentation mode (coming soon)' }).hover({ force: true })
  await page.keyboard.press('Escape')
  await expect(tooltip(page)).toHaveCount(0)
  expect(errors).toEqual([])
  await context.close()
})

test('tooltip on keyboard focus, and the top bar icons have names and no words (desktop)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  await page.locator('[data-expand]').click() // Wide: every icon has room (Split goes into "..." on a narrow panel)
  const bar = page.locator('[data-pdf-bar]')
  for (const n of ['Capture area', 'Split', 'Markup', 'View options', 'Two pages side by side', 'Focus mode', 'More PDF options']) {
    const b = bar.getByRole('button', { name: n })
    await expect(b, n).toBeVisible()
    expect((await b.innerText()).trim(), `${n} shows words`).toBe('')
  }
  // Keyboard: pressing Tab makes focus "visible", then focusing the control shows its name.
  await page.keyboard.press('Tab')
  await bar.getByRole('button', { name: 'Capture area' }).focus()
  await expect(tooltip(page)).toHaveText('Capture area')
  await bar.getByRole('button', { name: 'Capture area' }).blur()
  await expect(tooltip(page)).toHaveCount(0)
  await context.close()
})

test('long-press on touch shows the name and does not run the control; a tap does (tablet)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, serviceWorkers: 'block' })
  const page = await context.newPage()
  const cdp: CDPSession = await context.newCDPSession(page)
  await openMapWithPdf(page, await makePdf())
  const capture = page.locator('[data-pdf-bar]').getByRole('button', { name: 'Capture area' })
  const box = (await capture.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const touch = async (type: 'touchStart' | 'touchEnd', held = 0) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
    if (held) await page.waitForTimeout(held)
  }
  // A long press (more than 450 ms): the name appears, the control is not pressed.
  await touch('touchStart', 700)
  await expect(tooltip(page)).toHaveText('Capture area')
  await page.screenshot({ path: join(OUT, 'after-tooltip-long-press-tablet.png') })
  keep('after-tooltip-long-press-tablet.png')
  await touch('touchEnd')
  await page.waitForTimeout(150)
  await expect(capture).toHaveAttribute('aria-pressed', 'false')
  // A short tap runs it, with no tooltip.
  await touch('touchStart', 80)
  await touch('touchEnd')
  await expect(capture).toHaveAttribute('aria-pressed', 'true')
  await expect(tooltip(page)).toHaveCount(0, { timeout: 3500 })
  await context.close()
})

test('capture bar and markup bar: icons with names, no native titles (desktop)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  await openMapWithPdf(page, await makePdf())
  await page.getByRole('button', { name: 'Capture area' }).click()
  const bar = page.locator('[data-capture-bar]')
  await expect(bar).toBeVisible()
  for (const n of ['Sub-topic', 'Next sibling', 'New branch']) expect((await bar.getByRole('radio', { name: n }).innerText()).trim()).toBe('')
  await bar.getByRole('radio', { name: 'New branch' }).click()
  await expect(bar.getByRole('radio', { name: 'New branch' })).toHaveAttribute('aria-checked', 'true')
  await bar.getByRole('checkbox', { name: 'Keep capturing' }).click()
  await expect(bar.getByRole('checkbox', { name: 'Keep capturing' })).toHaveAttribute('aria-checked', 'true')
  await bar.getByRole('radio', { name: 'New branch' }).hover()
  await expect(tooltip(page)).toHaveText('New branch', { timeout: 2000 })
  await page.screenshot({ path: join(OUT, 'after-capture-bar.png') })
  keep('after-capture-bar.png')
  await page.getByRole('button', { name: 'Capture area' }).click()
  await page.getByRole('button', { name: 'Markup', exact: true }).click()
  const withTitle = await page.evaluate(() => [...document.querySelectorAll('[data-floating-tools] [title], [data-pdf-bar] [title]')].map((e) => e.outerHTML.slice(0, 80)))
  expect(withTitle).toEqual([])
  await page.locator('[data-tool="pen"]').hover()
  await expect(tooltip(page)).toContainText('Pen', { timeout: 2000 })
  await expect(tooltip(page)).toContainText('(P)')
  await context.close()
})
