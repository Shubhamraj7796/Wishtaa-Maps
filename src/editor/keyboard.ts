import { cmdPasteText } from './actions'
import { commandFor } from './registry'

export let spaceDown = false

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** Global shortcuts. Returns a cleanup function. */
export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === ' ' && !typing(e.target)) {
      spaceDown = true
      e.preventDefault()
      return
    }
    if (typing(e.target)) return
    const cmd = commandFor(e)
    if (!cmd) return
    e.preventDefault()
    cmd.run()
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') spaceDown = false
  }
  const onPaste = (e: ClipboardEvent) => {
    if (typing(e.target)) return
    e.preventDefault()
    cmdPasteText(e.clipboardData?.getData('text/plain') ?? '')
  }
  const onBlur = () => (spaceDown = false)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('paste', onPaste)
  window.addEventListener('blur', onBlur)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('paste', onPaste)
    window.removeEventListener('blur', onBlur)
  }
}
