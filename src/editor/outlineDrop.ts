import { buildIndex, childrenOf, isAncestorOf, type TopicMap } from '@/core/model/tree'

/**
 * Dragging a row in the Outline. Where it lands depends on where the pointer is over the row it is dropped on:
 *  - the upper half of the text line: before that topic, as its sibling;
 *  - the lower half: after it, as its sibling (or, when that topic is open and has sub-topics, as its first sub-topic: that is where
 *    the new row would appear in the list);
 *  - dragged well to the right of the topic: as its first sub-topic.
 * The central topic cannot have siblings, so anything dropped on it becomes its first sub-topic.
 */
export type DropMode = 'before' | 'after' | 'child'

export interface Drop {
  parentId: string
  /** The position among the new parent's children once the dragged topic has been taken out of them (what `moveTopic` expects). */
  index: number
}

/** The mode from where the pointer is: `y` is the height inside the row's text line (0 to `line`), `x` how far right of the row's text start. */
export function modeFor(y: number, line: number, x: number, childFrom = 48): DropMode {
  if (x > childFrom) return 'child'
  return y < line / 2 ? 'before' : 'after'
}

/** Where a drop lands, or null when it would change nothing (onto itself, into its own branch, or back to the same place). */
export function resolveDrop(topics: TopicMap, rootId: string, dragId: string, targetId: string, mode: DropMode): Drop | null {
  const dragged = topics[dragId]
  const target = topics[targetId]
  if (!dragged || !target || dragId === rootId || dragId === targetId) return null
  if (isAncestorOf(topics, dragId, targetId)) return null // into its own branch
  const idx = buildIndex(topics)
  const open = !target.collapsed && childrenOf(idx, targetId).filter((k) => k.id !== dragId).length > 0
  let drop: Drop
  if (mode === 'child' || targetId === rootId || (mode === 'after' && open)) {
    drop = { parentId: targetId, index: 0 }
  } else {
    const parentId = target.parentId
    if (!parentId || !topics[parentId]) return null
    const siblings = childrenOf(idx, parentId).filter((s) => s.id !== dragId)
    const at = siblings.findIndex((s) => s.id === targetId)
    drop = { parentId, index: mode === 'before' ? at : at + 1 }
  }
  // Back where it already is: nothing to do (and no undo step to leave behind).
  if (dragged.parentId === drop.parentId) {
    const now = childrenOf(idx, drop.parentId).findIndex((s) => s.id === dragId)
    if (now === drop.index) return null
  }
  return drop
}
