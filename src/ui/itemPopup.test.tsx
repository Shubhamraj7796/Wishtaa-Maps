// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ItemPopup } from './ItemPopup'
import { Popover } from './Popover'

afterEach(() => cleanup())

function Demo({ onClose = () => undefined }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        opener
      </button>
      {open && (
        <ItemPopup
          label="Edit thing"
          header={<input aria-label="Title" data-autofocus />}
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        >
          <textarea aria-label="Body" />
          <button type="button">last</button>
        </ItemPopup>
      )}
    </div>
  )
}

describe('ItemPopup', () => {
  it('is a modal dialog with a name, and the marked control has the focus', () => {
    render(<Demo />)
    fireEvent.click(screen.getByText('opener'))
    const d = screen.getByRole('dialog', { name: 'Edit thing' })
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
  })

  it('Escape closes it and the focus goes back to the opener', () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    const opener = screen.getByText('opener')
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('the Close icon and a press on the dim background close it', () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.pointerDown(document.querySelector('[data-item-popup-backdrop]') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('a press inside the dialog does not close it', () => {
    const onClose = vi.fn()
    render(<Demo onClose={onClose} />)
    fireEvent.click(screen.getByText('opener'))
    fireEvent.pointerDown(screen.getByLabelText('Body'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Tab goes round inside the dialog (last to first, first to last)', () => {
    render(<Demo />)
    fireEvent.click(screen.getByText('opener'))
    const last = screen.getByText('last')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByLabelText('Title'))
    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('on a phone it fills the screen, on a wider window it is centred', () => {
    render(<Demo />)
    fireEvent.click(screen.getByText('opener'))
    const cls = screen.getByRole('dialog').className
    expect(cls).toContain('inset-0')
    expect(cls).toContain('sm:left-1/2')
  })

  it('Escape closes an open popover first and leaves the dialog open', () => {
    const onClose = vi.fn()
    function WithPopover() {
      const [anchor, setAnchor] = useState<HTMLElement | null>(null)
      return (
        <ItemPopup label="Edit thing" onClose={onClose}>
          <button type="button" onClick={(e) => setAnchor(e.currentTarget)}>
            more
          </button>
          {anchor && (
            <Popover anchor={anchor} label="Choices" onClose={() => setAnchor(null)}>
              <button type="button" role="menuitem">
                A
              </button>
            </Popover>
          )}
        </ItemPopup>
      )
    }
    render(<WithPopover />)
    fireEvent.click(screen.getByText('more'))
    expect(screen.getByRole('menu')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
