import { EmmxError, parseEmmx, type EmmxOptions, type ImportedTopic } from '@/core/import/emmx/parse'
import { MAX_IMPORT_DIMENSION } from '@/core/import/emmx/images'
import { MAX_FILE_BYTES } from '@/core/import/emmx/zip'
import { buildMapContent } from '@/core/import/emmx/build'
import { saveMetaFromContent } from '@/core/files/content'
import { DriveError } from '@/core/drive/errors'
import type { Placement } from '@/core/drive/placement'
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

// ---- Saving imported maps in Google Drive ------------------------------------------------------------------------

/** The Drive operation import needs (implemented by `DriveRepository`, or a wrapper that signs in first). */
export interface DriveSender {
  moveToDrive(id: string, parentFolderId?: string): Promise<FileRecord>
}

export interface DriveUploadFailure {
  summaryIndex: number
  fileIndex: number
  error: DriveError
}

/** The result of importing to a chosen place. Failures are Drive uploads that did not work; those maps are safe in this browser. */
export interface ImportOutcome {
  summaries: ImportSummary[]
  failures: DriveUploadFailure[]
}

const asDriveError = (e: unknown): DriveError => (e instanceof DriveError ? e : new DriveError('other', e instanceof Error && e.message ? e.message : 'Something went wrong with Google Drive.'))

async function upload(outcome: ImportOutcome, targets: { summaryIndex: number; fileIndex: number }[], drive: DriveSender, folderId: string | undefined): Promise<ImportOutcome> {
  const summaries = outcome.summaries.map((s) => ({ ...s, files: [...s.files] }))
  const failures: DriveUploadFailure[] = []
  for (const t of targets) {
    const f = summaries[t.summaryIndex]?.files[t.fileIndex]
    if (!f) continue
    try {
      const record = await drive.moveToDrive(f.record.id, folderId)
      ;(summaries[t.summaryIndex] as ImportSummary).files[t.fileIndex] = { ...f, record }
    } catch (e) {
      failures.push({ ...t, error: asDriveError(e) })
    }
  }
  return { summaries, failures }
}

/**
 * Imports files to a chosen place. In Drive, each map is first created in this browser (so it can never be lost) and
 * then created in Drive as a `.wishtaa` file together with its pictures, so the first autosave updates that file instead
 * of making a copy. A Drive failure is reported in `failures`; the map stays in this browser.
 */
export async function importToPlacement(files: PickedFile[], deps: Omit<ImportDeps, 'parentId'>, placement: Placement, drive: DriveSender): Promise<ImportOutcome> {
  const summaries: ImportSummary[] = []
  for (const file of files) summaries.push(await importEmmx(file, { ...deps, parentId: placement.storage === 'local' ? placement.parentId : null }))
  const outcome: ImportOutcome = { summaries, failures: [] }
  if (placement.storage === 'local') return outcome
  const targets = summaries.flatMap((s, summaryIndex) => s.files.map((_, fileIndex) => ({ summaryIndex, fileIndex })))
  return upload(outcome, targets, drive, placement.folder?.id)
}

/** Tries Drive again for the maps that failed. A folder that no longer exists falls back to the Wishtaa Maps folder. */
export async function retryDriveUpload(outcome: ImportOutcome, drive: DriveSender, placement: Placement): Promise<ImportOutcome> {
  const gone = outcome.failures.some((f) => f.error.kind === 'notfound')
  const folderId = gone || placement.storage !== 'drive' ? undefined : placement.folder?.id
  const next = await upload(outcome, outcome.failures, drive, folderId)
  return next
}
