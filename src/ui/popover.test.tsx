// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Popover } from './Popover'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function Demo({ onChoose = () => undefined }: { onChoose?: (n: string) => void }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <div style={{ overflow: 'hidden', width: 50, height: 30 }}>
      <button type="button" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
        open
      </button>
      {anchor && (
        <Popover anchor={anchor} label="Choices" onClose={() => setAnchor(null)}>
          <button type="button" role="menuitem" onClick={() => onChoose('a')}>
            A
          </button>
          <button type="button" role="menuitem" onClick={() => onChoose('b')}>
            B
          </button>
          <button type="button" role="menuitem" disabled>
            C
          </button>
        </Popover>
      )}
    </div>
  )
}
const pop = () => document.querySelector('[data-popover]') as HTMLElement | null

describe('Popover', () => {
  it('is a labelled menu drawn in the page layer, outside the clipping container of its button', () => {
    render(<Demo />)
    fireEvent.click(screen.getByText('open'))
    expect(pop()?.getAttribute('role')).toBe('menu')
    expect(pop()?.getAttribute('aria-label')).toBe('Choices')
    expect(pop()?.parentElement).toBe(document.body)
    expect(pop()?.closest('[style*="overflow: hidden"]')).toBeNull()
    expect(pop()?.className).toContain('fixed')
  })

  it('puts the focus on the first choice, and the arrow keys move between the choices (skipping a disabled one)', () => {
    render(<Demo />)
    fireEvent.click(screen.getByText('open'))
    expect(document.activeElement?.textContent).toBe('A')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(document.activeElement?.textContent).toBe('B')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(document.activeElement?.textContent).toBe('A') // wraps; C is disabled
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(document.activeElement?.textContent).toBe('B')
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toBe('A')
  })

  it('Escape closes it, returns the focus to the button, and does nothing else (it is not passed on)', () => {
    const behind = vi.fn()
    window.addEventListener('keydown', behind)
    render(<Demo />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(pop()).toBeNull()
    expect(document.activeElement).toBe(screen.getByText('open'))
    expect(behind).not.toHaveBeenCalled()
    window.removeEventListener('keydown', behind)
  })

  it('an outside press closes it; a press inside or on its own button does not', () => {
    render(<Demo />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.pointerDown(screen.getByText('A'))
    expect(pop()).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(pop()).toBeNull()
  })

  it('choosing works, and Tab leaves it (it closes)', () => {
    const onChoose = vi.fn()
    render(<Demo onChoose={onChoose} />)
    fireEvent.click(screen.getByText('open'))
    fireEvent.click(screen.getByText('B'))
    expect(onChoose).toHaveBeenCalledWith('b')
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(pop()).toBeNull()
  })

  it('closes when its button moves (the panel was resized or scrolled under it) or leaves the page', () => {
    vi.useFakeTimers()
    render(<Demo />)
    const b = screen.getByText('open')
    fireEvent.click(b)
    fireEvent.scroll(window) // nothing moved
    expect(pop()).toBeTruthy()
    vi.spyOn(b, 'getBoundingClientRect').mockReturnValue({ top: 200, left: 0, right: 10, bottom: 210, width: 10, height: 10, x: 0, y: 200, toJSON: () => ({}) } as DOMRect)
    fireEvent.scroll(window)
    expect(pop()).toBeNull()
    cleanup()
    render(<Demo />)
    fireEvent.click(screen.getByText('open'))
    act(() => void vi.advanceTimersByTime(10))
    expect(pop()).toBeTruthy()
  })
})
