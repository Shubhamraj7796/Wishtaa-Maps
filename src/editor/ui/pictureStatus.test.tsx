// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SyncStatus } from '@/core/drive/pictures'
import { resumeLabel } from '@/core/drive/pictures'
import { useEditor } from '../store'

const base: SyncStatus = { pending: 0, pictures: 0, batchTotal: 0, batchDone: 0, etaSeconds: null, active: 0, done: 0, retrying: 0, paused: false, pausedReason: null, mode: 'auto', bytesUploaded: 0, lastError: null }
let status = base
const listeners = new Set<() => void>()
const resumePictureUploads = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/app/repo', () => ({
  pictureSync: { subscribe: (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn)), getStatus: () => status },
  resumePictureUploads,
  driveRepository: { subscribeSync: () => () => undefined, syncInfoOf: () => ({ state: 'idle', syncedAt: null }) },
}))
import { SaveStatus } from './SaveStatus'

const set = (s: Partial<SyncStatus>) => act(() => ((status = { ...base, ...s }), listeners.forEach((l) => l())))
beforeEach(() => {
  status = base
  resumePictureUploads.mockClear()
  useEditor.setState({ save: { status: 'saved', savedAt: Date.now(), error: null }, readOnly: false })
})
afterEach(cleanup)

describe('the pictures indicator next to "Saved"', () => {
  it('says nothing when no picture is waiting', () => {
    render(<SaveStatus />)
    expect(screen.queryByTestId('pictures-paused')).toBeNull()
    expect(screen.queryByTestId('pictures-uploading')).toBeNull()
  })

  it('uploading: a count, and the map says Saved as usual', () => {
    render(<SaveStatus />)
    set({ pictures: 3, batchTotal: 3 })
    expect(screen.getByTestId('pictures-uploading').textContent).toBe('3 pictures uploading')
    expect(screen.getByRole('status').textContent).toMatch(/Saved/)
  })

  it('paused for sign-in: names the reason and offers "Sign in"; clicking it asks the app to resume', () => {
    render(<SaveStatus />)
    set({ pictures: 67, paused: true, pausedReason: 'auth' })
    const b = screen.getByTestId('pictures-paused')
    expect(b.textContent).toBe('67 pictures paused: sign in to Google Drive to continue · Sign in')
    expect(b.getAttribute('title')).toMatch(/in all your maps/)
    expect(b.getAttribute('title')).toMatch(/The map itself is saved/)
    expect(screen.getByRole('status').textContent).toMatch(/Saved/) // the map is saved whatever the pictures are doing
    fireEvent.click(b)
    expect(resumePictureUploads).toHaveBeenCalledTimes(1)
  })

  it('each reason has its own words and button', () => {
    render(<SaveStatus />)
    const text = (r: SyncStatus['pausedReason']) => (set({ pictures: 2, paused: true, pausedReason: r }), screen.getByTestId('pictures-paused').textContent)
    expect(text('quota')).toBe('2 pictures paused: Google Drive is full · Resume')
    expect(text('user')).toBe('2 pictures paused: paused by you · Resume')
    expect(text('datasaver')).toBe('2 pictures paused: paused because data saver is on · Sync now')
  })

  it('shows the picture count when it is paused even on a narrow screen (it is a button, not hidden text)', () => {
    render(<SaveStatus />)
    set({ pictures: 1, paused: true, pausedReason: 'auth' })
    expect(screen.getByTestId('pictures-paused').className).not.toMatch(/hidden/)
  })
})

describe('button words', () => {
  it('Sign in for Google causes, Sync now for data saver, otherwise Resume', () => {
    expect([resumeLabel('auth'), resumeLabel('revoked'), resumeLabel('datasaver'), resumeLabel('quota'), resumeLabel('user'), resumeLabel(null)]).toEqual(['Sign in', 'Sign in', 'Sync now', 'Resume', 'Resume', 'Resume'])
  })
})
