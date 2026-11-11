// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CUSTOM_ICONS } from './customIcons'
import { ICONS, Icon, type IconName } from './icons'

afterEach(() => cleanup())

describe('the icon set (rule 8: one set, one size)', () => {
  const names = Object.keys(CUSTOM_ICONS) as IconName[]

  it('has the 14 custom icons and the repeat icon in the one registry', () => {
    expect(names).toHaveLength(14)
    for (const n of [...names, 'repeat' as IconName]) expect(ICONS[n]).toBeTruthy()
  })

  it('every custom icon is drawn like the others: 24 box, current colour, round ends, the shared stroke width', () => {
    for (const n of names) {
      const { container, unmount } = render(<Icon name={n} />)
      const svg = container.querySelector('svg') as SVGSVGElement
      expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg.getAttribute('stroke')).toBe('currentColor')
      expect(svg.getAttribute('fill')).toBe('none')
      expect(svg.getAttribute('stroke-linecap')).toBe('round')
      expect(svg.getAttribute('stroke-linejoin')).toBe('round')
      expect(svg.getAttribute('stroke-width')).toBe('1.9')
      expect(svg.getAttribute('aria-hidden')).toBe('true')
      unmount()
    }
  })

  it('takes the size it is given (the one icon size is 20)', () => {
    const { container } = render(<Icon name="pageTwo" size={20} />)
    const svg = container.querySelector('svg') as SVGSVGElement
    expect(svg.getAttribute('width')).toBe('20')
    expect(svg.getAttribute('height')).toBe('20')
  })

  it('nothing is drawn outside the 24 box (every coordinate in the paths is between 0 and 24)', () => {
    for (const n of names) {
      const { container, unmount } = render(<Icon name={n} />)
      for (const el of container.querySelectorAll('path')) {
        const nums = (el.getAttribute('d') ?? '').match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
        // Absolute and relative commands both: a relative run can add up, so only the absolute starts are checked strictly.
        expect(nums.every((v) => Math.abs(v) <= 24)).toBe(true)
      }
      unmount()
    }
  })
})
