import { useMemo } from 'react'
import { buildScene, type Scene } from '@/core/layout/mindmap'
import type { TopicMap } from '@/core/model/tree'
import { useEditor } from './store'

let last: { key: unknown[]; scene: Scene } | null = null

function compute(topics: TopicMap, rootId: string, levels: number | null, focusId: string | null, reveal: string[]): Scene {
  const key = [topics, rootId, levels, focusId, reveal]
  if (last && last.key.every((v, i) => v === key[i])) return last.scene
  const scene = buildScene(topics, { rootId, maxDepth: levels, focusId, reveal: new Set(reveal) })
  last = { key, scene }
  return scene
}

/** Current scene (memoised on the inputs). Safe to call outside React. */
export function getScene(): Scene {
  const s = useEditor.getState()
  return compute(s.topics, s.rootId, s.levels, s.focusId, s.reveal)
}

export function useScene(): Scene {
  const topics = useEditor((s) => s.topics)
  const rootId = useEditor((s) => s.rootId)
  const levels = useEditor((s) => s.levels)
  const focusId = useEditor((s) => s.focusId)
  const reveal = useEditor((s) => s.reveal)
  return useMemo(() => compute(topics, rootId, levels, focusId, reveal), [topics, rootId, levels, focusId, reveal])
}
