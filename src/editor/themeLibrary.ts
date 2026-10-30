import { useEffect, useState } from 'react'
import { LocalThemeRepository, type ThemeRepository } from '@/core/theme/custom'
import type { Theme } from '@/core/theme/model'

/**
 * The user's own themes. Local storage today; a Drive or cloud repository can replace this one without the panel
 * changing (it only knows the `ThemeRepository` interface).
 */
export let themeRepository: ThemeRepository = new LocalThemeRepository()

/** Swaps the repository (used by tests, and later by Drive/cloud storage). */
export function setThemeRepository(repo: ThemeRepository) {
  themeRepository = repo
}

/** The saved themes, kept up to date as they change. */
export function useSavedThemes(): Theme[] {
  const [themes, setThemes] = useState<Theme[]>([])
  useEffect(() => {
    let alive = true
    const load = () => void themeRepository.list().then((t) => alive && setThemes(t))
    load()
    const off = themeRepository.subscribe(load)
    return () => {
      alive = false
      off()
    }
  }, [])
  return themes
}
