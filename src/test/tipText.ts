import { act, fireEvent } from '@testing-library/react'
import { currentTip, hideTip } from '@/ui/Tooltip'

/**
 * The text the shared tooltip shows for a control, read the way a keyboard user gets it (focus), without waiting for a hover.
 * jsdom has no keyboard-versus-mouse focus, so the focus is said to come from the keyboard.
 */
export function tipOf(el: Element): string {
  const real = Element.prototype.matches
  Element.prototype.matches = function (this: Element, sel: string) {
    return sel === ':focus-visible' ? true : real.call(this, sel)
  }
  try {
    hideTip()
    act(() => {
      fireEvent.focus(el)
    })
    const text = currentTip()?.text ?? ''
    act(() => hideTip())
    return text
  } finally {
    Element.prototype.matches = real
  }
}
