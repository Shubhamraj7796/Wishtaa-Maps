import { useMemo } from 'react'
import { useMatch } from 'react-router-dom'
import { downscaleImage } from '@/core/images/process'
import { imageStore } from '@/editor/images'
import { useFiles } from './FilesContext'
import { importEmmx, type ImportReport, type ImportSummary } from './importEmmx'
import { Modal, buttonPrimary, buttonSecondary } from './Modal'
import { FileKindIcon } from './FileBrowser'
import { plural } from './format'
import { Info } from './icons'

/** Opens the file picker for .emmx files (MindMaster / EdrawMind) and imports what is chosen. */
export function useImportEmmx() {
  const f = useFiles()
  const inFolder = useMatch('/files/:folderId')
  const parentId = inFolder?.params.folderId ?? null
  const { repo, open, notify, setDialog } = f

  return useMemo(() => {
    const run = async (files: File[], folder: string | null) => {
      notify(files.length === 1 ? `Importing "${files[0]?.name}"…` : `Importing ${files.length} files…`)
      const summaries: ImportSummary[] = []
      for (const file of files) summaries.push(await importEmmx(file, { repo, images: imageStore, parentId: folder, downscale: downscaleImage }))
      const made = summaries.flatMap((s) => s.files)
      const clean = summaries.length === 1 && !summaries[0]?.error && summaries[0]?.warnings.length === 0 && made.length === 1
      if (clean && made[0]) {
        notify(`Imported "${made[0].record.name}": ${plural(made[0].topics, 'topic')}, ${plural(made[0].images, 'picture')}.`)
        open(made[0].record)
      } else {
        setDialog({ kind: 'importReport', report: { summaries } })
      }
    }

    /** Asks for one or more .emmx files. Must be called from a click. */
    const pick = (folder: string | null = parentId) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.emmx'
      input.multiple = true
      input.onchange = () => {
        const files = [...(input.files ?? [])]
        if (files.length) void run(files, folder)
      }
      input.click()
    }
    return { pick, run }
  }, [repo, open, notify, setDialog, parentId])
}

/** What an import did: maps created, what was left out, and shape types to send samples of. */
export function ImportReportDialog({ report, onClose }: { report: ImportReport; onClose: () => void }) {
  const f = useFiles()
  const made = report.summaries.flatMap((s) => s.files)
  const unknown = report.summaries.flatMap((s) => Object.entries(s.unknownTypes))
  const unsupported = report.summaries.flatMap((s) => Object.entries(s.unsupportedElements))
  const title = made.length ? `Imported ${plural(made.length, 'map')}` : 'Nothing was imported'

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        {report.summaries.map((s) => (
          <section key={s.fileName} aria-label={s.fileName} className="space-y-2">
            {report.summaries.length > 1 && <h3 className="font-semibold">{s.fileName}</h3>}
            {s.error && (
              <p role="alert" className="rounded-ui border border-bad/50 bg-bad/10 px-3 py-2">
                {s.error}
              </p>
            )}
            {s.files.length > 0 && (
              <ul className="divide-y divide-line rounded-ui border border-line">
                {s.files.map((m) => (
                  <li key={m.record.id} className="flex items-center gap-3 px-3 py-2">
                    <FileKindIcon type="map" size={18} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.record.name}</span>
                      <span className="block text-xs text-muted">
                        {plural(m.topics, 'topic')}, {plural(m.images, 'picture')}
                      </span>
                    </span>
                    <button
                      type="button"
                      className={buttonSecondary}
                      onClick={() => {
                        onClose()
                        f.open(m.record)
                      }}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {s.warnings.length > 0 && (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Info size={13} aria-hidden="true" /> Left out or changed
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ))}
        {(unknown.length > 0 || unsupported.length > 0) && (
          <div className="rounded-ui border border-line bg-bg px-3 py-2 text-xs">
            <p className="font-semibold">Not supported yet</p>
            <p className="mt-0.5 text-muted">If you want these imported, send a sample file so support can be added:</p>
            <p className="mt-1">
              {[...unknown.map(([n, c]) => `shape “${n}” × ${c}`), ...unsupported.map(([n, c]) => `element “${n}” on ${c} topic${c === 1 ? '' : 's'}`)].join(', ')}
            </p>
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" data-autofocus className={buttonPrimary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
