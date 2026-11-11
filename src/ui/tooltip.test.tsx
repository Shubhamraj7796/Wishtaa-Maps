// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IconButton, IconTile, IconToggleGroup, Swatch } from './IconButton'
import { HOVER_MS, LONG_PRESS_MS, QUICK_MS, resetTips, Tooltip, TooltipLayer, TOUCH_HIDE_MS, placeTip } from './Tooltip'

beforeEach(() => {
  vi.useFakeTimers()
  resetTips()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetTips()
})

const tip = () => document.querySelector('[data-tooltip]') as HTMLElement | null
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
const mouse = { pointerType: 'mouse', pointerId: 1 }
const touch = { pointerType: 'touch', pointerId: 2 }

function Bar({ onClick = () => undefined }: { onClick?: () => void }) {
  return (
    <div style={{ overflow: 'hidden', width: 100, height: 40 }}>
      <IconButton icon="undo" label="Undo" keys="Ctrl+Z" onClick={onClick} />
      <IconButton icon="redo" label="Redo" keys="Ctrl+Y" />
      <TooltipLayer />
    </div>
  )
}

describe('tooltip: hover with a mouse', () => {
  it('appears after the delay, not before, with the name and the shortcut', () => {
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS - 50)
    expect(tip()).toBeNull()
    wait(60)
    expect(tip()?.textContent).toContain('Undo')
    expect(tip()?.textContent).toContain('(Ctrl+Z)')
    expect(tip()?.getAttribute('role')).toBe('tooltip')
  })

  it('goes when the pointer leaves, and never appears if it left first', () => {
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerEnter(undo, mouse)
    wait(200)
    fireEvent.pointerLeave(undo, mouse)
    wait(1000)
    expect(tip()).toBeNull()
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS + 10)
    expect(tip()).toBeTruthy()
    fireEvent.pointerLeave(undo, mouse)
    expect(tip()).toBeNull()
  })

  it('moving to the next control shows its tooltip at once', () => {
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    const redo = screen.getByRole('button', { name: 'Redo' })
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS + 10)
    fireEvent.pointerLeave(undo, mouse)
    wait(QUICK_MS - 150)
    fireEvent.pointerEnter(redo, mouse)
    expect(tip()?.textContent).toContain('Redo') // no second wait
  })

  it('after a pause it waits again', () => {
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    const redo = screen.getByRole('button', { name: 'Redo' })
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS + 10)
    fireEvent.pointerLeave(undo, mouse)
    wait(QUICK_MS + 300)
    fireEvent.pointerEnter(redo, mouse)
    expect(tip()).toBeNull()
  })

  it('Escape, a scroll and pressing the control all take it away', () => {
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS + 10)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(tip()).toBeNull()
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS + 10)
    fireEvent.scroll(window)
    expect(tip()).toBeNull()
    fireEvent.pointerEnter(undo, mouse)
    wait(HOVER_MS + 10)
    fireEvent.pointerDown(undo, mouse)
    expect(tip()).toBeNull()
  })
})

/** jsdom has no keyboard-versus-mouse focus: say the focus came from the keyboard (or not). */
const focusVisible = (yes: boolean) => {
  const real = Element.prototype.matches
  vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, sel: string) {
    return sel === ':focus-visible' ? yes : real.call(this, sel)
  })
}

describe('tooltip: keyboard focus', () => {
  it('a click-focus (not from the keyboard) shows no tooltip', () => {
    focusVisible(false)
    render(<Bar />)
    act(() => screen.getByRole('button', { name: 'Undo' }).focus())
    expect(tip()).toBeNull()
  })

  it('shows at once on focus and goes on blur and on Escape', () => {
    focusVisible(true)
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    act(() => undo.focus())
    expect(tip()?.textContent).toContain('Undo')
    act(() => undo.blur())
    expect(tip()).toBeNull()
    act(() => undo.focus())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(tip()).toBeNull()
  })
})

describe('tooltip: long-press on touch', () => {
  it('a long press shows the name and does NOT run the control', () => {
    const onClick = vi.fn()
    render(<Bar onClick={onClick} />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerDown(undo, touch)
    wait(LONG_PRESS_MS - 50)
    expect(tip()).toBeNull()
    wait(60)
    expect(tip()?.textContent).toContain('Undo')
    fireEvent.pointerUp(undo, touch)
    fireEvent.click(undo) // the click a finger lift sends after a long press
    expect(onClick).not.toHaveBeenCalled()
    wait(TOUCH_HIDE_MS + 50)
    expect(tip()).toBeNull()
  })

  it('a short tap runs the control and shows no tooltip', () => {
    const onClick = vi.fn()
    render(<Bar onClick={onClick} />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerDown(undo, touch)
    wait(120)
    fireEvent.pointerUp(undo, touch)
    fireEvent.click(undo)
    expect(onClick).toHaveBeenCalledTimes(1)
    wait(LONG_PRESS_MS + 100)
    expect(tip()).toBeNull()
  })

  it('the next tap after a long press works again', () => {
    const onClick = vi.fn()
    render(<Bar onClick={onClick} />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerDown(undo, touch)
    wait(LONG_PRESS_MS + 10)
    fireEvent.pointerUp(undo, touch)
    fireEvent.click(undo)
    fireEvent.pointerDown(undo, touch)
    wait(100)
    fireEvent.pointerUp(undo, touch)
    fireEvent.click(undo)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('the browser menu of a long press is not shown', () => {
    render(<Bar />)
    const undo = screen.getByRole('button', { name: 'Undo' })
    fireEvent.pointerDown(undo, touch)
    wait(LONG_PRESS_MS + 10)
    const notCancelled = fireEvent.contextMenu(undo)
    expect(notCancelled).toBe(false)
  })

  it('hover never shows it for a touch pointer', () => {
    render(<Bar />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Undo' }), touch)
    wait(HOVER_MS + 100)
    expect(tip()).toBeNull()
  })
})

describe('tooltip: never clipped', () => {
  it('is drawn in the page layer, outside the menu or panel that holds the control', () => {
    render(<Bar />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Undo' }), mouse)
    wait(HOVER_MS + 10)
    expect(tip()?.parentElement).toBe(document.body)
    expect(tip()?.closest('[style*="overflow: hidden"]')).toBeNull()
    expect(tip()?.className).toContain('z-[1000]')
    expect(tip()?.className).toContain('pointer-events-none')
  })

  it('goes when its control is taken off the page (a menu that closed)', () => {
    function Menu() {
      const [open, setOpen] = useState(true)
      return (
        <div>
          {open && <IconButton icon="undo" label="Undo" />}
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <TooltipLayer />
        </div>
      )
    }
    render(<Menu />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Undo' }), mouse)
    wait(HOVER_MS + 10)
    expect(tip()).toBeTruthy()
    act(() => screen.getByText('close').click())
    wait(600)
    expect(tip()).toBeNull()
  })
})

describe('tooltip: where it goes', () => {
  const view = { width: 1000, height: 700 }
  const size = { width: 100, height: 28 }
  it('centred below the control', () => {
    const p = placeTip({ left: 400, top: 100, width: 36, height: 36 }, size, view)
    expect(p.side).toBe('below')
    expect(p.left).toBeCloseTo(400 + 18 - 50)
    expect(p.top).toBeGreaterThan(136)
  })
  it('above when there is no room below', () => {
    const p = placeTip({ left: 400, top: 680, width: 36, height: 36 }, size, view)
    expect(p.side).toBe('above')
    expect(p.top).toBeLessThan(680)
  })
  it('never outside the window, left or right', () => {
    expect(placeTip({ left: 0, top: 100, width: 36, height: 36 }, size, view).left).toBeGreaterThanOrEqual(6)
    const r = placeTip({ left: 990, top: 100, width: 36, height: 36 }, size, view)
    expect(r.left + size.width).toBeLessThanOrEqual(view.width - 6)
  })
})

describe('shared components: names, states and roles', () => {
  it('IconButton: the label is the accessible name, there is no native title, the state is aria-pressed', () => {
    render(<IconButton icon="undo" label="Undo" selected />)
    const b = screen.getByRole('button', { name: 'Undo' })
    expect(b.getAttribute('title')).toBeNull()
    expect(b.getAttribute('aria-pressed')).toBe('true')
  })

  it('IconButton keeps the older "active" name and a caption', () => {
    render(<IconButton icon="undo" label="Undo" active caption="Undo" />)
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('a radio or checkbox role puts the chosen state in aria-checked', () => {
    render(
      <>
        <IconTile icon="undo" label="One" role="menuitemradio" selected />
        <IconTile icon="redo" label="Two" role="menuitemcheckbox" selected={false} />
      </>
    )
    expect(screen.getByRole('menuitemradio', { name: 'One' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Two' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('menuitemradio', { name: 'One' }).getAttribute('aria-pressed')).toBeNull()
  })

  it('the chosen option is a highlighted background; there is no tick and no text', () => {
    render(<IconTile icon="undo" label="One" role="radio" selected />)
    const b = screen.getByRole('radio', { name: 'One' })
    expect(b.className).toContain('bg-brand/20')
    expect(b.textContent).toBe('')
    expect(b.querySelector('svg')).toBeTruthy()
  })

  it('every control in a toggle group has a name; picking one calls back; a disabled one does not', () => {
    const onChange = vi.fn()
    render(
      <IconToggleGroup
        label="Fit"
        value="width"
        onChange={onChange}
        items={[
          { value: 'width', icon: 'undo', label: 'Fit width' },
          { value: 'page', icon: 'redo', label: 'Fit page' },
          { value: 'height', icon: 'copy', label: 'Fit height', disabled: true },
        ]}
      />
    )
    const group = screen.getByRole('radiogroup', { name: 'Fit' })
    expect(group.querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: 'Fit width' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: 'Fit page' }))
    expect(onChange).toHaveBeenCalledWith('page')
    fireEvent.click(screen.getByRole('radio', { name: 'Fit height' }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('Swatch: a named round button with a ring when chosen', () => {
    const onClick = vi.fn()
    render(
      <>
        <Swatch label="Dark" color="#121212" selected onClick={onClick} />
        <Swatch label="Light" color="#fff" selected={false} onClick={onClick} />
      </>
    )
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('touch targets: the box is 36 px, 44 px on a touch screen (one size everywhere)', () => {
    render(<IconTile icon="undo" label="Undo" />)
    const cls = screen.getByRole('button', { name: 'Undo' }).className
    expect(cls).toContain('h-9 w-9')
    expect(cls).toContain('[@media(pointer:coarse)]:h-11')
  })

  it('<Tooltip> wraps any element and keeps its own handlers', () => {
    focusVisible(true)
    const onFocus = vi.fn()
    render(
      <>
        <Tooltip label="Open the thing">
          <a href="#x" onFocus={onFocus}>
            go
          </a>
        </Tooltip>
        <TooltipLayer />
      </>
    )
    act(() => screen.getByText('go').focus())
    expect(onFocus).toHaveBeenCalled()
    expect(tip()?.textContent).toContain('Open the thing')
  })
})
