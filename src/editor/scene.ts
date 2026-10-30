import { useMemo } from 'react'
import { buildScene, type Scene } from '@/core/layout/engine'
import type { TopicMap } from '@/core/model/tree'
import type { MapSettings } from '@/core/settings'
import { resolveTheme } from '@/core/settings'
import { previewSettings } from '@/core/theme/apply'
import { levelOf, shapeFor, type ResolvedTheme } from '@/core/theme/resolve'
import { useEditor } from './store'

let last: { key: unknown[]; scene: Scene } | null = null

function compute(
  topics: TopicMap,
  rootId: string,
  levels: number | null,
  focusId: string | null,
  reveal: string[],
  settings: MapSettings,
  theme: ResolvedTheme
): Scene {
  const key = [topics, rootId, levels, focusId, reveal, settings, theme]
  if (last && last.key.every((v, i) => v === key[i])) return last.scene
  const sceneRoot = focusId && topics[focusId] ? focusId : rootId
  const scene = buildScene(topics, {
    rootId,
    maxDepth: levels,
    focusId,
    reveal: new Set(reveal),
    layout: settings.layout,
    connector: settings.connector,
    spacing: settings.spacing,
    overlap: settings.overlap,
    alignSiblings: settings.alignSiblings,
    freePositioning: settings.freePositioning,
    numbering: settings.numbering,
    // The shape a topic will be drawn with decides how much room it needs.
    shapeOf: (t, depth) => shapeFor(theme, levelOf(depth, t.id === sceneRoot)),
  })
  last = { key, scene }
  return scene
}

// Resolved theme, cached on the settings object so it keeps a stable identity between renders.
let themeCache: { settings: MapSettings; theme: ResolvedTheme } | null = null
export function getTheme(settings: MapSettings): ResolvedTheme {
  if (themeCache?.settings !== settings) themeCache = { settings, theme: resolveTheme(settings) }
  return themeCache.theme
}

/** Current scene (memoised on the inputs). Safe to call outside React. */
export function getScene(): Scene {
  const s = useEditor.getState()
  return compute(s.topics, s.rootId, s.levels, s.focusId, s.reveal, s.settings, getTheme(s.settings))
}

export function useTheme(): ResolvedTheme {
  const settings = useEditor((s) => s.settings)
  const preview = useEditor((s) => s.themePreview)
  return useMemo(() => getTheme(preview ? previewSettings(settings, preview) : settings), [settings, preview])
}

export function useScene(): Scene {
  const topics = useEditor((s) => s.topics)
  const rootId = useEditor((s) => s.rootId)
  const levels = useEditor((s) => s.levels)
  const focusId = useEditor((s) => s.focusId)
  const reveal = useEditor((s) => s.reveal)
  const settings = useEditor((s) => s.settings)
  const theme = useTheme()
  return useMemo(
    () => compute(topics, rootId, levels, focusId, reveal, settings, theme),
    [topics, rootId, levels, focusId, reveal, settings, theme]
  )
}
