/* global process, console */
// Builds one PDF from the referral panel pictures (a caption above each), using the installed Chrome.
// Run: CHROME_PATH=... node scripts/referral-report-pdf.mjs
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('docs', 'screenshots', 'referral')
const items = [
  ['panel-desktop.png', 'Refer a friend panel, desktop 1366 px (link with Copy and Share icons, counts, months earned, free period, the one note)'],
  ['panel-tablet.png', 'Refer a friend panel, tablet 820 px'],
  ['panel-phone.png', 'Refer a friend panel, phone 390 px (finger-sized icons, no sideways scroll)'],
  ['panel-dark-desktop.png', 'Refer a friend panel, dark mode, with a finished free period date and the cap line'],
  ['invited-by-friend-desktop.png', 'The one quiet line "Invited by a friend" in the sign-in box (only for someone who arrived by a friend link)'],
  ['account-page-desktop.png', 'The same panel as a section of the Account page'],
]
const html = `<html><body style="font-family:Arial,sans-serif;margin:0">${items
  .map(([f, c]) => `<section style="page-break-after:always;padding:16px"><h3 style="margin:0 0 10px 0;font-size:15px">${c}</h3><img style="max-width:100%;max-height:230mm;border:1px solid #ccc" src="data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}"></section>`)
  .join('')}</body></html>`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const page = await browser.newPage()
await page.setContent(html)
await page.pdf({ path: join(dir, 'referral-report.pdf'), format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()
console.log('PDF written')
