// Builds two different versions of the app (the current code, and the same code with one extra line) for the deploy-skew test.
import { execSync } from 'node:child_process'
import { appendFileSync, copyFileSync, rmSync } from 'node:fs'

const marker = 'src/editor/pdf/PdfPanel.tsx'
const run = (c) => execSync(c, { stdio: 'inherit' })
rmSync('dist-skew-old', { recursive: true, force: true })
rmSync('dist-skew-new', { recursive: true, force: true })
run('npx vite build --outDir dist-skew-old')
copyFileSync(marker, 'node_modules/.skew-backup')
try {
  appendFileSync(marker, "\nconsole.debug('the next deploy')\n")
  run('npx vite build --outDir dist-skew-new')
} finally {
  copyFileSync('node_modules/.skew-backup', marker)
}
