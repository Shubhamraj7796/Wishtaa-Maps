import type { Branch } from '../model/commands'
import { buildIndex, childrenOf, topLevelOnly, type TopicMap } from '../model/tree'

export interface OutlineNode {
  text: string
  children: OutlineNode[]
}

const BULLET = /^(?:[-*+•]\s+|\d+[.)]\s+|#{1,6}\s+)/

/** Parses indented text (tabs or spaces, optional bullets) into a forest. */
export function parseOutline(text: string): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: { indent: number; node: OutlineNode }[] = []
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue
    const expanded = raw.replace(/\t/g, '    ')
    const indent = expanded.length - expanded.trimStart().length
    const node: OutlineNode = { text: expanded.trim().replace(BULLET, '').trim(), children: [] }
    if (!node.text) continue
    while (stack.length && (stack[stack.length - 1]?.indent ?? 0) >= indent) stack.pop()
    const parent = stack[stack.length - 1]
    if (parent) parent.node.children.push(node)
    else roots.push(node)
    stack.push({ indent, node })
  }
  return roots
}

export function outlineToBranches(nodes: OutlineNode[]): Branch[] {
  return nodes.map((n) => ({
    data: { text: n.text, collapsed: false, style: {}, marks: [], note: '', tags: [], task: null, link: null },
    children: outlineToBranches(n.children),
  }))
}

/** Plain-text outline (tab-indented) of the given branches. */
export function toOutline(topics: TopicMap, ids: string[]): string {
  const idx = buildIndex(topics)
  const lines: string[] = []
  const walk = (id: string, depth: number) => {
    const t = topics[id]
    if (!t) return
    lines.push('\t'.repeat(depth) + t.text)
    childrenOf(idx, id).forEach((c) => walk(c.id, depth + 1))
  }
  topLevelOnly(topics, ids).forEach((id) => walk(id, 0))
  return lines.join('\n')
}
