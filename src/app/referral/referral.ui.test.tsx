// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeBackend } from '@/core/auth/fakeBackend'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { installMemoryLocalStorage } from '../../test/memoryStorage'

const holder = vi.hoisted(() => ({ backend: null as unknown as FakeBackend }))
vi.mock('@/core/auth/config', () => ({ authEnabled: true, authConfig: { url: 'https://test.supabase.co', anonKey: 'anon', turnstileSiteKey: undefined } }))
vi.mock('@/core/auth/supabaseBackend', () => ({ createSupabaseBackend: async () => holder.backend }))
vi.mock('../EditorScreen', () => ({ default: () => <div>editor</div> }))

let auth: typeof import('../account').auth
let capture: typeof import('@/core/referral/capture')
let saved: typeof import('@/editor/saveEvents')

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('sessionStorage', globalThis.localStorage)
  vi.resetModules()
  const { FakeBackend: Fake } = await import('@/core/auth/fakeBackend')
  holder.backend = new Fake()
  ;({ auth } = await import('../account'))
  capture = await import('@/core/referral/capture')
  saved = await import('@/editor/saveEvents')
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function mount(path = '/home') {
  const { AppRoutes: Routes } = await import('../App')
  const { FilesProvider: Provider } = await import('../FilesContext')
  const repo = new RepositoryCore(new MemoryBackend(), () => Date.now())
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Provider repo={repo}>
        <Routes />
      </Provider>
    </MemoryRouter>
  )
}
const wait = (ms = 30) => act(async () => void (await new Promise((r) => setTimeout(r, ms))))

async function signInAs(email: string, name: string) {
  holder.backend.completeGoogle(email, name)
  await auth.init()
  return screen.findByRole('button', { name: new RegExp(`account menu, ${name}`, 'i') })
}
async function openPanel(name: string) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(`account menu, ${name}`, 'i') }))
  fireEvent.click(await screen.findByRole('menuitem', { name: /refer a friend/i }))
  return screen.findByRole('dialog', { name: 'Refer a friend' })
}

describe('the quiet "Invited by a friend" line', () => {
  it('shows in the sign-in box only for a visitor who arrived by a link', async () => {
    capture.rememberRef('ABCD2345', localStorage)
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to Wishtaa Maps' })
    expect(within(dialog).getByText('Invited by a friend')).toBeTruthy()
  })
  it('is not there for everybody else', async () => {
    await mount()
    fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Welcome to Wishtaa Maps' })
    expect(within(dialog).queryByText('Invited by a friend')).toBeNull()
  })
})

describe('the Refer a friend panel', () => {
  it('guests have no Refer a friend entry', async () => {
    await mount()
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: /refer a friend/i })).toBeNull()
  })

  it('opens from the account menu: my link, the counts, months, free period and the one note', async () => {
    await mount()
    await signInAs('sam@example.com', 'Sam Smith')
    const dialog = await openPanel('Sam Smith')
    const link = (await within(dialog).findByLabelText('Your link')) as HTMLInputElement
    expect(link.value).toMatch(/\/\?ref=[A-HJKMNP-Z2-9]{8}$/)
    expect(link.readOnly).toBe(true)
    expect(within(dialog).getByTestId('ref-count-invited').textContent).toBe('0')
    expect(within(dialog).getByTestId('ref-count-joined').textContent).toBe('0')
    expect(within(dialog).getByTestId('ref-count-successful').textContent).toBe('0')
    expect(within(dialog).getByText('Months earned')).toBeTruthy()
    expect(within(dialog).getByTestId('ref-free-until').textContent).toBe('Free for founding members')
    expect(within(dialog).getByText('Each friend who joins and saves a map gives you 1 more month.')).toBeTruthy()
    expect(within(dialog).queryByText('Maximum free period reached')).toBeNull()
  })

  it('Copy is an icon with a name (no native title), copies the link and says so quietly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    await mount()
    await signInAs('sam@example.com', 'Sam Smith')
    const dialog = await openPanel('Sam Smith')
    const copy = await within(dialog).findByRole('button', { name: 'Copy link' })
    expect(copy.getAttribute('title')).toBeNull()
    fireEvent.click(copy)
    await waitFor(() => expect(within(dialog).getByText('Link copied')).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith((screen.getByLabelText('Your link') as HTMLInputElement).value)
  })

  it('Share appears only where the device can share, and uses the native share sheet', async () => {
    await mount()
    await signInAs('sam@example.com', 'Sam Smith')
    let dialog = await openPanel('Sam Smith')
    await within(dialog).findByRole('button', { name: 'Copy link' })
    expect(within(dialog).queryByRole('button', { name: 'Share link' })).toBeNull()
    cleanup()
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    await mount()
    await auth.init()
    dialog = await openPanel('Sam Smith')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Share link' }))
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    expect(share.mock.calls[0]?.[0].url).toMatch(/\?ref=/)
  })

  it('shows a month on its way and the cap line, never who was invited', async () => {
    await mount()
    await signInAs('sam@example.com', 'Sam Smith')
    const real = holder.backend.db.referralSummary.bind(holder.backend.db)
    holder.backend.db.referralSummary = async () => {
      const s = await real()
      return s && { ...s, invited: 3, joined: 2, successful: 1, waiting: 1, monthsEarned: 18, bonusMonths: 18, capReached: true, freeUntil: '2029-03-01T00:00:00+00:00', founding: false }
    }
    const dialog = await openPanel('Sam Smith')
    await within(dialog).findByLabelText('Your link')
    expect(within(dialog).getByTestId('ref-count-invited').textContent).toBe('3')
    expect(within(dialog).getByText('1 on the way')).toBeTruthy()
    expect(within(dialog).getByTestId('ref-free-until').textContent).toBe('Free until 1 Mar 2029')
    expect(within(dialog).getByText('Maximum free period reached')).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/@/)
  })

  it('a database without the referral functions says so quietly, with no error screen', async () => {
    await mount()
    await signInAs('sam@example.com', 'Sam Smith')
    holder.backend.db.referralSummary = async () => null
    const dialog = await openPanel('Sam Smith')
    expect(await within(dialog).findByText('Referrals are not available yet.')).toBeTruthy()
  })

  it('a network failure offers Try again', async () => {
    await mount()
    await signInAs('sam@example.com', 'Sam Smith')
    let fail = true
    const real = holder.backend.db.referralSummary.bind(holder.backend.db)
    holder.backend.db.referralSummary = async () => {
      if (fail) throw new Error('offline')
      return real()
    }
    const dialog = await openPanel('Sam Smith')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Try again' }))
    fail = false
    expect(await within(dialog).findByLabelText('Your link')).toBeTruthy()
  })

  it('is also a section of the Account page', async () => {
    await mount('/account')
    await signInAs('sam@example.com', 'Sam Smith')
    const section = await screen.findByRole('region', { name: 'Refer a friend' })
    expect(await within(section).findByLabelText('Your link')).toBeTruthy()
  })
})

describe('from a friend link to the first saved map (the whole chain, with the stand-in sign-in service)', () => {
  it('claims the remembered code at sign-in, then reports the first real map once, and the friend sees counts only', async () => {
    holder.backend.completeGoogle('friend@example.com', 'Friend One')
    const code = holder.backend.codeFor('friend@example.com')
    holder.backend.revokeSession()
    capture.rememberRef(code, localStorage)
    await mount()
    await signInAs('new@example.com', 'New Person')
    await waitFor(() => expect(holder.backend.invitedBy.size).toBe(1))
    expect(capture.readRef(localStorage)).toBeNull() // used once and forgotten
    await wait(50) // the reporter has asked whether this person is waiting for a first map

    saved.emitMapSaved(2) // a map that is too small
    await wait()
    expect([...holder.backend.invitedBy.values()][0]?.status).toBe('joined')
    saved.emitMapSaved(4) // a real first map
    await waitFor(() => expect([...holder.backend.invitedBy.values()][0]?.status).toBe('qualified'))

    // The friend: counts only.
    holder.backend.sessionFor('friend@example.com')
    const summary = await holder.backend.db.referralSummary()
    expect(summary).toMatchObject({ invited: 1, successful: 1, waiting: 1, monthsEarned: 0 })
    expect(JSON.stringify(summary)).not.toMatch(/new@example|New Person/)
  })
})
