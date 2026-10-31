// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '@/editor/store'

const files: { id: string; storage: 'local' | 'drive' }[] = []
let account: string | null = null

vi.mock('./FilesContext', () => ({ useFiles: () => ({ files }) }))
vi.mock('./useDrive', () => ({ useDriveAuth: () => ({ status: 'connected', account }) }))

import { SaveLocation } from './SaveLocation'

afterEach(() => {
  cleanup()
  files.length = 0
  account = null
  useEditor.setState({ fileId: null })
})

describe('where the file saves (header chip)', () => {
  it('shows nothing when no file is open', () => {
    const { container } = render(<SaveLocation />)
    expect(container.firstChild).toBeNull()
  })

  it('says "This browser" for a local file', () => {
    files.push({ id: 'a', storage: 'local' })
    useEditor.setState({ fileId: 'a' })
    render(<SaveLocation />)
    expect(screen.getByTestId('save-location').textContent).toMatch(/This browser/)
    expect(screen.getByTestId('save-location').title).toMatch(/Move to Google Drive/)
  })

  it('says "Google Drive · email" for a Drive file, and points at the file menu for moving it', () => {
    files.push({ id: 'a', storage: 'drive' })
    account = 'me@example.com'
    useEditor.setState({ fileId: 'a' })
    render(<SaveLocation />)
    const chip = screen.getByTestId('save-location')
    expect(chip.textContent).toMatch(/Google Drive · me@example\.com/)
    expect(chip.title).toMatch(/Move to this browser/)
  })

  it('still says Google Drive when the account name is not known yet', () => {
    files.push({ id: 'a', storage: 'drive' })
    useEditor.setState({ fileId: 'a' })
    render(<SaveLocation />)
    expect(screen.getByTestId('save-location').textContent).toMatch(/Google Drive/)
  })
})
