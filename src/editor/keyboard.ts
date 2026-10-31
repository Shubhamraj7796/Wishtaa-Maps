import { cmdPasteText } from './actions'
import { addImageToTopic, currentTopicId, firstImageFile } from './images'
import { showNotice } from './notice'
import { blockedInReadMode } from './readmode'
import { commandFor } from './registry'
import { useEditor } from './store'

export let spaceDown = false

function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/** A focused button keeps Enter and Space for itself (activating it). */
function onButton(t: EventTarget | null): boolean {
  return !!(t as HTMLElement | null)?.closest?.('button')
}

/** Global shortcuts. Returns a cleanup function. */
export function installKeyboard(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && onButton(e.target)) return
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
    const editing = useEditor.getState().editingId !== null
    if (typing(e.target) && !editing) return // search box, title, palette: normal text paste
    if (useEditor.getState().readOnly) {
      e.preventDefault() // nothing can be pasted into a map that is being read
      blockedInReadMode('Pasting')
      return
    }

    // An image on the clipboard goes into the topic being edited or selected.
    const image = firstImageFile(e.clipboardData)
    if (image) {
      e.preventDefault()
      const target = currentTopicId()
      if (target) void addImageToTopic(image, target)
      else showNotice('Select a topic first, then paste the image.')
      return
    }
    // Some other kind of file (PDF, zip...): say so instead of silently doing nothing.
    if ((e.clipboardData?.files.length ?? 0) > 0) {
      e.preventDefault()
      showNotice('Only image files (PNG, JPEG, WebP, GIF) can be added to a topic.')
      return
    }
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
