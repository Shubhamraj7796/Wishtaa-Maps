/**
 * A small, strict XML reader for untrusted files.
 *
 * It never expands entities beyond the five built-in ones and numeric references, rejects any DOCTYPE or ENTITY
 * declaration (so there is no external or recursive entity expansion), skips processing instructions and comments, and
 * enforces limits on size, depth and element count. It does not touch the DOM, so it behaves the same in a browser,
 * in a worker and in tests.
 */

export class XmlError extends Error {}

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** The text directly inside this element (not inside its children). */
  text: string
}

export interface XmlLimits {
  maxChars: number
  maxDepth: number
  maxNodes: number
}

export const DEFAULT_XML_LIMITS: XmlLimits = { maxChars: 25_000_000, maxDepth: 256, maxNodes: 500_000 }

const NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*/

const BUILTIN: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" }

function decode(s: string): string {
  if (!s.includes('&')) return s
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z][A-Za-z0-9]*);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ''
      return String.fromCodePoint(code)
    }
    // Any other entity is left as written: nothing is ever looked up or expanded.
    return BUILTIN[body] ?? whole
  })
}

export function parseXml(input: string, limits: XmlLimits = DEFAULT_XML_LIMITS): XmlNode {
  const src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  if (src.length > limits.maxChars) throw new XmlError('The XML is too large.')
  if (/<!DOCTYPE|<!ENTITY/i.test(src)) throw new XmlError('XML with a document type or entity declaration is not accepted.')

  const root: XmlNode = { name: '#document', attrs: Object.create(null) as Record<string, string>, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let nodes = 0
  let i = 0
  const n = src.length

  while (i < n) {
    const lt = src.indexOf('<', i)
    const top = stack[stack.length - 1] as XmlNode
    if (lt === -1) {
      top.text += decode(src.slice(i))
      break
    }
    if (lt > i) top.text += decode(src.slice(i, lt))
    i = lt

    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4)
      if (end === -1) throw new XmlError('Unterminated comment.')
      i = end + 3
    } else if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9)
      if (end === -1) throw new XmlError('Unterminated CDATA section.')
      top.text += src.slice(i + 9, end)
      i = end + 3
    } else if (src.startsWith('<?', i)) {
      const end = src.indexOf('?>', i + 2)
      if (end === -1) throw new XmlError('Unterminated processing instruction.')
      i = end + 2
    } else if (src.startsWith('<!', i)) {
      throw new XmlError('Unsupported declaration.')
    } else if (src.startsWith('</', i)) {
      const end = src.indexOf('>', i + 2)
      if (end === -1) throw new XmlError('Unterminated closing tag.')
      const name = src.slice(i + 2, end).trim()
      if (stack.length <= 1 || (stack[stack.length - 1] as XmlNode).name !== name) throw new XmlError(`Unexpected closing tag </${name}>.`)
      stack.pop()
      i = end + 1
    } else {
      // An opening tag: name, attributes, then ">" or "/>".
      let j = i + 1
      const m = NAME.exec(src.slice(j, j + 256))
      if (!m) throw new XmlError('Malformed tag.')
      const node: XmlNode = { name: m[0], attrs: Object.create(null) as Record<string, string>, children: [], text: '' }
      j += m[0].length
      let selfClose = false
      for (;;) {
        while (j < n && /\s/.test(src[j] as string)) j++
        const c = src[j]
        if (c === undefined) throw new XmlError('Unterminated tag.')
        if (c === '>') {
          j++
          break
        }
        if (c === '/' && src[j + 1] === '>') {
          selfClose = true
          j += 2
          break
        }
        const am = NAME.exec(src.slice(j, j + 256))
        if (!am) throw new XmlError('Malformed attribute.')
        j += am[0].length
        while (j < n && /\s/.test(src[j] as string)) j++
        if (src[j] !== '=') throw new XmlError('Attribute without a value.')
        j++
        while (j < n && /\s/.test(src[j] as string)) j++
        const q = src[j]
        if (q !== '"' && q !== "'") throw new XmlError('Attribute value must be quoted.')
        const close = src.indexOf(q, j + 1)
        if (close === -1) throw new XmlError('Unterminated attribute value.')
        node.attrs[am[0]] = decode(src.slice(j + 1, close))
        j = close + 1
      }
      if (++nodes > limits.maxNodes) throw new XmlError('The XML has too many elements.')
      top.children.push(node)
      if (!selfClose) {
        stack.push(node)
        if (stack.length > limits.maxDepth) throw new XmlError('The XML is nested too deeply.')
      }
      i = j
    }
  }

  if (stack.length !== 1) throw new XmlError('The XML ends before every element is closed.')
  const first = root.children[0]
  if (!first || root.children.length !== 1) throw new XmlError('The XML must have exactly one root element.')
  return first
}

/** The first child element with this name. */
export const child = (node: XmlNode | undefined, name: string): XmlNode | undefined => node?.children.find((c) => c.name === name)

/** All child elements with this name. */
export const childrenNamed = (node: XmlNode | undefined, name: string): XmlNode[] => (node ? node.children.filter((c) => c.name === name) : [])

/** Follows a path of child names, e.g. `path(shape, 'ShapeFormat', 'FillFormat', 'Color')`. */
export function path(node: XmlNode | undefined, ...names: string[]): XmlNode | undefined {
  let cur = node
  for (const n of names) cur = child(cur, n)
  return cur
}
