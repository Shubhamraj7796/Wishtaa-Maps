import { expect, type Browser, type Page } from '@playwright/test'

/** Shared steps of the notes real-browser tests (a new map, the first note, the next note, boxes). */
export async function newPage(browser: Browser, opts: { width: number; height: number; touch?: boolean; dark?: boolean }) {
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: opts.height }, hasTouch: !!opts.touch, isMobile: !!opts.touch })
  const page = await ctx.newPage()
  await page.goto('/')
  await page.getByText('Blank mind map').first().click()
  await page.getByRole('button', { name: 'Create' }).click()
  await page.waitForURL('**/map/**')
  await page.locator('[data-topic]').first().waitFor()
  if (opts.dark) {
    await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  }
  return { page, ctx }
}

export const dialog = (page: Page) => page.getByRole('dialog', { name: /^Note/ })

export async function fill(page: Page, title: string, text: string) {
  await expect(dialog(page)).toBeVisible()
  await dialog(page).getByLabel('Note title').fill(title)
  await dialog(page).getByLabel('Note text').click()
  await page.keyboard.type(text)
}

/** Opens the first note from the Insert menu (the Notes tab); the others come from the Add a note bar. */
export async function firstNote(page: Page, title: string, text: string) {
  await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
  await page.getByRole('menuitem', { name: 'Notes' }).click()
  await page.getByRole('button', { name: 'Add a note' }).click()
  await fill(page, title, text)
}

/** The next note, from the bar under the side list (the side panel stays usable while a popup is open). */
export async function nextNote(page: Page, title: string, text: string) {
  await page.getByRole('button', { name: 'Add a note' }).click()
  await expect(dialog(page).getByLabel('Note title')).toHaveValue('')
  await fill(page, title, text)
}

export const box = async (page: Page, selector: string) => {
  const b = await page.locator(selector).first().boundingBox()
  if (!b) throw new Error(`no box for ${selector}`)
  return b
}

export type Rect = { x: number; y: number; width: number; height: number }
export const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

/** The tray chip of a minimized note. */
export const chip = (page: Page, title: string) => page.locator('[data-min-note]', { hasText: title })
