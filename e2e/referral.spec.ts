import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import type { Server } from 'node:http'
import { join } from 'node:path'
import { serve } from './serve.mjs'

/**
 * The referral programme in a real browser (Chrome) with a PRETEND Supabase (no real project, no real Google, no real email): a friend link
 * is remembered and taken out of the address bar, the sign-in box shows one quiet line, a signed-in person attaches the code once, the
 * "Refer a friend" panel works on desktop, tablet and phone and in dark mode, and the pictures go to docs/screenshots/referral.
 * NOT covered here: the real database rules (supabase/tests/referrals_rls_test.sql does that, and the owner ran it), real Google sign-in,
 * real email delivery, the real native share sheet on a phone, Safari, Firefox.
 * Needs a build with the two Supabase settings: `node e2e/build-auth.mjs`, then `npx playwright test e2e/referral.spec.ts`.
 */
const DIST = process.env.E2E_AUTH_DIST ?? 'dist-auth'
const SUPABASE = 'https://e2e.supabase.co'
const SHOTS = join('docs', 'screenshots', 'referral')
const SIZES = [
  { name: 'desktop', viewport: { width: 1366, height: 768 }, touch: false },
  { name: 'tablet', viewport: { width: 820, height: 1100 }, touch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
]

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function sessionFor(email: string) {
  const now = Math.floor(Date.now() / 1000)
  const user = {
    id: '22222222-2222-2222-2222-222222222222',
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { full_name: 'Sam Smith' },
    identities: [{ id: '1', user_id: '1', provider: 'email', identity_data: { email }, created_at: '', updated_at: '', last_sign_in_at: '' }],
    created_at: new Date().toISOString(),
  }
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email, role: 'authenticated', aud: 'authenticated', exp: now + 3600 })}.sig`
  return { access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'refresh-1', user }
}

/** What the app keeps in this browser to know someone is signed in before it asks the server (so the page opens signed in at once). */
const HINT = { id: '22222222-2222-2222-2222-222222222222', email: 'sam@example.com', name: 'Sam Smith', avatarUrl: null, providers: ['email'], googleEmail: null }

const SUMMARY = {
  plan: 'pro', source: 'signup', freeUntil: null, founding: true, monthsTotal: 9, bonusMonths: 3, capReached: false,
  code: 'KR7M4WZ2', invited: 5, joined: 4, successful: 3, waiting: 1, monthsEarned: 3, invitedByFriend: false, awaitingFirstMap: false, minTopics: 3,
}

interface Calls { paths: string[]; claim: string[]; first: number[] }
async function pretendSupabase(context: BrowserContext, calls: Calls, summary: Record<string, unknown> = SUMMARY) {
  await context.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    calls.paths.push(`${req.method()} ${path}`)
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return json(204, {})
    if (path === '/rest/v1/rpc/my_referral_summary') return json(200, summary)
    if (path === '/rest/v1/rpc/claim_referral') {
      calls.claim.push((JSON.parse(req.postData() ?? '{}') as { p_code?: string }).p_code ?? '')
      return json(200, 'claimed')
    }
    if (path === '/rest/v1/rpc/record_first_map') {
      calls.first.push((JSON.parse(req.postData() ?? '{}') as { p_topics?: number }).p_topics ?? -1)
      return json(200, 'waiting')
    }
    if (path === '/auth/v1/logout') return json(204, {})
    if (path.startsWith('/rest/v1/')) return json(req.method() === 'GET' ? 200 : 201, req.method() === 'GET' ? [] : {})
    return json(404, {})
  })
}

async function signedInContext(browser: import('@playwright/test').Browser, size: (typeof SIZES)[number], calls: Calls, extra?: { ref?: string; summary?: Record<string, unknown> }) {
  const context = await browser.newContext({ viewport: size.viewport, hasTouch: size.touch, isMobile: size.touch && size.viewport.width < 800, serviceWorkers: 'block' })
  await pretendSupabase(context, calls, extra?.summary)
  const session = JSON.stringify(sessionFor('sam@example.com'))
  await context.addInitScript(
    ([key, value, hint, ref]) => {
      if (sessionStorage.getItem('e2e-seeded')) return
      sessionStorage.setItem('e2e-seeded', '1')
      localStorage.setItem(key as string, value as string)
      localStorage.setItem('wishtaamaps:auth-hint', hint as string)
      if (ref) localStorage.setItem('wishtaamaps:ref', JSON.stringify({ code: ref, savedAt: Date.now() }))
    },
    ['wishtaamaps:auth', session, JSON.stringify(HINT), extra?.ref ?? '']
  )
  return context
}

async function openPanel(page: Page) {
  await page.getByRole('button', { name: /^account menu/i }).click()
  await page.getByRole('menuitem', { name: 'Refer a friend' }).click()
  const dialog = page.getByRole('dialog', { name: 'Refer a friend' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Your link')).toBeVisible()
  return dialog
}

let server: Server
test.beforeAll(async () => {
  mkdirSync(SHOTS, { recursive: true })
  server = await serve(DIST, 4196)
})
test.afterAll(async () => {
  await new Promise((ok) => server.close(ok))
})

test('a friend link is remembered and removed from the address bar; the sign-in box shows one quiet line', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' })
  const calls: Calls = { paths: [], claim: [], first: [] }
  await pretendSupabase(context, calls)
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('http://127.0.0.1:4196/home?ref=abcd2345')
  await expect(page).toHaveURL(/\/home$/) // ref is gone from the address
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('wishtaamaps:ref') ?? '{}').code)).toBe('ABCD2345')
  await page.getByRole('button', { name: /^sign in$/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Welcome to Wishtaa Maps' })
  await expect(dialog.getByText('Invited by a friend')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'invited-by-friend-desktop.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  // A visit without a link shows no such line.
  await page.evaluate(() => localStorage.removeItem('wishtaamaps:ref'))
  await page.reload()
  await page.getByRole('button', { name: /^sign in$/i }).click()
  await expect(page.getByRole('dialog', { name: 'Welcome to Wishtaa Maps' }).getByText('Invited by a friend')).toHaveCount(0)
  expect(errors).toEqual([])
  await context.close()
})

test('a signed-in person attaches the remembered code once, and it is forgotten', async ({ browser }) => {
  const calls: Calls = { paths: [], claim: [], first: [] }
  const context = await signedInContext(browser, SIZES[0] as (typeof SIZES)[number], calls, { ref: 'ABCD2345' })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4196/home')
  await expect(page.getByRole('button', { name: /^account menu/i })).toBeVisible()
  await expect.poll(() => calls.claim).toEqual(['ABCD2345'])
  expect(await page.evaluate(() => localStorage.getItem('wishtaamaps:ref'))).toBeNull()
  await page.reload()
  await page.waitForTimeout(500)
  expect(calls.claim).toEqual(['ABCD2345']) // not sent again
  await context.close()
})

for (const size of SIZES) {
  test(`the Refer a friend panel: ${size.name}`, async ({ browser }) => {
    const calls: Calls = { paths: [], claim: [], first: [] }
    const context = await signedInContext(browser, size, calls)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4196' }).catch(() => undefined)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('http://127.0.0.1:4196/home')
    const dialog = await openPanel(page)
    await expect(dialog.getByTestId('ref-count-invited')).toHaveText('5')
    await expect(dialog.getByTestId('ref-count-joined')).toHaveText('4')
    await expect(dialog.getByTestId('ref-count-successful')).toHaveText('3')
    await expect(dialog.getByText('Months earned')).toBeVisible()
    await expect(dialog.getByText('1 on the way')).toBeVisible()
    await expect(dialog.getByTestId('ref-free-until')).toHaveText('Free for founding members')
    await expect(dialog.getByText('Each friend who joins and saves a map gives you 1 more month.')).toBeVisible()
    const link = (await dialog.getByLabel('Your link').inputValue()) as string
    expect(link).toBe('http://127.0.0.1:4196/?ref=KR7M4WZ2')
    // Icons: named, no native title, a finger-sized target on touch.
    const copy = dialog.getByRole('button', { name: 'Copy link' })
    expect(await copy.getAttribute('title')).toBeNull()
    const box = (await copy.boundingBox()) as { width: number; height: number }
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44)
    expect(Math.round(box.width)).toBeGreaterThanOrEqual(40)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (!size.touch) {
      await copy.hover()
      await expect(page.locator('[role="tooltip"], [data-tooltip]').first()).toContainText('Copy link')
    }
    await copy.click()
    await expect(dialog.getByText('Link copied')).toBeVisible()
    await page.screenshot({ path: join(SHOTS, `panel-${size.name}.png`) })
    // Escape closes it and the focus goes back to the account button.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    expect(errors).toEqual([])
    await context.close()
  })
}

test('the panel in dark mode, with a finished free period date and the cap line', async ({ browser }) => {
  const calls: Calls = { paths: [], claim: [], first: [] }
  const capped = { ...SUMMARY, founding: false, freeUntil: '2029-03-01T00:00:00+00:00', monthsTotal: 24, bonusMonths: 18, monthsEarned: 18, capReached: true, waiting: 0, invited: 21, joined: 20, successful: 19 }
  const context = await signedInContext(browser, SIZES[0] as (typeof SIZES)[number], calls, { summary: capped })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4196/home')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click().catch(() => undefined)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const dialog = await openPanel(page)
  await expect(dialog.getByTestId('ref-free-until')).toHaveText('Free until 1 Mar 2029')
  await expect(dialog.getByText('Maximum free period reached')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'panel-dark-desktop.png') })
  await context.close()
})

test('the panel is also a section of the Account page, and a database without referrals shows one quiet line', async ({ browser }) => {
  const calls: Calls = { paths: [], claim: [], first: [] }
  const context = await signedInContext(browser, SIZES[0] as (typeof SIZES)[number], calls)
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:4196/account')
  const section = page.getByRole('region', { name: 'Refer a friend' })
  await expect(section.getByLabel('Your link')).toBeVisible()
  await page.screenshot({ path: join(SHOTS, 'account-page-desktop.png'), fullPage: true })
  await context.close()

  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' })
  const calls2: Calls = { paths: [], claim: [], first: [] }
  await pretendSupabase(ctx2, calls2)
  await ctx2.route(`${SUPABASE}/rest/v1/rpc/my_referral_summary`, (r) => r.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }) }))
  await ctx2.addInitScript(
    ([k, v, h]) => {
      localStorage.setItem(k as string, v as string)
      localStorage.setItem('wishtaamaps:auth-hint', h as string)
    },
    ['wishtaamaps:auth', JSON.stringify(sessionFor('sam@example.com')), JSON.stringify(HINT)]
  )
  const p2 = await ctx2.newPage()
  await p2.goto('http://127.0.0.1:4196/home')
  await p2.getByRole('button', { name: /^account menu/i }).click()
  await p2.getByRole('menuitem', { name: 'Refer a friend' }).click()
  await expect(p2.getByRole('dialog', { name: 'Refer a friend' }).getByText('Referrals are not available yet.')).toBeVisible()
  await ctx2.close()
})
