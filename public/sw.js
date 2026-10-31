/* global self, caches, fetch, Response, URL, setTimeout */
/* Wishtaa Maps service worker.
 *
 * What it does:
 *   - keeps the app itself (its page and scripts) so it opens fast and also with no connection;
 *   - shows an offline page if the app has never been opened on this device;
 *   - receives pictures shared INTO the app from Android ("Share > Wishtaa Maps"), hands them to the page.
 *
 * What it never does:
 *   - touch anything that is not from this site. Google Drive, Google sign-in and every other address are cross-origin, so
 *     they go straight to the network: nothing from them (responses, tokens) is ever read, cached or kept here;
 *   - cache a request that carries an Authorization header or an access token in its address;
 *   - cache a page that is not the app (an error page, a redirect).
 *
 * Updates: the build id below changes with every build, so the browser sees a new worker. It waits (it does NOT take over
 * by itself, which could swap scripts under an open page) until the page asks for it, from the "Update available - reload" bar.
 */
const BUILD = '__BUILD_ID__'
const SHELL = 'wishtaa-shell-' + BUILD
const ASSETS = 'wishtaa-assets' // hashed scripts and styles; kept across builds so a tab left open on an older version still works
const SHARE = 'wishtaa-share' // pictures shared in, until the page takes them
const KEEP = [SHELL, ASSETS, SHARE]
const MAX_ASSETS = 160
const SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const NAV_TIMEOUT_MS = 4000
// Every script and style of this build (the build fills this in), so a map also opens offline: the editor is a separate file.
const PRECACHE = []
const SHELL_FILES = ['/offline.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']

/** Which strategy a request gets. Anything not named here is not touched at all. */
function routeFor(url, request, origin) {
  if (request.method === 'POST' && url.origin === origin && url.pathname === '/share-target') return 'share'
  if (request.method !== 'GET') return 'none'
  if (url.origin !== origin) return 'none' // Google Drive, sign-in, fonts, everything else: straight to the network
  if (request.headers && request.headers.has('authorization')) return 'none'
  if (/[?&](access_token|token|key|code)=/i.test(url.search)) return 'none'
  if (url.pathname === '/sw.js') return 'none'
  if (request.mode === 'navigate') return 'nav'
  if (url.pathname.startsWith('/assets/')) return 'asset'
  if (SHELL_FILES.includes(url.pathname)) return 'static'
  return 'none'
}

/** True for a response worth keeping: a normal 200 from this site. */
function cacheable(response) {
  return !!response && response.status === 200 && response.type === 'basic'
}

async function precache() {
  const cache = await caches.open(SHELL)
  await cache.addAll(SHELL_FILES)
  // The app's page (every address is the same page) and the scripts and styles it names.
  const page = await fetch('/', { cache: 'reload' })
  if (!cacheable(page) || !/text\/html/.test(page.headers.get('content-type') || '')) throw new Error('The app page could not be read')
  const html = await page.clone().text()
  await cache.put('/', page)
  const assets = await caches.open(ASSETS)
  const urls = [...new Set([...(html.match(/\/assets\/[A-Za-z0-9._~-]+\.(?:js|css)/g) || []), ...PRECACHE])]
  await Promise.all(
    urls.map(async (u) => {
      if (await assets.match(u)) return
      const r = await fetch(u)
      if (cacheable(r)) await assets.put(u, r)
    })
  )
}

async function navigate(request) {
  const cache = await caches.open(SHELL)
  const fallback = async () => (await cache.match('/')) || (await cache.match('/offline.html')) || Response.error()
  try {
    const timeout = new Promise((_, no) => setTimeout(() => no(new Error('slow')), NAV_TIMEOUT_MS))
    const live = await Promise.race([fetch(request), timeout])
    if (cacheable(live) && /text\/html/.test(live.headers.get('content-type') || '')) cache.put('/', live.clone())
    return live
  } catch {
    return fallback()
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS)
  const hit = await cache.match(request)
  if (hit) return hit
  const live = await fetch(request)
  if (cacheable(live)) {
    cache.put(request, live.clone())
    trim(cache)
  }
  return live
}

async function trim(cache) {
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - MAX_ASSETS; i++) await cache.delete(keys[i])
}

async function stale(request) {
  const cache = await caches.open(SHELL)
  const hit = await cache.match(request)
  const refresh = fetch(request)
    .then((r) => (cacheable(r) ? (cache.put(request, r.clone()), r) : r))
    .catch(() => hit)
  return hit || refresh
}

/** A picture sent here from another app: kept for the page, which is opened on /home?shared=<id>. */
async function receiveShare(request) {
  let id = 'none'
  try {
    const form = await request.formData()
    const files = form.getAll('pictures').filter((f) => f && typeof f === 'object' && typeof f.type === 'string' && f.type.startsWith('image/') && f.size > 0)
    if (files.length) {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      const cache = await caches.open(SHARE)
      await Promise.all(
        files.slice(0, 20).map((f, i) =>
          cache.put(
            '/__shared/' + id + '/' + i,
            new Response(f, { headers: { 'Content-Type': f.type, 'X-Name': encodeURIComponent(f.name || 'picture'), 'X-Time': String(Date.now()) } })
          )
        )
      )
    }
  } catch {
    id = 'none'
  }
  return Response.redirect('/home?shared=' + id, 303)
}

async function purgeOldShares() {
  const cache = await caches.open(SHARE)
  for (const key of await cache.keys()) {
    const r = await cache.match(key)
    if (r && Date.now() - Number(r.headers.get('X-Time') || 0) > SHARE_MAX_AGE_MS) await cache.delete(key)
  }
}

self.addEventListener('install', (event) => {
  // No skipWaiting here: an update waits until the person chooses "reload".
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (!KEEP.includes(name)) await caches.delete(name)
      await purgeOldShares()
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const route = routeFor(new URL(request.url), request, self.location.origin)
  if (route === 'none') return // not ours: the browser handles it as if no worker existed
  if (route === 'share') event.respondWith(receiveShare(request))
  else if (route === 'nav') event.respondWith(navigate(request))
  else if (route === 'asset') event.respondWith(asset(request))
  else event.respondWith(stale(request))
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data && event.data.type === 'VERSION' && event.source) event.source.postMessage({ type: 'VERSION', build: BUILD })
})
