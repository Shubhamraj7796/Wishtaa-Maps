import { useEffect, useState } from 'react'
import type { FileIndex } from '@/core/files/types'
import { useFiles } from './FilesContext'

/** Search indexes of every file (topics, notes, tags, resources), refreshed whenever files change. */
export function useIndexes(): FileIndex[] {
  const { repo, files } = useFiles()
  const [indexes, setIndexes] = useState<FileIndex[]>([])
  useEffect(() => {
    let alive = true
    void repo.allIndexes().then((i) => alive && setIndexes(i))
    return () => {
      alive = false
    }
  }, [repo, files])
  return indexes
}
