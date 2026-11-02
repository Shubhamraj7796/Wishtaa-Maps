import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * The service worker (public/sw.js) is run here in a sandbox with a fake cache, and its listeners are called the way the
 * browser calls them. What matters most: it never touches Google Drive or sign-in traffic, never keeps a token, takes shared
 * pictures, and waits for the person before an update takes over.
 */
const ORIGIN = 'https://maps.wishtaa.com'
const code = readFileSync('public/sw.js', 'utf8').replace('__BUILD_ID__', 'test-build-1')

class FakeCache {
  store = new Map<string, Response>()
  private key = (r: RequestInfo | URL) => new URL(typeof r === 'string' ? r : r instanceof URL ? r.href : r.url, ORIGIN).pathname + new URL(typeof r === 'string' ? r : r instanceof URL ? r.href : r.url, ORIGIN).search
  async match(r: RequestInfo | URL) {
    return this.store.get(this.key(r))?.clone()
  }
  async put(r: RequestInfo | URL, res: Response) {
    this.store.set(this.key(r), res)
  }
  async delete(r: RequestInfo | URL) {
    return this.store.delete(this.key(r))
  }
  async keys() {
    return [...this.store.keys()].map((k) => new Request(ORIGIN + k))
  }
  async addAll(list: string[]) {
    for (const u of list) await this.put(u, await sandboxFetch(u))
  }
}

let caches: Map<string, FakeCache>
let network: (url: string, init?: RequestInit) => Promise<Response>
let fetched: string[]
let listeners: Record<string, ((e: unknown) => void)[]>
let skipWaitingCalled: boolean
let claimed: boolean
const sandboxFetch = (u: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof u === 'string' ? new URL(u, ORIGIN).href : u instanceof URL ? u.href : u.url
  fetched.push(url)
  return network(url, init)
}

class SandboxResponse extends Response {
  static redirect(url: string | URL, status?: number) {
    return Response.redirect(new URL(String(url), ORIGIN).href, status)
  }
}

function load() {
  listeners = {}
  skipWaitingCalled = false
  claimed = false
  caches = new Map()
  const cacheStorage = {
    open: async (n: string) => {
      if (!caches.has(n)) caches.set(n, new FakeCache())
      return caches.get(n) as FakeCache
    },
    keys: async () => [...caches.keys()],
    delete: async (n: string) => caches.delete(n),
  }
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, fn: (e: unknown) => void) => void (listeners[t] ??= []).push(fn),
    skipWaiting: () => void (skipWaitingCalled = true),
    clients: { claim: async () => void (claimed = true) },
  }
  const ctx = { self, caches: cacheStorage, fetch: sandboxFetch, Response: SandboxResponse, URL, setTimeout, Promise, Date, Math, Request, Headers }
  return runInNewContext(code + '\n;({ routeFor, cacheable })', ctx) as { routeFor: (u: URL, r: Request, origin: string) => string; cacheable: (r: Response) => boolean }
}

/** A response the way the browser gives one from this site (type "basic"). */
const basic = (body: string, type = 'text/html', kind = 'basic') => {
  const r = new Response(body, { status: 200, headers: { 'Content-Type': type } })
  Object.defineProperty(r, 'type', { value: kind })
  return r
}
/** A request the way the browser gives one to the worker (Node cannot make one in "navigate" mode, so it is a plain object). */
const asRequest = (url: string, init: RequestInit = {}, mode = 'cors') => ({ url, method: init.method ?? 'GET', headers: new Headers(init.headers), mode }) as unknown as Request
const PAGE = '<html><script type="module" src="/assets/index-abc123.js"></script><link rel="stylesheet" href="/assets/index-def456.css"></html>'

const fire = async (type: string, event: Record<string, unknown>) => {
  const pending: Promise<unknown>[] = []
  const e = { ...event, waitUntil: (p: Promise<unknown>) => void pending.push(p) }
  for (const fn of listeners[type] ?? []) fn(e)
  await Promise.all(pending)
}
/** Sends a request through the worker; returns undefined when the worker did not take it. */
async function request(url: string, init: RequestInit & { mode?: RequestMode } = {}): Promise<Response | undefined> {
  const req = asRequest(url, init, init.mode ?? 'cors')
  let answer: Promise<Response> | undefined
  for (const fn of listeners.fetch ?? []) fn({ request: req, respondWith: (p: Promise<Response>) => void (answer = p) })
  return answer
}

beforeEach(() => {
  fetched = []
  network = async (url) => {
    const p = new URL(url).pathname
    if (p === '/') return basic(PAGE)
    if (p.startsWith('/assets/')) return basic('/* script */', 'text/javascript')
    if (p === '/offline.html') return basic('<h1>offline</h1>')
    return basic('static', 'application/octet-stream')
  }
  load()
})

describe('what the worker touches', () => {
  it('never touches Google Drive, Google sign-in or any other address that is not this site', async () => {
    for (const url of [
      'https://www.googleapis.com/drive/v3/files?q=x',
      'https://www.googleapis.com/drive/v3/files/abc123?fields=id,headRevisionId,md5Checksum,modifiedTime,appProperties',
      'https://www.googleapis.com/drive/v3/files/abc123?alt=media',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      'https://accounts.google.com/gsi/client',
      'https://apis.google.com/js/api.js',
      'https://oauth2.googleapis.com/token',
      'https://fonts.gstatic.com/s/x.woff2',
      'https://example.com/anything',
    ]) {
      expect(await request(url), url).toBeUndefined() // not intercepted: the browser goes straight to the network
    }
    expect(fetched).toEqual([])
    expect([...caches.values()].every((c) => c.store.size === 0)).toBe(true)
  })

  it('never keeps a request that carries a token, and never writes with POST, PUT, PATCH or DELETE', async () => {
    expect(await request(ORIGIN + '/assets/x.js', { headers: { Authorization: 'Bearer secret' } })).toBeUndefined()
    expect(await request(ORIGIN + '/assets/x.js?access_token=abc')).toBeUndefined()
    for (const method of ['PUT', 'PATCH', 'DELETE']) expect(await request(ORIGIN + '/assets/x.js', { method })).toBeUndefined()
    expect(await request(ORIGIN + '/other', { method: 'POST', body: 'x' })).toBeUndefined()
    expect(fetched).toEqual([])
  })

  it('leaves its own file and anything it does not know to the network', async () => {
    expect(await request(ORIGIN + '/sw.js')).toBeUndefined()
    expect(await request(ORIGIN + '/api/anything')).toBeUndefined()
  })
})

describe('the app opens with no connection', () => {
  it('installing saves the page, its scripts and styles, the offline page and the icons', async () => {
    await fire('install', {})
    const shell = caches.get('wishtaa-shell-test-build-1') as FakeCache
    expect([...shell.store.keys()].sort()).toEqual(['/', '/icon-192.png', '/icon-512.png', '/icon.svg', '/manifest.webmanifest', '/offline.html'].sort())
    expect([...(caches.get('wishtaa-assets') as FakeCache).store.keys()].sort()).toEqual(['/assets/index-abc123.js', '/assets/index-def456.css'])
  })

  it('a page opened offline is the saved app; an address anywhere in the app gives the same page', async () => {
    await fire('install', {})
    network = async () => {
      throw new TypeError('offline')
    }
    for (const path of ['/home', '/map/abc', '/files/xyz']) {
      const res = await request(ORIGIN + path, { mode: 'navigate' })
      expect(await res?.text(), path).toBe(PAGE)
    }
  })

  it('with the app page missing from the saved copy and no connection it shows the offline page', async () => {
    await fire('install', {})
    await (caches.get('wishtaa-shell-test-build-1') as FakeCache).delete('/')
    network = async () => {
      throw new TypeError('offline')
    }
    const res = await request(ORIGIN + '/home', { mode: 'navigate' })
    expect(await res?.text()).toBe('<h1>offline</h1>')
  })

  it('online, a page always comes from the network first, so a new deploy is picked up and the saved copy is refreshed', async () => {
    await fire('install', {})
    network = async (url) => (new URL(url).pathname.startsWith('/assets/') ? basic('x') : basic('<html>NEW VERSION</html>'))
    const res = await request(ORIGIN + '/home', { mode: 'navigate' })
    expect(await res?.text()).toBe('<html>NEW VERSION</html>')
    await new Promise((r) => setTimeout(r, 0))
    expect(await (await (caches.get('wishtaa-shell-test-build-1') as FakeCache).match('/'))?.text()).toBe('<html>NEW VERSION</html>')
  })

  it('does not save an error page or a redirect as the app', async () => {
    await fire('install', {})
    network = async () => new Response('<html>Server error</html>', { status: 500, headers: { 'Content-Type': 'text/html' } })
    await request(ORIGIN + '/home', { mode: 'navigate' })
    await new Promise((r) => setTimeout(r, 0))
    expect(await (await (caches.get('wishtaa-shell-test-build-1') as FakeCache).match('/'))?.text()).toBe(PAGE)
  })

  it('scripts are served from the saved copy first, saved when first fetched, and old ones are kept for tabs left open', async () => {
    await fire('install', {})
    fetched.length = 0
    const hit = await request(ORIGIN + '/assets/index-abc123.js')
    expect(await hit?.text()).toBe('/* script */')
    expect(fetched).toEqual([]) // from the saved copy, no network
    await request(ORIGIN + '/assets/chunk-zzz.js')
    expect(fetched).toEqual([ORIGIN + '/assets/chunk-zzz.js'])
    expect((caches.get('wishtaa-assets') as FakeCache).store.has('/assets/chunk-zzz.js')).toBe(true)
  })

  it('a failed script request is not saved', async () => {
    network = async () => new Response('nope', { status: 404 })
    await request(ORIGIN + '/assets/missing.js')
    expect((caches.get('wishtaa-assets') as FakeCache | undefined)?.store.size ?? 0).toBe(0)
  })
})

describe('updates', () => {
  it('a new version waits: installing does NOT take over, and activating clears only the previous version', async () => {
    caches.set('wishtaa-shell-old-build', new FakeCache())
    caches.set('some-other-cache', new FakeCache())
    await fire('install', {})
    expect(skipWaitingCalled).toBe(false) // it waits for the person to choose "reload"
    await fire('activate', {})
    expect([...caches.keys()].sort()).toEqual(['wishtaa-assets', 'wishtaa-share', 'wishtaa-shell-test-build-1'])
    expect(claimed).toBe(true)
  })

  it('takes over only when the page asks', () => {
    for (const fn of listeners.message ?? []) fn({ data: { type: 'SOMETHING_ELSE' } })
    expect(skipWaitingCalled).toBe(false)
    for (const fn of listeners.message ?? []) fn({ data: { type: 'SKIP_WAITING' } })
    expect(skipWaitingCalled).toBe(true)
  })

  it('an install that cannot read the app page fails, so a broken deploy never replaces a working one', async () => {
    network = async () => new Response('<html>Bad gateway</html>', { status: 502 })
    await expect(fire('install', {})).rejects.toThrow()
  })
})

describe('pictures shared into the app', () => {
  const share = (files: File[], extra: Record<string, string> = {}) => {
    const form = new FormData()
    for (const f of files) form.append('pictures', f)
    for (const [k, v] of Object.entries(extra)) form.append(k, v)
    return new Request(ORIGIN + '/share-target', { method: 'POST', body: form })
  }
  const send = async (req: Request) => {
    let answer: Promise<Response> | undefined
    for (const fn of listeners.fetch ?? []) fn({ request: req, respondWith: (p: Promise<Response>) => void (answer = p) })
    return answer
  }

  it('keeps each picture and sends the app to /home?shared=<id> (a redirect, so a reload does not share again)', async () => {
    const res = await send(share([new File(['aaa'], 'one.png', { type: 'image/png' }), new File(['bbbb'], 'two photo.jpg', { type: 'image/jpeg' })], { title: 'x', text: 'y' }))
    expect(res?.status).toBe(303)
    const to = new URL(res?.headers.get('Location') ?? '')
    expect(to.pathname).toBe('/home')
    const id = to.searchParams.get('shared') as string
    expect(id).toMatch(/^[a-z0-9]{6,}$/)
    const cache = caches.get('wishtaa-share') as FakeCache
    expect([...cache.store.keys()]).toEqual([`/__shared/${id}/0`, `/__shared/${id}/1`])
    const second = await cache.match(`/__shared/${id}/1`)
    expect(second?.headers.get('Content-Type')).toBe('image/jpeg')
    expect(decodeURIComponent(second?.headers.get('X-Name') ?? '')).toBe('two photo.jpg')
    expect(await second?.text()).toBe('bbbb')
  })

  it('keeps only pictures: other files are left out, and a share with none says so', async () => {
    const res = await send(share([new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }), new File([''], 'empty.png', { type: 'image/png' })]))
    expect(new URL(res?.headers.get('Location') ?? '').searchParams.get('shared')).toBe('none')
    expect((caches.get('wishtaa-share') as FakeCache | undefined)?.store.size ?? 0).toBe(0)
  })

  it('a damaged share does not break the app: it ends on /home?shared=none', async () => {
    const res = await send(new Request(ORIGIN + '/share-target', { method: 'POST', body: 'not a form', headers: { 'Content-Type': 'text/plain' } }))
    expect(res?.status).toBe(303)
    expect(new URL(res?.headers.get('Location') ?? '').searchParams.get('shared')).toBe('none')
  })

  it('shares older than a day are cleared when the worker starts', async () => {
    const cache = (await load2()).share
    await cache.put('/__shared/old/0', new Response('x', { headers: { 'X-Time': String(Date.now() - 2 * 24 * 3600 * 1000) } }))
    await cache.put('/__shared/new/0', new Response('y', { headers: { 'X-Time': String(Date.now()) } }))
    await fire('activate', {})
    expect([...cache.store.keys()]).toEqual(['/__shared/new/0'])
  })
})

async function load2() {
  const share = new FakeCache()
  caches.set('wishtaa-share', share)
  return { share }
}

describe('the route table', () => {
  it('names the strategy for each kind of request', () => {
    const { routeFor } = load()
    const r = (url: string, init: RequestInit = {}, mode?: string) => routeFor(new URL(url), asRequest(url, init, mode), ORIGIN)
    expect(r(ORIGIN + '/home', {}, 'navigate')).toBe('nav')
    expect(r(ORIGIN + '/assets/a.js')).toBe('asset')
    expect(r(ORIGIN + '/icon-192.png')).toBe('static')
    expect(r(ORIGIN + '/share-target', { method: 'POST', body: 'x' })).toBe('share')
    expect(r('https://www.googleapis.com/drive/v3/files')).toBe('none')
    expect(r(ORIGIN + '/other.json')).toBe('none')
  })

  it('only a plain 200 from this site is worth keeping', () => {
    const { cacheable } = load()
    expect(cacheable(basic('x'))).toBe(true)
    expect(cacheable(new Response('x', { status: 500 }))).toBe(false)
    expect(cacheable(basic('x', 'text/html', 'opaque'))).toBe(false)
  })
})


describe('after a deploy removed a file an older tab still asks for', () => {
  const OLD_CHUNK = `${ORIGIN}/assets/PdfPanel-OLD123.js`

  it('never keeps an HTML page under a script’s address, and does not serve one it kept before', async () => {
    // The host answers every unknown address with the app's page (200, text/html).
    network = async (url) => (new URL(url).pathname.startsWith('/assets/PdfPanel-OLD') ? basic(PAGE) : basic('/* script */', 'text/javascript'))
    const first = await request(OLD_CHUNK)
    expect(await (first as Response).text()).toContain('<html>') // it is passed on as it came, so the failure is honest...
    const kept = await caches.get('wishtaa-assets')?.match(OLD_CHUNK)
    expect(kept).toBeUndefined() // ...but it is not kept
    // A page kept by an older version of the worker is forgotten and fetched again.
    await (await Promise.resolve(caches.get('wishtaa-assets') ?? new FakeCache())).put(OLD_CHUNK, basic(PAGE))
    network = async () => basic('/* the real script */', 'text/javascript')
    const again = await request(OLD_CHUNK)
    expect(await (again as Response).text()).toContain('real script')
  })

  it('a real script is still kept, and answered from the keeping afterwards', async () => {
    await request(`${ORIGIN}/assets/PdfPanel-NEW456.js`)
    fetched = []
    const hit = await request(`${ORIGIN}/assets/PdfPanel-NEW456.js`)
    expect(await (hit as Response).text()).toContain('script')
    expect(fetched).toEqual([])
  })

  it('on activating, removes any page an older worker left under a script’s address, and keeps the real scripts', async () => {
    const cache = new FakeCache()
    caches.set('wishtaa-assets', cache)
    await cache.put(`${ORIGIN}/assets/Poisoned-1.js`, basic(PAGE))
    await cache.put(`${ORIGIN}/assets/Real-2.js`, basic('/* ok */', 'text/javascript'))
    await fire('activate', {})
    expect(await cache.match(`${ORIGIN}/assets/Poisoned-1.js`)).toBeUndefined()
    expect(await cache.match(`${ORIGIN}/assets/Real-2.js`)).toBeDefined()
  })
})
