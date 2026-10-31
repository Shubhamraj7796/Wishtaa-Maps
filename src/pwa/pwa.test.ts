import { existsSync, readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listenForInstall, promptInstall } from './install'
import { applyUpdate, registerServiceWorker, watchRegistration, type ContainerLike, type RegistrationLike } from './register'
import { SHARE_CACHE, setPendingShare, sharedIdInUrl, takePendingShare, takeSharedPictures } from './share'
import { setPwa, usePwa } from './state'

const reset = () => setPwa({ updateReady: false, canInstall: false, installed: false, standalone: false, offlineReady: false })
beforeEach(reset)

/** A worker as the browser gives one: it has a state, and tells when the state changes. */
function worker(state = 'installing') {
  const handlers: (() => void)[] = []
  return {
    state,
    messages: [] as unknown[],
    postMessage(m: unknown) {
      this.messages.push(m)
    },
    addEventListener: (_t: 'statechange', fn: () => void) => void handlers.push(fn),
    become(next: string) {
      this.state = next
      handlers.forEach((h) => h())
    },
  }
}
function registration(parts: Partial<RegistrationLike> = {}) {
  const handlers: (() => void)[] = []
  const reg: RegistrationLike & { found(): void } = { waiting: null, installing: null, active: null, addEventListener: (_t, fn) => void handlers.push(fn), found: () => handlers.forEach((h) => h()), ...parts }
  return reg
}

describe('"Update available - reload"', () => {
  it('a new version that has downloaded and is waiting switches the bar on', () => {
    const reg = registration({ active: {}, waiting: worker('installed') })
    watchRegistration(reg, { controller: {}, addEventListener: () => undefined })
    expect(usePwa.getState().updateReady).toBe(true)
  })

  it('a new version found later (installing, then installed) switches it on when it is ready, not before', () => {
    const reg = registration({ active: {} })
    watchRegistration(reg, { controller: {}, addEventListener: () => undefined })
    expect(usePwa.getState().updateReady).toBe(false)
    const w = worker('installing')
    reg.installing = w
    reg.found()
    expect(usePwa.getState().updateReady).toBe(false)
    w.become('installed')
    expect(usePwa.getState().updateReady).toBe(true)
  })

  it('the very first install is not an update: it only says the app is ready for offline', () => {
    const reg = registration({ installing: worker('installing') })
    watchRegistration(reg, { controller: null, addEventListener: () => undefined })
    ;(reg.installing as ReturnType<typeof worker>).become('installed')
    expect(usePwa.getState().updateReady).toBe(false)
    expect(usePwa.getState().offlineReady).toBe(true)
  })

  it('choosing reload asks the waiting version to take over, and reloads once it has (not before)', () => {
    const w = worker('installed')
    watchRegistration(registration({ active: {}, waiting: w }), { controller: {}, addEventListener: () => undefined })
    const reload = vi.fn()
    let taken: () => void = () => undefined
    registerServiceWorker({
      production: true,
      win: { document: { readyState: 'loading' }, addEventListener: () => undefined, setInterval: () => 0 } as unknown as Window,
      container: { controller: {}, register: async () => registration(), addEventListener: (_t, fn) => void (taken = fn) } as ContainerLike,
    })
    applyUpdate(reload)
    expect(w.messages).toEqual([{ type: 'SKIP_WAITING' }])
    expect(reload).not.toHaveBeenCalled()
    taken() // the new version is now in charge
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('is only registered in the production build, and only where service workers exist', async () => {
    const register = vi.fn(async () => registration())
    const container = { controller: null, register, addEventListener: () => undefined } as ContainerLike
    const win = { document: { readyState: 'complete' }, addEventListener: () => undefined, setInterval: () => 0 } as unknown as Window
    registerServiceWorker({ production: false, win, container })
    expect(register).not.toHaveBeenCalled()
    registerServiceWorker({ production: true, win, container: undefined })
    expect(() => registerServiceWorker({ production: true, win: undefined, container })).not.toThrow()
    registerServiceWorker({ production: true, win, container })
    await Promise.resolve()
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })

  it('a registration that fails changes nothing: the app works as before', async () => {
    const container = { controller: null, register: async () => Promise.reject(new Error('blocked')), addEventListener: () => undefined } as unknown as ContainerLike
    const win = { document: { readyState: 'complete' }, addEventListener: () => undefined, setInterval: () => 0 } as unknown as Window
    expect(() => registerServiceWorker({ production: true, win, container })).not.toThrow()
    await new Promise((r) => setTimeout(r, 0))
    expect(usePwa.getState()).toMatchObject({ updateReady: false })
  })
})

describe('"Install app"', () => {
  function fakeWindow(standalone = false) {
    const handlers = new Map<string, ((e: Event) => void)[]>()
    return {
      matchMedia: () => ({ matches: standalone }),
      navigator: {},
      addEventListener: (t: string, fn: (e: Event) => void) => void handlers.set(t, [...(handlers.get(t) ?? []), fn]),
      removeEventListener: (t: string, fn: (e: Event) => void) => void handlers.set(t, (handlers.get(t) ?? []).filter((h) => h !== fn)),
      emit: (t: string, e: Event) => (handlers.get(t) ?? []).forEach((h) => h(e)),
    }
  }

  it('keeps the browser offer for its own button, and can use it once', async () => {
    const win = fakeWindow()
    const stop = listenForInstall(win as unknown as Window)
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: vi.fn(async () => undefined), userChoice: Promise.resolve({ outcome: 'accepted' as const }) })
    win.emit('beforeinstallprompt', offer)
    expect(offer.defaultPrevented).toBe(true)
    expect(usePwa.getState().canInstall).toBe(true)
    expect(await promptInstall()).toBe('accepted')
    expect(offer.prompt).toHaveBeenCalledTimes(1)
    expect(usePwa.getState()).toMatchObject({ canInstall: false, installed: true })
    expect(await promptInstall()).toBe('unavailable') // the offer is spent
    stop()
  })

  it('declining leaves the app not installed, and says so', async () => {
    const win = fakeWindow()
    listenForInstall(win as unknown as Window)
    win.emit('beforeinstallprompt', Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => undefined, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) }))
    expect(await promptInstall()).toBe('dismissed')
    expect(usePwa.getState().installed).toBe(false)
  })

  it('knows when it is already the installed app, and when the install finishes', () => {
    const win = fakeWindow(true)
    listenForInstall(win as unknown as Window)
    expect(usePwa.getState().standalone).toBe(true)
    win.emit('appinstalled', new Event('appinstalled'))
    expect(usePwa.getState()).toMatchObject({ installed: true, canInstall: false })
  })

  it('a browser with no install offer (Safari, Firefox) simply has nothing to show', async () => {
    listenForInstall(fakeWindow() as unknown as Window)
    expect(usePwa.getState().canInstall).toBe(false)
    expect(await promptInstall()).toBe('unavailable')
  })
})

describe('pictures shared into the app', () => {
  class Store {
    map = new Map<string, Response>()
    async match(k: string) {
      return this.map.get(k)?.clone()
    }
    async delete(k: string) {
      return this.map.delete(k)
    }
  }
  const storage = (store: Store) => ({ open: async (n: string) => (n === SHARE_CACHE ? store : new Store()) }) as unknown as CacheStorage
  const put = (s: Store, id: string, i: number, body: string, type: string, name: string) => s.map.set(`/__shared/${id}/${i}`, new Response(body, { headers: { 'Content-Type': type, 'X-Name': encodeURIComponent(name) } }))

  it('reads the id from the address, and ignores anything odd', () => {
    expect(sharedIdInUrl('?shared=abc123')).toBe('abc123')
    expect(sharedIdInUrl('?shared=none')).toBe('none')
    expect(sharedIdInUrl('')).toBeNull()
    expect(sharedIdInUrl('?shared=../../etc')).toBeNull()
    expect(sharedIdInUrl('?shared=')).toBeNull()
  })

  it('takes the pictures in order with their names and types, and removes them from the cache', async () => {
    const s = new Store()
    put(s, 'k1', 0, 'AAA', 'image/png', 'one.png')
    put(s, 'k1', 1, 'BBBB', 'image/jpeg', 'two photo.jpg')
    put(s, 'other', 0, 'ZZ', 'image/png', 'not-mine.png')
    const files = await takeSharedPictures('k1', storage(s))
    expect(files.map((f) => [f.name, f.type, f.size])).toEqual([
      ['one.png', 'image/png', 3],
      ['two photo.jpg', 'image/jpeg', 4],
    ])
    expect([...s.map.keys()]).toEqual(['/__shared/other/0']) // theirs stay; ours are gone
    expect(await takeSharedPictures('k1', storage(s))).toEqual([]) // taken once
  })

  it('"none" and a missing cache give nothing, never an error', async () => {
    expect(await takeSharedPictures('none', storage(new Store()))).toEqual([])
    expect(await takeSharedPictures('abc', undefined)).toEqual([])
  })

  it('a picture waits for the one file it was meant for, and is handed over once', () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    setPendingShare({ fileId: 'f1', files: [file], target: { kind: 'child', parentId: 't1' } })
    expect(takePendingShare('other')).toBeNull()
    expect(takePendingShare('f1')?.files).toEqual([file])
    expect(takePendingShare('f1')).toBeNull()
  })
})

describe('the web app manifest', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'))
  const sw = readFileSync('public/sw.js', 'utf8')

  it('has what a browser needs to offer the install', () => {
    expect(manifest).toMatchObject({ name: 'Wishtaa Maps', display: 'standalone', start_url: '/home', scope: '/' })
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i)
    const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose === 'maskable' ? ' maskable' : ''}`)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512 maskable']))
  })

  it('every icon exists, and the PNGs are the size they say', () => {
    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      const path = 'public' + icon.src
      expect(existsSync(path), path).toBe(true)
      if (icon.type === 'image/png') {
        const png = readFileSync(path)
        const [w, h] = icon.sizes.split('x').map(Number)
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([w, h])
      }
    }
  })

  it('the share target posts pictures to the address the worker answers, under the name it reads', () => {
    const t = manifest.share_target
    expect(t).toMatchObject({ action: '/share-target', method: 'POST', enctype: 'multipart/form-data' })
    expect(t.params.files[0].name).toBe('pictures')
    expect(sw).toContain("'/share-target'")
    expect(sw).toContain("form.getAll('pictures')")
    expect(t.params.files[0].accept.every((a: string) => a.startsWith('image/'))).toBe(true) // pictures only
  })

  it('the page links the manifest and the icons', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain('apple-touch-icon')
    expect(html).toMatch(/name="theme-color"/)
  })

  it('the worker names a build id that the build replaces, and the host never caches the worker', () => {
    expect(sw).toContain("const BUILD = '__BUILD_ID__'")
    const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))
    const swHeaders = vercel.headers.find((h: { source: string }) => h.source === '/sw.js')
    expect(swHeaders.headers).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'Cache-Control', value: expect.stringContaining('no-cache') })]))
  })
})
