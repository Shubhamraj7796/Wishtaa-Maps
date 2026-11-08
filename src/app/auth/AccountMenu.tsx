import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '@/core/auth/types'
import { auth, useAuth } from '../account'
import { useAuthUi } from '../authUi'
import { useFiles } from '../FilesContext'
import { LogOut, User, UserRound } from '../icons'

const initials = (u: AuthUser) => (u.name || u.email || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'

export function Avatar({ user, size = 32 }: { user: AuthUser; size?: number }) {
  const [broken, setBroken] = useState(false)
  const box = { width: size, height: size }
  if (user.avatarUrl && !broken) {
    return <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={box} className="shrink-0 rounded-full object-cover" />
  }
  return (
    <span aria-hidden="true" style={{ ...box, fontSize: size * 0.4 }} className="grid shrink-0 place-items-center rounded-full bg-brand/20 font-semibold text-ink">
      {initials(user)}
    </span>
  )
}

/** The person's button in the top bar: "Sign in" for guests, the account menu once signed in. Hidden when this site has no accounts set up. */
export function AccountMenu() {
  const s = useAuth()
  const f = useFiles()
  const navigate = useNavigate()
  const openAuth = useAuthUi((a) => a.open)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const items = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    items()[0]?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const list = items()
        const i = list.indexOf(document.activeElement as HTMLElement)
        list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus()
      } else if (e.key === 'Tab') setOpen(false)
    }
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  if (s.status === 'disabled') return null
  if (s.status === 'loading') return <span className="h-8 w-8 animate-pulse rounded-full bg-line" role="status" aria-label="Checking sign-in" />
  if (s.status === 'signed-out' || s.status === 'expired') {
    return (
      <button
        type="button"
        onClick={() => openAuth({ kind: 'signin', reason: s.status === 'expired' ? 'Your sign-in expired. Sign in again to keep syncing. Your files on this device are untouched.' : undefined })}
        className={`inline-flex h-9 items-center gap-1.5 rounded-ui px-3 text-sm font-semibold ${s.status === 'expired' ? 'bg-warn/20 text-ink hover:bg-warn/30' : 'bg-brand text-brand-ink hover:opacity-90'}`}
      >
        <UserRound size={16} aria-hidden="true" /> {s.status === 'expired' ? 'Sign in again' : 'Sign in'}
      </button>
    )
  }

  const user = s.user as AuthUser
  const choose = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  const item = 'flex w-full items-center gap-2 rounded-ui px-3 py-2 text-left text-sm hover:bg-bg focus:bg-bg'
  return (
    <div ref={root} className="relative">
      <button ref={button} type="button" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu, ${user.name || user.email || 'signed in'}`} title="Account" className="grid h-9 w-9 place-items-center rounded-full hover:bg-bg">
        <Avatar user={user} />
      </button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full z-50 mt-1 w-64 rounded-ui border border-line bg-surface p-1 shadow-xl">
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar user={user} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name || 'Your account'}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
              {s.offline && <p className="text-xs text-warn">Offline. Sync resumes when you are back online.</p>}
            </div>
          </div>
          <div className="my-1 h-px bg-line" role="separator" />
          <button type="button" role="menuitem" className={item} onClick={choose(() => f.setDialog({ kind: 'preferences' }))}>Preferences</button>
          <button type="button" role="menuitem" className={item} onClick={choose(() => f.setDialog({ kind: 'storage' }))}>Storage settings</button>
          <button type="button" role="menuitem" className={item} onClick={choose(() => navigate('/account'))}><User size={15} aria-hidden="true" /> Account</button>
          <div className="my-1 h-px bg-line" role="separator" />
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={choose(() => {
              void auth.signOut().then(() => f.notify('Signed out. Files saved in this browser are still here.'))
            })}
          >
            <LogOut size={15} aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
