import { EmmxError, parseEmmx, type EmmxOptions, type ImportedTopic } from '@/core/import/emmx/parse'
import { MAX_IMPORT_DIMENSION } from '@/core/import/emmx/images'
import { MAX_FILE_BYTES } from '@/core/import/emmx/zip'
import { buildMapContent } from '@/core/import/emmx/build'
import { saveMetaFromContent } from '@/core/files/content'
import type { FileRecord, FileRepository } from '@/core/files/types'
import type { ImageStore } from '@/core/images/store'

/** What happened to one imported map. */
export interface ImportedFile {
  record: FileRecord
  topics: number
  images: number
}

/** What happened to one `.emmx` file (or why it failed). */
export interface ImportSummary {
  fileName: string
  files: ImportedFile[]
  warnings: string[]
  /** Shape types we don't understand yet, with counts: worth sending a sample of. */
  unknownTypes: Record<string, number>
  unsupportedElements: Record<string, number>
  error?: string
}

export interface ImportReport {
  summaries: ImportSummary[]
}

export interface ImportDeps {
  repo: FileRepository
  images: ImageStore
  parentId: string | null
  options?: EmmxOptions
  /** Reduces a very large picture (browser only). */
  downscale?: (blob: Blob, max: number) => Promise<{ blob: Blob; width: number; height: number }>
}

export interface PickedFile {
  name: string
  size: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/** The image id used for an imported picture: the same picture always gets the same id, so it is stored once. */
export const importedImageId = (hash: string) => `imp-${hash.slice(0, 32)}`

const DEFAULT_PAGE_NAME = /^page[\s_-]*\d*$/i

const countTopics = (t: ImportedTopic): number => {
  let n = 0
  const stack = [t]
  while (stack.length) {
    const x = stack.pop() as ImportedTopic
    n++
    stack.push(...x.children)
  }
  return n
}

const countImages = (t: ImportedTopic): number => {
  let n = 0
  const stack = [t]
  while (stack.length) {
    const x = stack.pop() as ImportedTopic
    if (x.image) n++
    stack.push(...x.children)
  }
  return n
}

/**
 * Imports one `.emmx` file as normal, editable Wishtaa maps (one per page): pictures go to the image store with their
 * original bytes, then each map is created as a file. Never throws for a bad file; the problem is in `error`.
 */
export async function importEmmx(file: PickedFile, deps: ImportDeps): Promise<ImportSummary> {
  const summary: ImportSummary = { fileName: file.name, files: [], warnings: [], unknownTypes: {}, unsupportedElements: {} }
  try {
    if (file.size > MAX_FILE_BYTES) throw new EmmxError('That file is larger than 50 MB, which is more than we import.')
    const result = await parseEmmx(await file.arrayBuffer(), deps.options)
    summary.warnings = [...result.warnings]
    summary.unknownTypes = { ...result.stats.unknownTypes }
    summary.unsupportedElements = { ...result.stats.unsupportedElements }

    // Pictures first, so a map never refers to one that isn't stored.
    const ids = new Map<string, string>()
    let failed = 0
    for (const img of result.images.values()) {
      const id = importedImageId(img.hash)
      try {
        if (await deps.images.getMeta(id)) {
          ids.set(img.hash, id)
          continue
        }
        let blob = new Blob([img.bytes as BlobPart], { type: img.type })
        let { width, height } = img
        if (img.needsDownscale && deps.downscale) {
          try {
            const small = await deps.downscale(blob, MAX_IMPORT_DIMENSION)
            blob = small.blob
            width = small.width
            height = small.height
          } catch {
            summary.warnings.push('A very large picture could not be reduced and was kept at its original size')
          }
        }
        await deps.images.put({ id, width, height, type: blob.type || img.type, size: blob.size, blob })
        ids.set(img.hash, id)
      } catch {
        failed++
      }
    }
    if (failed) summary.warnings.push(`${failed} picture${failed === 1 ? '' : 's'} could not be saved in this browser and ${failed === 1 ? 'was' : 'were'} left out`)

    const base = file.name.replace(/\.emmx$/i, '').trim() || 'Imported map'
    for (const map of result.maps) {
      const name = result.maps.length === 1 ? base : DEFAULT_PAGE_NAME.test(map.name) ? `${base} - ${map.name}` : map.name
      const content = buildMapContent(map, (h) => ids.get(h))
      const record = await deps.repo.create({ type: 'map', name, parentId: deps.parentId, content })
      const saved = await deps.repo.saveContent(record.id, content, saveMetaFromContent(record.id, content))
      summary.files.push({ record: saved, topics: countTopics(map.root), images: countImages(map.root) })
    }

    // So more samples can be sent and support added later.
    if (Object.keys(summary.unknownTypes).length || Object.keys(summary.unsupportedElements).length) {
      console.info('[emmx import] not supported yet', { file: file.name, unknownShapeTypes: summary.unknownTypes, unsupportedElements: summary.unsupportedElements })
    }
  } catch (e) {
    summary.error = e instanceof EmmxError ? e.message : 'This file could not be imported.'
    if (!(e instanceof EmmxError)) console.error('[emmx import] failed', e)
  }
  return summary
}
