import { useEditor } from './store'

let nextId = 0

/** Shows a short message at the bottom of the screen (announced to screen readers). */
export function showNotice(text: string, ms = 6000) {
  const id = ++nextId
  useEditor.setState({ notice: { id, text } })
  setTimeout(() => {
    if (useEditor.getState().notice?.id === id) useEditor.setState({ notice: null })
  }, ms)
}
