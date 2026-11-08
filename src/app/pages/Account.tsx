import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordOk } from '@/core/auth/passwords'
import { auth, localRecentsOn, setLocalRecents, useAuth } from '../account'
import { useAuthUi } from '../authUi'
import { Avatar } from '../auth/AccountMenu'
import { AccountDrive } from '../auth/AccountDrive'
import { Alert, Field, GoogleMark, inputClass, PasswordInput, PasswordRules, useStep } from '../auth/parts'
import { useFiles } from '../FilesContext'
import { buttonDanger, buttonPrimary, buttonSecondary } from '../Modal'
import { Page, PageHeader } from '../ui'

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} aria-label={title} className="mb-5 rounded-ui border border-line bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function ProfileSection() {
  const { user } = useAuth()
  const f = useFiles()
  const [name, setName] = useState(user?.name ?? '')
  const step = useStep()
  useEffect(() => setName(user?.name ?? ''), [user?.name])
  if (!user) return null
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (await step.run(async () => (await auth.updateDisplayName(name), true))) f.notify('Name saved.')
  }
  return (
    <Section title="Profile">
      <div className="mb-3 flex items-center gap-3">
        <Avatar user={user} size={48} />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name || 'Your account'}</p>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </div>
      <form onSubmit={(e) => void save(e)} className="max-w-sm space-y-3">
        <Field label="Display name">{(p) => <input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputClass} disabled={step.busy} />}</Field>
        {step.error && <Alert>{step.error}</Alert>}
        <button type="submit" className={buttonPrimary} disabled={step.busy || !name.trim() || name.trim() === user.name}>Save name</button>
      </form>
    </Section>
  )
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const { user } = useAuth()
  const [pw, setPw] = useState('')
  const step = useStep()
  const email = user?.email ?? ''
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await step.run(async () => (await auth.setPassword(pw), true))) {
      setPw('')
      onDone()
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 max-w-sm space-y-2">
      <Field label="New password">{(p) => <PasswordInput {...p} value={pw} onChange={setPw} autoComplete="new-password" disabled={step.busy} />}</Field>
      <PasswordRules password={pw} email={email} />
      {step.error && <Alert>{step.error}</Alert>}
      <div className="flex gap-2">
        <button type="submit" className={buttonPrimary} disabled={step.busy || !passwordOk(pw, email)}>Save password</button>
        <button type="button" className={buttonSecondary} onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

function MethodsSection() {
  const { user } = useAuth()
  const f = useFiles()
  const step = useStep()
  const [changing, setChanging] = useState(false)
  if (!user) return null
  const has = (p: 'email' | 'google') => user.providers.includes(p)
  const onlyOne = user.providers.length < 2
  const remove = async (p: 'email' | 'google') => {
    const label = p === 'google' ? 'Google' : 'email and password'
    if (!window.confirm(`Remove ${label} as a way to sign in? You can add it again later.`)) return
    if (await step.run(async () => (await auth.unlink(p), true))) f.notify(`Removed ${label}.`)
  }
  const row = 'flex flex-wrap items-center justify-between gap-2 rounded-ui border border-line p-3'
  return (
    <Section title="Ways to sign in" id="methods">
      <div className="space-y-2">
        <div className={row}>
          <div>
            <p className="text-sm font-medium">Email: code or password</p>
            <p className="text-xs text-muted">{has('email') ? `${user.email}. A code is emailed whenever you ask; a password is optional.` : 'Not set up. Add a password to also sign in with your email.'}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className={buttonSecondary} onClick={() => setChanging(true)}>{has('email') ? 'Set or change password' : 'Add email and password'}</button>
            {has('email') && <button type="button" className={buttonSecondary} disabled={onlyOne} title={onlyOne ? 'This is your only way to sign in' : undefined} onClick={() => void remove('email')}>Remove</button>}
          </div>
        </div>
        {changing && <PasswordForm onDone={() => setChanging(false)} />}
        <div className={row}>
          <div className="flex items-center gap-2">
            <GoogleMark />
            <div>
              <p className="text-sm font-medium">Google</p>
              <p className="text-xs text-muted">{has('google') ? `Linked${user.googleEmail ? ` as ${user.googleEmail}` : ''}.` : 'Not linked. Link it to sign in with one click.'}</p>
            </div>
          </div>
          {has('google') ? (
            <button type="button" className={buttonSecondary} disabled={onlyOne} title={onlyOne ? 'This is your only way to sign in' : undefined} onClick={() => void remove('google')}>Remove</button>
          ) : (
            <button type="button" className={buttonSecondary} disabled={step.busy} onClick={() => void step.run(() => auth.linkGoogle())}>Link Google</button>
          )}
        </div>
      </div>
      {onlyOne && <p className="mt-2 text-xs text-muted">You always keep at least one way to sign in. Add another to be able to remove this one.</p>}
      {step.error && <div className="mt-2"><Alert>{step.error}</Alert></div>}
    </Section>
  )
}

function SecuritySection() {
  const f = useFiles()
  const step = useStep()
  const [confirmAll, setConfirmAll] = useState(false)
  return (
    <Section title="Sign out">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonSecondary} onClick={() => void auth.signOut().then(() => f.notify('Signed out. Files saved in this browser are still here.'))}>Sign out</button>
        <button type="button" className={buttonSecondary} onClick={() => setConfirmAll(true)}>Sign out of all devices</button>
      </div>
      {confirmAll && (
        <div className="mt-3 space-y-2">
          <Alert tone="info">This ends your sign-in on every device, including this one. Files are not deleted anywhere.</Alert>
          <div className="flex gap-2">
            <button type="button" className={buttonPrimary} disabled={step.busy} onClick={() => void step.run(async () => (await auth.signOut({ everywhere: true }), f.notify('Signed out of all devices.')))}>Sign out everywhere</button>
            <button type="button" className={buttonSecondary} onClick={() => setConfirmAll(false)}>Cancel</button>
          </div>
        </div>
      )}
      {step.error && <div className="mt-2"><Alert>{step.error}</Alert></div>}
    </Section>
  )
}

function PrivacySection() {
  const { user } = useAuth()
  const [on, setOn] = useState(() => (user ? localRecentsOn(user.id) : true))
  if (!user) return null
  return (
    <Section title="Recent files">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked)
            setLocalRecents(user.id, e.target.checked)
          }}
          className="mt-0.5"
        />
        <span>
          Remember the names of files saved in this browser in my account
          <span className="block text-xs text-muted">Only names and dates are kept, never what is inside. Files in Google Drive are always listed so you can reopen them on other devices.</span>
        </span>
      </label>
    </Section>
  )
}

function DeleteSection() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const step = useStep()
  const navigate = useNavigate()
  const f = useFiles()
  const go = async () => {
    if (await step.run(async () => (await auth.deleteAccount(), true))) {
      f.notify('Your account was deleted. Files in Google Drive and in this browser were not touched.')
      navigate('/home')
    }
  }
  return (
    <Section title="Delete account">
      {!open ? (
        <button type="button" className={buttonSecondary} onClick={() => setOpen(true)}>Delete my account…</button>
      ) : (
        <div className="max-w-md space-y-3 text-sm">
          <Alert tone="info">
            This permanently deletes your Wishtaa Maps account: your sign-in, name, preferences and recent-files list. <strong>Your files in Google Drive are NOT deleted</strong>, and neither are files saved in this browser. You cannot undo this.
          </Alert>
          <Field label='Type DELETE to confirm'>{(p) => <input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputClass} disabled={step.busy} />}</Field>
          {step.error && <Alert>{step.error}</Alert>}
          <div className="flex gap-2">
            <button type="button" className={buttonDanger} disabled={step.busy || typed !== 'DELETE'} onClick={() => void go()}>Delete my account</button>
            <button type="button" className={buttonSecondary} onClick={() => (setOpen(false), setTyped(''))}>Cancel</button>
          </div>
        </div>
      )}
    </Section>
  )
}

export default function Account() {
  const s = useAuth()
  const open = useAuthUi((a) => a.open)
  useEffect(() => {
    void auth.init().catch(() => undefined)
  }, [])
  if (s.status === 'disabled') {
    return (
      <Page>
        <PageHeader title="Account" />
        <p className="text-sm text-muted">Accounts are not set up on this site yet. Everything works as a guest.</p>
      </Page>
    )
  }
  if (s.status !== 'signed-in' || !s.user) {
    return (
      <Page>
        <PageHeader title="Account" subtitle="Sign in to sync and link Google Drive." />
        {s.status === 'loading' ? <p role="status" className="text-sm text-muted">Checking your sign-in…</p> : <button type="button" className={buttonPrimary} onClick={() => open({ kind: 'signin' })}>Sign in</button>}
      </Page>
    )
  }
  return (
    <Page>
      <PageHeader title="Account" subtitle="Your files stay in this browser or in your own Google Drive. Your account keeps only your profile, preferences and a list of recent files." />
      <div className="max-w-2xl">
        <ProfileSection />
        <MethodsSection />
        <AccountDrive />
        <PrivacySection />
        <SecuritySection />
        <DeleteSection />
      </div>
    </Page>
  )
}
