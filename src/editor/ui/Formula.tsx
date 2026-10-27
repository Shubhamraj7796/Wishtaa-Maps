import { useEffect, useState } from 'react'

type Katex = typeof import('katex').default

let katexPromise: Promise<Katex> | null = null
const loadKatex = () => (katexPromise ??= import('katex').then((m) => m.default))

/**
 * Renders a LaTeX formula with KaTeX, loaded only when a formula is first shown.
 * Unsafe commands (links, includes) are switched off. Until it loads, the source is shown.
 */
export function Formula({ latex, display = false }: { latex: string; display?: boolean }) {
  const [html, setHtml] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadKatex()
      .then((katex) => {
        if (cancelled) return
        try {
          setHtml(katex.renderToString(latex, { throwOnError: false, displayMode: display, trust: false, strict: 'ignore', output: 'html' }))
        } catch {
          setHtml(null)
        }
      })
      .catch(() => setHtml(null))
    return () => {
      cancelled = true
    }
  }, [latex, display])
  if (!html) return <code className="text-[11px] opacity-80">{latex}</code>
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
