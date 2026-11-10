// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriveError, PickerUnavailableError } from '@/core/drive/errors'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { useAuthUi } from '../authUi'
import { FilesProvider } from '../FilesContext'
import { browserLabel, withPickerNotice } from '../pickerNotice'
import { AuthHost } from './AuthHost'

const pdfDevice = vi.hoisted(() => vi.fn())
vi.mock('@/editor/pdf/actions', () => ({ pickPdfFromDevice: pdfDevice }))

const copied: string[] = []
beforeEach(() => {
  installMemoryLocalStorage()
  copied.length = 0
  pdfDevice.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => void copied.push(t) } })
  useAuthUi.setState({ dialog: null, queue: [] })
})
afterEach(cleanup)

const mount = () =>
  render(
    <MemoryRouter>
      <FilesProvider>
        <AuthHost />
      </FilesProvider>
    </MemoryRouter>
  )
const blocked = (which: 'open-map' | 'folder' | 'pdf', reason: 'never-loaded' | 'script-blocked' = 'never-loaded') => new PickerUnavailableError(reason, which)
const dialog = () => screen.findByRole('dialog', { name: 'Google Drive could not open in this browser' })

describe('the "Google Drive could not open in this browser" notice', () => {
  it('shows the wording, the three buttons and Copy details; Try again runs the picker again and returns its answer', async () => {
    mount()
    const run = vi.fn().mockRejectedValueOnce(blocked('open-map')).mockResolvedValueOnce([{ id: 'f1', name: 'a.wishtaa' }])
    const result = withPickerNotice(run, [])
    const d = await dialog()
    expect(d.textContent).toContain('Some browsers (for example Brave) block the Google file picker. Please open Wishtaa Maps in Chrome, Edge or Firefox to use Google Drive, or allow cookies for this site.')
    for (const name of ['Copy link to open in another browser', 'Try again', 'Choose a file from this device', 'Copy details']) expect(within(d).getByRole('button', { name })).toBeTruthy()
    fireEvent.click(within(d).getByRole('button', { name: 'Try again' }))
    expect(await result).toEqual([{ id: 'f1', name: 'a.wishtaa' }])
    expect(run).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('"Copy link" copies the current address', async () => {
    mount()
    void withPickerNotice(() => Promise.reject(blocked('open-map')), [])
    const d = await dialog()
    fireEvent.click(within(d).getByRole('button', { name: 'Copy link to open in another browser' }))
    await waitFor(() => expect(copied).toEqual([location.href]))
    expect(await within(d).findByRole('button', { name: 'Link copied' })).toBeTruthy()
  })

  it('"Copy details" says which picker, why, the browser and the app version, and nothing personal', async () => {
    mount()
    void withPickerNotice(() => Promise.reject(blocked('pdf', 'script-blocked')), [])
    const d = await dialog()
    fireEvent.click(within(d).getByRole('button', { name: 'Copy details' }))
    await waitFor(() => expect(copied).toHaveLength(1))
    const text = copied[0] as string
    expect(text).toContain('Picker: PDF')
    expect(text).toContain('Reason: script blocked')
    expect(text).toMatch(/Browser: \S+/)
    expect(text).toMatch(/App version: \S+/)
    expect(text).not.toMatch(/token|@|\.pdf|\.wishtaa|http/i) // no file names, tokens, addresses
  })

  it('PDF: "Choose a file from this device" opens the PDF chooser from that click and the picker gives up', async () => {
    mount()
    const result = withPickerNotice(() => Promise.reject(blocked('pdf')), [])
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Choose a file from this device' }))
    expect(await result).toEqual([])
    expect(pdfDevice).toHaveBeenCalledTimes(1)
  })

  it('open a map: the device button hands over to the import step (maps and .emmx from this device) and the picker gives up', async () => {
    mount()
    const result = withPickerNotice(() => Promise.reject(blocked('open-map')), [])
    fireEvent.click(within(await dialog()).getByRole('button', { name: 'Choose a file from this device' }))
    expect(await result).toEqual([])
    expect(pdfDevice).not.toHaveBeenCalled()
  })

  it('the save-to folder picker has no device button', async () => {
    mount()
    void withPickerNotice(() => Promise.reject(blocked('folder')), null)
    const d = await dialog()
    expect(within(d).queryByRole('button', { name: 'Choose a file from this device' })).toBeNull()
    expect(within(d).getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('Escape or closing the notice gives up (once), and nothing reappears', async () => {
    mount()
    const run = vi.fn().mockRejectedValue(blocked('open-map'))
    const result = withPickerNotice(run, [])
    await dialog()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(await result).toEqual([])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('is NOT shown when the picker works or the person cancels it, and other errors are not turned into this notice', async () => {
    mount()
    expect(await withPickerNotice(async () => [{ id: 'f', name: 'x' }], [])).toHaveLength(1)
    expect(await withPickerNotice(async () => [], [])).toEqual([]) // closed on purpose: an empty answer
    expect(await withPickerNotice(async () => null, null)).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    await expect(withPickerNotice(() => Promise.reject(new DriveError('offline', 'No connection')), [])).rejects.toThrow('No connection')
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => undefined)
  })
})

describe('the browser name in the details', () => {
  it('gives the name and major version only', () => {
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')).toBe('Chrome 131')
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.51')).toBe('Edge 131')
    expect(browserLabel('Mozilla/5.0 (Windows NT 10.0; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Firefox 132')
    expect(browserLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari 17')
  })
})
