import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The floating action buttons in the brand green: the pictures for the report (set FAB_TAG=before or after) and the measured colours.
 * Phone-size runs use a touch context (a coarse pointer), as a real phone does.
 */
const SHOTS = join('docs', 'screenshots', 'brand-fab')
mkdirSync(SHOTS, { recursive: true })
const TAG = process.env.FAB_TAG ?? 'after'

for (const scheme of ['light', 'dark'] as const) {
  for (const [name, size, touch] of [
    ['desktop', { width: 1366, height: 768 }, false],
    ['phone', { width: 390, height: 780 }, true],
  ] as const) {
    test(`the task icon on a note: ${scheme}, ${name} (${TAG})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: size, colorScheme: scheme, hasTouch: touch, isMobile: touch })
      const page = await ctx.newPage()
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await page.goto('/')
      await page.getByText('Blank mind map').first().click()
      await page.getByRole('button', { name: 'Create' }).click()
      await page.waitForURL('**/map/**')
      await page.locator('[data-topic]').first().waitFor()
      if (scheme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      await page.locator('[aria-haspopup="menu"][aria-label^="Insert"]').first().click()
      await page.getByRole('menuitem', { name: 'Notes' }).click()
      await page.getByRole('button', { name: 'Add a note' }).click()
      const dialog = page.getByRole('dialog', { name: /^Note/ })
      await expect(dialog).toBeVisible()
      await page.getByLabel('Note text').click()
      await page.keyboard.type('Order the stock before Friday')
      const icon = dialog.getByRole('button', { name: 'Add task details' })
      await expect(icon).toBeVisible()
      const box = await icon.boundingBox()
      expect(Math.round(box?.width ?? 0)).toBe(44)
      expect(Math.round(box?.height ?? 0)).toBe(44)
      await page.screenshot({ path: join(SHOTS, `note-icon-${scheme}-${name}-${TAG}.png`) })
      const css = await icon.evaluate((el) => {
        const s = getComputedStyle(el)
        const root = getComputedStyle(document.documentElement)
        return { bg: s.backgroundColor, color: s.color, brand: root.getPropertyValue('--c-brand').trim(), ink: root.getPropertyValue('--c-brand-ink').trim() }
      })
      console.log(JSON.stringify({ scheme, name, tag: TAG, ...css }))
      if (TAG === 'after') {
        const rgb = (v: string) => v.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number).join(' ')
        expect(rgb(css.bg)).toBe(css.brand)
        expect(rgb(css.color)).toBe(css.ink)
        // Focus ring (keyboard): visible and in the brand colour.
        await icon.focus()
        await page.keyboard.press('Shift+Tab')
        await page.keyboard.press('Tab')
        const ring = await icon.evaluate((el) => getComputedStyle(el).outlineStyle + ' ' + getComputedStyle(el).outlineWidth)
        expect(ring).toMatch(/solid 2px/)
      }
      expect(errors).toEqual([])
      await ctx.close()
    })
  }
}

test('the touch-only pill of the settings panel is brand green on a touch screen', async ({ browser }) => {
  for (const scheme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })
    const page = await ctx.newPage()
    await page.goto('/')
    await page.getByText('Blank mind map').first().click()
    await page.getByRole('button', { name: 'Create' }).click()
    await page.waitForURL('**/map/**')
    await page.locator('[data-topic]').first().waitFor()
    if (scheme === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).click()
    const closeSheet = page.getByRole('button', { name: 'Close the settings panel' })
    if (await closeSheet.isVisible()) await closeSheet.click() // the phone sheet may start open; closing it leaves the floating pill
    const pill = page.getByTestId('panel-touch-button')
    await expect(pill).toBeVisible({ timeout: 5000 })
    {
      const box = await pill.boundingBox()
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
      const css = await pill.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }))
      expect(css.bg).toBe(scheme === 'light' ? 'rgb(13, 148, 136)' : 'rgb(45, 212, 191)')
      expect(css.color).toBe(scheme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(6, 30, 28)')
      await page.screenshot({ path: join(SHOTS, `settings-pill-${scheme}-phone-${TAG}.png`) })
    }
    await ctx.close()
  }
})
