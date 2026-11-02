// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { alreadyReloaded, appVersion, clearAppCaches, describeError, errorDetails, isAppCache, isChunkError, RELOAD_GUARD_MS, recoverFromStaleBuild } from './chunkRecovery'
import { ErrorBoundary } from './ErrorBoundary'

beforeEach(() => {
  sessionStorage.clear()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 30))))

describe('recognising a failed load of an old file', () => {
  it('knows the messages browsers give', () => {
    for (const m of [
      'Failed to fetch dynamically imported module: https://maps.wishtaa.com/assets/PdfPanel-abc.js',
      'error loading dynamically imported module: https://x/assets/a.js',
      'Importing a module script failed.',
      'Loading chunk 12 failed.',
      'Unable to preload CSS for /assets/index-1.css',
    ])
      expect(isChunkError(new TypeError(m)), m).toBe(true)
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false)
    expect(isChunkError(null)).toBe(false)
  })
})

describe('recovering once', () => {
  it('clears only the app caches (never the pictures shared in), then reloads once', async () => {
    const store = new Map<string, true>([
      ['wishtaa-assets', true],
      ['wishtaa-shell-abc', true],
      ['wishtaa-share', true],
      ['other', true],
    ])
    vi.stubGlobal('caches', { keys: async () => [...store.keys()], delete: async (n: string) => store.delete(n) })
    const reload = vi.fn()
    expect(await recoverFromStaleBuild(reload)).toBe('reloading')
    expect([...store.keys()].sort()).toEqual(['other', 'wishtaa-share'])
    expect(reload).toHaveBeenCalledTimes(1)
    expect(isAppCache('wishtaa-share')).toBe(false)
  })

  it('cannot loop: a second recovery within a minute does not reload again, and after a minute it may', async () => {
    const reload = vi.fn()
    expect(await recoverFromStaleBuild(reload)).toBe('reloading')
    expect(alreadyReloaded()).toBe(true)
    expect(await recoverFromStaleBuild(reload)).toBe('already-tried')
    expect(reload).toHaveBeenCalledTimes(1)
    expect(alreadyReloaded(Date.now() + RELOAD_GUARD_MS + 1000)).toBe(false)
  })

  it('does not reload by itself when the guard cannot be kept (that could loop)', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const reload = vi.fn()
    expect(await recoverFromStaleBuild(reload)).toBe('already-tried')
    expect(reload).not.toHaveBeenCalled()
  })

  it('clearing caches is harmless where there is no cache storage', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(clearAppCaches()).resolves.toBeUndefined()
  })
})

describe('the error panel says what went wrong', () => {
  const Boom = ({ error }: { error: Error }): never => {
    throw error
  }
  const STALE = new TypeError('Failed to fetch dynamically imported module: https://x/assets/PdfPanel-old.js')

  it('a failed load of the viewer after a deploy: recovers by itself once', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary inline label="The PDF panel">
        <Boom error={STALE} />
      </ErrorBoundary>
    )
    await settle()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert').textContent).toContain('Updating to the new version')
  })

  it('when the automatic reload was already made, it names the problem and offers Reload app, not a loop and not a useless Try again', async () => {
    sessionStorage.setItem('wishtaamaps:stale-reload', String(Date.now() - 20_000)) // a reload was made 20 seconds ago
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    render(
      <ErrorBoundary inline label="The PDF panel">
        <Boom error={STALE} />
      </ErrorBoundary>
    )
    await settle()
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('Could not load the PDF viewer')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload app' })).toBeTruthy()
  })

  it('another failure offers Try again, Reload app, Reopen PDF and Copy details; the details hold no document content', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void written.push(t) } })
    const reopen = vi.fn()
    let boom = true
    const Maybe = () => {
      if (boom) throw new Error('Cannot read properties of undefined')
      return <p>The PDF is showing</p>
    }
    render(
      <ErrorBoundary inline label="The PDF panel" reopen={reopen}>
        <Maybe />
      </ErrorBoundary>
    )
    expect(screen.getByRole('alert').textContent).toContain('The PDF panel ran into a problem')
    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }))
    await settle()
    expect(written[0]).toMatch(/The PDF panel: Error: Cannot read properties/)
    expect(written[0]).toMatch(/Version: /)
    expect(written[0]).toMatch(/Browser: /)
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reopen PDF' }))
    expect(reopen).toHaveBeenCalled()
    boom = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('The PDF is showing')).toBeTruthy()
  })

  it('plain reasons for what a PDF can do', () => {
    expect(describeError(new Error('This PDF is password protected. Enter the password.'), 'The PDF panel').title).toBe('This PDF needs a password')
    expect(describeError(new Error('This PDF is damaged and could not be read.'), 'The PDF panel').title).toBe('Could not read this PDF')
    expect(describeError(new Error('The PDF is not available on this device'), 'The PDF panel').title).toBe('The PDF is not available on this device')
    expect(describeError(new Error('x'), 'The settings panel').title).toBe('The settings panel ran into a problem')
    expect(errorDetails(new Error('boom'), 'The PDF panel')).not.toMatch(/blob:|data:/)
    expect(typeof appVersion()).toBe('string')
  })
})

describe('the host never answers a missing script with the app page', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites: { source: string; destination: string }[]; headers: { source: string; headers: { key: string; value: string }[] }[] }
  // Vercel reads a rewrite source as a path pattern; for the one used here it is the same rule as this expression.
  const source = config.rewrites[0]?.source ?? ''
  const rewritten = (path: string) => new RegExp(`^${source}$`).test(path)

  it('pages go to the app; files under /assets/ and /pdfjs/ do not', () => {
    for (const p of ['/', '/home', '/files', '/map/123', '/kb', '/drive']) expect(rewritten(p), p).toBe(true)
    for (const p of ['/assets/PdfPanel-OLD.js', '/assets/index-abc.css', '/pdfjs/wasm/openjpeg.wasm', '/api/x']) expect(rewritten(p), p).toBe(false)
  })

  it('scripts are kept for a year; the page itself and the service worker are always asked for again', () => {
    const rule = (src: string) => config.headers.find((h) => h.source === src)?.headers.find((x) => x.key === 'Cache-Control')?.value
    expect(rule('/assets/(.*)')).toMatch(/max-age=31536000, immutable/)
    expect(rule('/')).toMatch(/max-age=0, must-revalidate/)
    expect(rule('/sw.js')).toMatch(/no-store/)
  })
})
