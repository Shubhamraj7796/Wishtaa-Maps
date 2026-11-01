import { useEditor } from '../store'

let waiting: ((password: string | null) => void) | null = null

/** Asks for a PDF's password in a dialog. Resolves with what was typed, or null when the person gives up. */
export function askPassword(name: string, wrong: boolean): Promise<string | null> {
  waiting?.(null)
  useEditor.setState({ pdfPassword: { name, wrong } })
  return new Promise((resolve) => {
    waiting = resolve
  })
}

export function answerPassword(password: string | null) {
  const w = waiting
  waiting = null
  useEditor.setState({ pdfPassword: null })
  w?.(password)
}
