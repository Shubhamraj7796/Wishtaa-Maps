// Serves a built folder the way the host does (see vercel.json): a real file is sent as it is, a page address gets the app's page, and
// a missing file under /assets/ or /pdfjs/ is a 404 (never the app's page). `HOST_HTML_FOR_MISSING=1` shows the OLD host behaviour,
// which answered a missing script with the page (the cause of the "PDF panel ran into a problem" after a deploy).
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json' }

export function serve(root, port, { oldHost = false } = {}) {
  const dir = resolve(root)
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0])
    const file = join(dir, normalize(path).replace(/^([/\\]|\.\.)+/, ''))
    const isFile = existsSync(file) && statSync(file).isFile()
    const folderPage = join(file, 'index.html') // a folder with its own page (/privacy), served like the host does
    if (!isFile && path !== '/' && !path.startsWith('/assets/') && existsSync(folderPage)) {
      res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'public, max-age=0, must-revalidate' })
      return res.end(readFileSync(folderPage))
    }
    const headers = (type) => ({ 'Content-Type': type, 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : path === '/sw.js' ? 'no-store' : 'public, max-age=0, must-revalidate' })
    if (isFile) {
      res.writeHead(200, headers(TYPES[extname(file)] ?? 'application/octet-stream'))
      return res.end(readFileSync(file))
    }
    if (!oldHost && (path.startsWith('/assets/') || path.startsWith('/pdfjs/'))) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('Not found')
    }
    res.writeHead(200, headers(TYPES['.html']))
    res.end(readFileSync(join(dir, 'index.html')))
  })
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const server = await serve(process.argv[2] ?? 'dist', Number(process.argv[3] ?? 4173), { oldHost: process.env.HOST_HTML_FOR_MISSING === '1' })
  console.log(`serving on ${JSON.stringify(server.address())}`)
}
