/// <reference types="vitest" />
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Stamps the service worker with a version taken from what was built (the page and the names of the hashed scripts, which change
 * whenever the code does). A new deploy then has a different worker, so open copies of the app notice it and offer the update;
 * a rebuild of the same code does not.
 */
function stampServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'stamp-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const sw = join(outDir, 'sw.js')
      if (!existsSync(sw)) return
      const assets = existsSync(join(outDir, 'assets')) ? readdirSync(join(outDir, 'assets')).sort() : []
      const page = existsSync(join(outDir, 'index.html')) ? readFileSync(join(outDir, 'index.html'), 'utf8') : ''
      const build = createHash('sha256').update(page).update(assets.join('|')).digest('hex').slice(0, 12)
      // Every real script and style. The 1,700 tiny clipart-icon files (under 4 KB each, loaded one at a time) are saved as they are used.
      const scripts = assets.filter((n) => /\.(?:js|css)$/.test(n) && !/^pdf/i.test(n) && statSync(join(outDir, 'assets', n)).size >= 4096).map((n) => `/assets/${n}`)
      writeFileSync(sw, readFileSync(sw, 'utf8').replace('__BUILD_ID__', build).replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(scripts)}`))
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  resolve: { alias: { '@': '/src' } },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
})
