// Builds one PDF from the notes layout pictures (a caption above each), using the installed Chrome.
// Run: CHROME_PATH=... node scripts/notes-report-pdf.mjs
import { chromium } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = join('docs', 'screenshots', 'notes-layout')
const items = [
  ['beside-panel-1366.png', 'Popup beside the side panel, 1366 px: the open note is highlighted in the Notes list'],
  ['beside-panel-1024.png', 'Popup beside the side panel, 1024 px'],
  ['beside-panel-768.png', 'Popup beside the side panel, 768 px (the tightest case)'],
  ['beside-panel-dark-1366.png', 'Popup beside the side panel, dark mode'],
  ['header-prev-next-1366.png', 'Header "Note n of m" with Previous / Next, Minimize, size and delete icons'],
  ['tray-three-light.png', 'Minimized tray with three chips'],
  ['tray-three-dark.png', 'Minimized tray with three chips, dark mode'],
  ['tray-with-open-popup-light.png', 'Tray with three chips while a fourth note is open (the popup leaves the tray strip free)'],
  ['tray-with-open-popup-dark.png', 'Same, dark mode'],
  ['add-note-bar-desktop.png', 'Sticky "Add a note" bar under a long list, desktop'],
  ['add-note-bar-dark-desktop.png', 'Sticky "Add a note" bar, dark mode'],
  ['add-note-bar-phone.png', '"Add a note" bar on a phone-size window'],
  ['phone-notes-list-icon.png', 'Phone: the Notes list icon in the popup header opens the list on top (active note highlighted)'],
  ['tray-phone.png', 'Phone: minimized tray, bottom left, short of the floating Style button'],
  ['tray-phone-with-sheet.png', 'Phone: tray above the open bottom sheet (it covers nothing of it)'],
]
const html = `<html><body style="font-family:Arial,sans-serif;margin:0">${items
  .map(([f, c]) => `<section style="page-break-after:always;padding:16px"><h3 style="margin:0 0 10px 0;font-size:15px">${c}</h3><img style="max-width:100%;max-height:230mm;border:1px solid #ccc" src="data:image/png;base64,${readFileSync(join(dir, f)).toString('base64')}"></section>`)
  .join('')}</body></html>`
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const page = await browser.newPage()
await page.setContent(html)
await page.pdf({ path: join(dir, 'notes-layout-report.pdf'), format: 'A4', margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' } })
await browser.close()
writeFileSync(join(dir, '.keep'), '')
console.log('PDF written')
