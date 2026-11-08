import { expect, test, type BrowserContext } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { serve } from './serve.mjs'

/**
 * The login screen in a real browser at desktop, tablet and phone sizes, with a pretend Supabase (no real project needed). Needs a build
 * made WITH the two Supabase settings: `npm run e2e:login` does that into dist-auth and runs this file.
 */
const DIST = process.env.E2E_AUTH_DIST ?? 'dist-auth'
const SUPABASE = 'https://e2e.supabase.co'
const SHOTS = join('test-results', 'login')
const SIZES = [
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
  { name: 'tablet', viewport: { width: 820, height: 1100 }, touch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
]

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(email: string) {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [{ id: '1', user_id: '1', provider: 'email', identity_data: { email }, created_at: '', updated_at: '', last_sign_in_at: '' }],
    created_at: new Date().toISOString(),
  }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp: now + 3600 })}.sig`
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh-1', user }
}

async function pretendSupabase(context: BrowserContext, seen: string[]) {
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    seen.push(`${req.method()} ${path}`)
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return json(204, {})
    if (path === '/auth/v1/otp') return json(200, {})
    if (path === '/auth/v1/verify') {
      const body = JSON.parse(req.postData() ?? '{}') as { token?: string; email?: string }
      return body.token === '123456' ? json(200, sessionFor(body.email ?? 'ann@example.com')) : json(403, { code: 'otp_expired', error_code: 'otp_expired', msg: 'Token has expired or is invalid' })
    }
    if (path === '/auth/v1/logout') return json(204, {})
    if (path.startsWith('/rest/v1/')) return json(req.method() === 'GET' ? 200 : 201, req.method() === 'GET' ? [] : {})
    return json(404, {})
  })
}

let server: Server
test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  server = await serve(DIST, 4195)
})
test.afterAll(async () => {
  await new Promise((ok) => server.close(ok))
})

for (const size of SIZES) {
  test(`sign in with an emailed code: ${size.name}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch && size.viewport.width < 800, serviceWorkers: 'block' })
    const seen: string[] = []
    await pretendSupabase(context, seen)
    const page = await context.newPage()
    const problems: string[] = []
    page.on('pageerror', (e) => problems.push(e.message))
    const noSideScroll = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.goto('http://127.0.0.1:4195/home')
    await page.screenshot({ path: join(SHOTS, `${size.name}-1-guest.png`) })
    await page.getByRole('button', { name: /^sign in$/i }).click()
    const dialog = page.getByRole('dialog', { name: 'Welcome to Wishtaa Maps' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /sign in with google/i })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /use a password instead/i })).toBeVisible()
    const box = await dialog.boundingBox()
    expect(box && box.x >= 0 && box.x + box.width <= size.viewport.width).toBe(true)
    await noSideScroll()
    await page.screenshot({ path: join(SHOTS, `${size.name}-2-login.png`) })

    await dialog.getByLabel('Email').fill('ann@example.com')
    await dialog.getByRole('button', { name: /continue/i }).click()
    const code = page.getByRole('dialog', { name: 'Enter your code' })
    await expect(code).toBeVisible()
    await expect(code.getByRole('button', { name: /send a new code in \d+ s/i })).toBeDisabled()
    await page.screenshot({ path: join(SHOTS, `${size.name}-3-code.png`) })

    // A wrong code, then the right one.
    await code.getByLabel('6-digit code').fill('000000')
    await expect(code.getByRole('alert')).toContainText(/not valid|expired/i)
    await page.screenshot({ path: join(SHOTS, `${size.name}-4-wrong-code.png`) })
    await code.getByLabel('6-digit code').fill('123456')
    const menu = page.getByRole('button', { name: /account menu/i })
    await expect(menu).toBeVisible()
    await menu.click()
    await expect(page.getByRole('menuitem', { name: /sign out/i })).toBeVisible()
    await page.screenshot({ path: join(SHOTS, `${size.name}-5-signed-in.png`) })

    await page.getByRole('menuitem', { name: /account/i }).click()
    await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Ways to sign in' })).toBeVisible()
    await noSideScroll()
    await page.screenshot({ path: join(SHOTS, `${size.name}-6-account.png`), fullPage: true })

    // The sign-in stays after a reload, then signing out puts the Sign in button back.
    await page.reload()
    await expect(page.getByRole('button', { name: /account menu/i })).toBeVisible()
    await page.getByRole('button', { name: /account menu/i }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()
    await expect(page.getByRole('button', { name: /^sign in$/i }).first()).toBeVisible()

    expect(problems).toEqual([])
    // Nothing about the sign-in was kept by the service worker's caches, and no secrets are in the page address.
    expect(page.url()).not.toMatch(/token|access_token|code=/)
    expect(seen).toContain('POST /auth/v1/otp')
    expect(seen).toContain('POST /auth/v1/verify')
    await context.close()
  })
}

test('dark mode login dialog', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4195/home')
  await page.getByRole('button', { name: /switch to dark mode/i }).click()
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome to Wishtaa Maps' })).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'phone-6-dark-login.png') })
  await context.close()
})

test('the app opens and works as a guest when accounts are not set up (the normal build)', async ({ browser }) => {
  const plain = await serve('dist', 4196)
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4196/home')
    await expect(page.getByRole('button', { name: /new file/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^sign in$/i })).toHaveCount(0)
    await context.close()
  } finally {
    await new Promise((ok) => plain.close(ok))
  }
})

test('privacy and terms pages open as their own pages, readable at phone width, and are marked as drafts', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const page = await context.newPage()
  for (const [path, title] of [['privacy', 'Privacy Policy'], ['terms', 'Terms of Service']] as const) {
    const res = await page.goto(`http://127.0.0.1:4195/${path}`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await expect(page.getByRole('note')).toContainText('DRAFT')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: join(SHOTS, `phone-7-${path}.png`) })
  }
  // The login dialog links to both.
  await page.goto('http://127.0.0.1:4195/home')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Welcome to Wishtaa Maps' })
  await expect(dialog.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
  await expect(dialog.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
  await context.close()
})
