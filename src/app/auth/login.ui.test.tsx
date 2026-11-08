// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeBackend } from '@/core/auth/fakeBackend'
import { MemoryBackend, RepositoryCore } from '@/core/files/core'
import { installMemoryLocalStorage } from '../../test/memoryStorage'

// Accounts "on" for this file, with the in-memory sign-in service standing in for Supabase.
const holder = vi.hoisted(() => ({ backend: null as unknown as FakeBackend }))
vi.mock('@/core/auth/config', () => ({ authEnabled: true, authConfig: { url: 'https://test.supabase.co', anonKey: 'anon', turnstileSiteKey: undefined } }))
vi.mock('@/core/auth/supabaseBackend', () => ({ createSupabaseBackend: async () => holder.backend }))
vi.mock('../EditorScreen', () => ({ default: () => <div>editor</div> }))

let auth: typeof import('../account').auth
let useAuthUi: typeof import('../authUi').useAuthUi

beforeEach(async () => {
  installMemoryLocalStorage()
  vi.stubGlobal('sessionStorage', globalThis.localStorage)
  vi.resetModules()
  const { FakeBackend: Fake } = await import('@/core/auth/fakeBackend')
  holder.backend = new Fake()
  ;({ auth } = await import('../account'))
  ;({ useAuthUi } = await import('../authUi'))
})
afterEach(cleanup)

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

const openSignIn = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^sign in$/i }))
  return screen.findByRole('dialog', { name: 'Welcome to Wishtaa Maps' })
}
const type = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('the login screen', () => {
  it('guests see a Sign in button and the app works as before', async () => {
    await mount()
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /new file/i })).toBeTruthy()
  })

  it('email code: Continue, then the 6-digit box with a resend wait, then signed in with the account menu', async () => {
    await mount()
    const dialog = await openSignIn()
    expect(within(dialog).getByText(/send you a 6-digit code/i)).toBeTruthy()
    const cont = within(dialog).getByRole('button', { name: /continue/i }) as HTMLButtonElement
    expect(cont.disabled).toBe(true) // no email yet
    type('Email', 'ann@example.com')
    expect(cont.disabled).toBe(false)
    fireEvent.click(cont)

    const code = await screen.findByRole('dialog', { name: 'Enter your code' })
    expect(within(code).getByText('ann@example.com')).toBeTruthy()
    expect((within(code).getByRole('button', { name: /send a new code in \d+ s/i }) as HTMLButtonElement).disabled).toBe(true)
    expect(holder.backend.codes.get('ann@example.com')).toBe('123456')
    fireEvent.change(within(code).getByLabelText('6-digit code'), { target: { value: '123456' } }) // 6 digits submit by themselves

    const menu = await screen.findByRole('button', { name: /account menu/i })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(menu)
    expect(await screen.findByRole('menuitem', { name: /preferences/i })).toBeTruthy()
    for (const name of [/storage settings/i, /account/i, /sign out/i]) expect(screen.getAllByRole('menuitem', { name }).length).toBeGreaterThan(0)
  })

  it('a wrong code says so in words, empties the box, and keeps the dialog open', async () => {
    await mount()
    await openSignIn()
    type('Email', 'ann@example.com')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    const code = await screen.findByRole('dialog', { name: 'Enter your code' })
    const box = within(code).getByLabelText('6-digit code') as HTMLInputElement
    fireEvent.change(box, { target: { value: '000000' } })
    const alert = await within(code).findByRole('alert')
    expect(alert.textContent).toMatch(/not valid|expired/i)
    await waitFor(() => expect(box.value).toBe(''))
    expect(auth.state.status).toBe('signed-out')
  })

  it('password sign-up shows the rules inline and keeps Create account off until they pass', async () => {
    await mount()
    await openSignIn()
    fireEvent.click(screen.getByRole('button', { name: /use a password instead/i }))
    fireEvent.click(await screen.findByRole('button', { name: /create an account with a password/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Create your account' })
    type('Email', 'new@example.com')
    const create = within(dialog).getByRole('button', { name: /create account/i }) as HTMLButtonElement
    fireEvent.change(within(dialog).getByLabelText('Choose a password'), { target: { value: 'weak' } })
    const rules = within(dialog).getByRole('list', { name: 'Password rules' })
    expect(within(rules).getAllByRole('listitem')).toHaveLength(4)
    expect(create.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText('Choose a password'), { target: { value: 'Correct-horse-1' } })
    expect(create.disabled).toBe(false)
    expect(within(rules).queryAllByText('(not yet)')).toHaveLength(0)
    fireEvent.click(create)
    expect(await screen.findByRole('dialog', { name: 'Check your email' })).toBeTruthy()
  })

  it('the password can be shown and hidden', async () => {
    await mount()
    await openSignIn()
    fireEvent.click(screen.getByRole('button', { name: /use a password instead/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in with a password' })
    const pw = within(dialog).getByLabelText('Password') as HTMLInputElement
    expect(pw.type).toBe('password')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show password' }))
    expect(pw.type).toBe('text')
  })

  it('"Sign in with Google" leaves for Google (and notes the return, so Drive can be asked for next)', async () => {
    await mount()
    const dialog = await openSignIn()
    fireEvent.click(within(dialog).getByRole('button', { name: /sign in with google/i }))
    await waitFor(() => expect(holder.backend.calls).toContain('signInGoogle'))
    expect(globalThis.sessionStorage.getItem('wishtaamaps:google-return')).toBeTruthy()
  })

  it('Escape closes the dialog and nothing about the files changes', async () => {
    await mount()
    await openSignIn()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useAuthUi.getState().dialog).toBeNull()
  })
})

describe('signed in', () => {
  async function signedIn() {
    holder.backend.completeGoogle('sam@example.com', 'Sam Smith')
    await mount()
    await auth.init()
    return screen.findByRole('button', { name: /account menu, sam smith/i })
  }

  it('the account menu shows name and email and signs out; guest files stay', async () => {
    const menu = await signedIn()
    fireEvent.click(menu)
    expect(await screen.findByText('sam@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('menuitem', { name: /sign out/i }))
    expect(await screen.findByRole('button', { name: /^sign in$/i })).toBeTruthy()
    expect(auth.state.status).toBe('signed-out')
    expect(screen.getByRole('button', { name: /new file/i })).toBeTruthy()
  })

  it('an expired sign-in shows a calm bar and a Sign in again button; the app keeps working', async () => {
    await signedIn()
    holder.backend.revokeSession()
    const bar = await screen.findByText(/you were signed out/i)
    expect(bar.closest('[role="alert"]')?.textContent).toMatch(/files and changes on this device are safe/i)
    expect(screen.getAllByRole('button', { name: /sign in again/i }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /new file/i })).toBeTruthy()
  })

  it('the account page lists the ways to sign in and will not remove the last one', async () => {
    holder.backend.completeGoogle('sam@example.com', 'Sam Smith')
    await mount('/account')
    await auth.init()
    const section = await screen.findByRole('region', { name: 'Ways to sign in' })
    const buttons = within(section).getAllByRole('button', { name: 'Remove' }) as HTMLButtonElement[]
    expect(buttons.every((b) => b.disabled)).toBe(true) // only Google exists yet
    expect(within(section).getByText(/at least one way to sign in/i)).toBeTruthy()
  })

  it('deleting the account needs the word DELETE and says Drive files are safe', async () => {
    holder.backend.completeGoogle('sam@example.com', 'Sam Smith')
    await mount('/account')
    await auth.init()
    fireEvent.click(await screen.findByRole('button', { name: /delete my account/i }))
    expect(screen.getByText(/NOT deleted/)).toBeTruthy()
    const go = screen.getAllByRole('button', { name: /delete my account/i }).pop() as HTMLButtonElement
    expect(go.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/type DELETE/i), { target: { value: 'DELETE' } })
    expect(go.disabled).toBe(false)
  })
})
