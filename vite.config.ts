/// <reference types="vitest" />
import { createHash } from 'node:crypto'
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
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

/**
 * pdf.js reads fonts for the standard PDF typefaces, colour profiles, CJK character maps and its JPEG 2000 / JBIG2 / colour decoders from
 * separate files. They are served from /pdfjs/ (copied out of the package into the build; served straight from it by the dev server), so
 * they come from this site with no other host involved. They are fetched only when a PDF needs them, and are not in the offline list.
 */
function pdfjsData(): Plugin {
  const root = join('node_modules', 'pdfjs-dist')
  const dirs = ['wasm', 'standard_fonts', 'cmaps', 'iccs']
  const skip = (src: string) => /quickjs/i.test(src) // the scripting engine is never used
  return {
    name: 'pdfjs-data',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const rel = normalize(decodeURIComponent((req.url ?? '').split('?')[0] ?? '')).replace(/^([/\\]|\.\.)+/, '')
        const file = join(root, rel)
        if (!dirs.includes(rel.split(/[/\\]/)[0] ?? '') ||!existsSync(file) || !statSync(file).isFile()) return next()
        res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream')
        res.end(readFileSync(file))
      })
    },
    closeBundle() {
      for (const d of dirs) if (existsSync(join(root, d))) cpSync(join(root, d), join('dist', 'pdfjs', d), { recursive: true, filter: (s) => !skip(s) })
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker(), pdfjsData()],
  resolve: { alias: { '@': '/src' } },
  test: { environment: 'node', include: ['src/**/*.test.{ts,tsx}'] },
})
