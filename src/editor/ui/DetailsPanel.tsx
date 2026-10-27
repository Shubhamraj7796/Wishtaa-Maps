import { useEffect, useMemo, useRef, useState } from 'react'
import { linkedFile, linkedTopicId } from '@/core/links'
import { MAX_ATTACHMENTS, MAX_INLINE_NOTE, MAX_LATEX_LENGTH, MAX_TABLE_COLS, MAX_TABLE_ROWS, patchTask, setTask } from '@/core/model/content'
import { IMAGE_POSITIONS, type ImagePosition } from '@/core/model/topic'
import { isHex } from '@/core/theme/color'
import { tagColor } from '@/core/settings'
import { Icon, PositionIcon, type IconName } from '@/ui/icons'
import { attachFiles, detachFile, downloadAttachment, formatBytes, pickFiles } from '../attachments'
import { cancelLinkPick, addTagToSelected, applyPictureSizeToAll, removeTagFromSelected, setFormula, setInline, setPicturePosition, setTagColor, setTopicLink, setTopicTable, showPreview, startLinkPick, startOcr, toggleTagFilter } from '../content'
import { commitImageSize, downloadImage, removeImage, replaceImage, resetImageSize } from '../images'
import { mapDoc } from '../mapdoc'
import { getTheme } from '../scene'
import { useEditor, type DetailsSection } from '../store'
import { Formula } from './Formula'
import { Backlinks, FileLinkPicker, useLinkedFile } from './FileLinks'
import { useFiles } from '../../app/FilesContext'

const field = 'rounded-ui border border-line bg-surface px-2 py-1 text-sm'
const iconBtn = 'grid h-8 w-8 shrink-0 place-items-center rounded-ui border border-line hover:bg-bg disabled:opacity-40'

function Sec({ id, title, icon, children }: { id: DetailsSection; title: string; icon: IconName; children: React.ReactNode }) {
  const want = useEditor((s) => s.detailsSection)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (want !== id) return
    ref.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    ref.current?.querySelector<HTMLElement>('input:not([type=checkbox]),textarea,select,button')?.focus({ preventScroll: true })
    useEditor.setState({ detailsSection: null })
  }, [want, id])
  return (
    <section ref={ref} className="space-y-2 border-b border-line px-4 py-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon name={icon} size={15} />
        {title}
      </h3>
      {children}
    </section>
  )
}

const POSITION_LABEL: Record<ImagePosition, string> = {
  above: 'Picture above the text',
  below: 'Picture below the text',
  left: 'Picture left of the text',
  right: 'Picture right of the text',
  behind: 'Picture behind the text',
}

function PictureSection({ id }: { id: string }) {
  const image = useEditor((s) => s.topics[id]?.image)
  const text = useEditor((s) => s.topics[id]?.text ?? '')
  const [keep, setKeep] = useState(true)
  const [w, setW] = useState('')
  const [h, setH] = useState('')
  useEffect(() => {
    setW(String(image?.width ?? ''))
    setH(String(image?.height ?? ''))
  }, [image?.width, image?.height])
  if (!image) return null
  const ratio = image.height / image.width
  const apply = (nw: number, nh: number) => {
    if (Number.isFinite(nw) && Number.isFinite(nh)) commitImageSize(id, Math.min(1200, Math.max(40, Math.round(nw))), Math.min(2400, Math.max(40, Math.round(nh))))
  }
  const pos = image.position ?? 'above'
  return (
    <Sec id="picture" title="Picture" icon="image">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Picture position">
        {IMAGE_POSITIONS.map((p) => (
          <button key={p} type="button" aria-label={POSITION_LABEL[p]} title={POSITION_LABEL[p]} aria-pressed={pos === p} onClick={() => setPicturePosition(id, p)} className={`${iconBtn} ${pos === p ? 'border-brand bg-brand/15' : ''}`}>
            <PositionIcon position={p} />
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <span className="text-muted">W</span>
          <input type="number" min={40} max={1200} aria-label="Picture width" value={w} onChange={(e) => setW(e.target.value)} onBlur={() => apply(Number(w), keep ? Number(w) * ratio : Number(h))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`${field} w-20`} />
        </label>
        <button type="button" aria-label="Keep the picture's proportions" aria-pressed={keep} title="Keep proportions" onClick={() => setKeep(!keep)} className={`${iconBtn} ${keep ? 'border-brand bg-brand/15' : ''}`}>
          <Icon name={keep ? 'link' : 'unlink'} size={15} />
        </button>
        <label className="flex items-center gap-1">
          <span className="text-muted">H</span>
          <input type="number" min={40} max={2400} aria-label="Picture height" value={h} onChange={(e) => setH(e.target.value)} onBlur={() => apply(keep ? Number(h) / ratio : Number(w), Number(h))} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} className={`${field} w-20`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-label="Give every picture this width" title="Apply this width to all pictures" onClick={() => applyPictureSizeToAll(id)} className={iconBtn}><Icon name="details" size={16} /></button>
        <button type="button" aria-label="Back to original size" title="Back to original size" onClick={() => void resetImageSize(id)} className={iconBtn}><Icon name="reset" size={16} /></button>
        <button type="button" aria-label="Replace the picture" title="Replace the picture" onClick={() => void replaceImage(id)} className={iconBtn}><Icon name="replace" size={16} /></button>
        <button type="button" aria-label="Preview the picture" title="Preview" onClick={() => showPreview(image.imageId)} className={iconBtn}><Icon name="preview" size={16} /></button>
        <button type="button" aria-label="Download the picture" title="Download" onClick={() => void downloadImage(image.imageId, text)} className={iconBtn}><Icon name="download" size={16} /></button>
        <button type="button" aria-label="Read text from the picture (OCR)" title="Read text from the picture (OCR)" onClick={() => startOcr(id)} className={iconBtn}><Icon name="ocr" size={16} /></button>
        <button type="button" aria-label="Remove the picture" title="Remove the picture" onClick={() => removeImage(id)} className={`${iconBtn} text-bad`}><Icon name="trash" size={16} /></button>
      </div>
    </Sec>
  )
}

function TagsSection({ id }: { id: string }) {
  const topics = useEditor((s) => s.topics)
  const settings = useEditor((s) => s.settings)
  const filter = useEditor((s) => s.tagFilter)
  const [text, setText] = useState('')
  const theme = getTheme(settings)
  const mine = topics[id]?.tags ?? []
  const all = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of Object.values(topics)) for (const tag of t.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  }, [topics])
  const add = () => {
    if (addTagToSelected(text)) setText('')
  }
  return (
    <Sec id="tags" title="Tags" icon="tag">
      <div className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Add a tag…" aria-label="New tag" maxLength={30} className={`${field} min-w-0 flex-1`} />
        <button type="button" onClick={add} aria-label="Add tag" title="Add tag" className={iconBtn}><Icon name="plus" size={16} /></button>
      </div>
      {mine.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mine.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-xs font-medium" style={{ background: tagColor(t, settings, theme.palette), color: isHex(tagColor(t, settings, theme.palette)) ? '#fff' : undefined }}>
              {t}
              <button type="button" aria-label={`Remove tag ${t}`} onClick={() => removeTagFromSelected(t)} className="grid h-4 w-4 place-items-center rounded-full hover:bg-black/20"><Icon name="close" size={11} /></button>
            </span>
          ))}
        </div>
      )}
      {all.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-muted">Tags in this map. Click to show only topics with them.</div>
          {all.map(([tag, n]) => (
            <div key={tag} className="flex items-center gap-2 text-sm">
              <input type="color" aria-label={`Colour for ${tag}`} value={tagColor(tag, settings, theme.palette)} onChange={(e) => setTagColor(tag, e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-line bg-transparent p-0.5" />
              <button type="button" aria-pressed={filter.includes(tag)} onClick={() => toggleTagFilter(tag)} className={`flex flex-1 items-center justify-between rounded-ui border px-2 py-1 text-left ${filter.includes(tag) ? 'border-brand bg-brand/15' : 'border-line hover:bg-bg'}`}>
                <span className="truncate">{tag}</span>
                <span className="text-xs text-muted">{n}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Sec>
  )
}

function TaskSection({ id }: { id: string }) {
  const task = useEditor((s) => s.topics[id]?.task)
  return (
    <Sec id="task" title="Task" icon="task">
      {!task ? (
        <button type="button" onClick={() => patchTask(mapDoc, id, { done: false })} className={`${field} flex items-center gap-2 hover:bg-bg`}>
          <Icon name="task" size={16} /> Make this topic a task
        </button>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={task.done} onChange={(e) => patchTask(mapDoc, id, { done: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
            <Icon name={task.done ? 'taskDone' : 'task'} size={16} /> {task.done ? 'Done' : 'Not done yet'}
          </label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="space-y-0.5">
              <span className="text-xs text-muted">Start</span>
              <input type="date" value={task.startDate ?? ''} onChange={(e) => patchTask(mapDoc, id, { startDate: e.target.value || undefined })} className={`${field} w-full`} />
            </label>
            <label className="space-y-0.5">
              <span className="text-xs text-muted">Due</span>
              <input type="date" value={task.dueDate ?? ''} onChange={(e) => patchTask(mapDoc, id, { dueDate: e.target.value || undefined })} className={`${field} w-full`} />
            </label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Icon name="details" size={15} />
            <input value={task.assignee ?? ''} maxLength={40} placeholder="Assigned to" aria-label="Assigned to" onChange={(e) => patchTask(mapDoc, id, { assignee: e.target.value || undefined })} className={`${field} min-w-0 flex-1`} />
            <select aria-label="Task priority" value={task.priority ?? ''} onChange={(e) => patchTask(mapDoc, id, { priority: e.target.value ? Number(e.target.value) : undefined })} className={field}>
              <option value="">Priority</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button type="button" onClick={() => setTask(mapDoc, id, null)} aria-label="Remove task" title="Remove task" className={`${iconBtn} text-bad`}><Icon name="trash" size={16} /></button>
        </>
      )}
    </Sec>
  )
}

function LinkSection({ id }: { id: string }) {
  const link = useEditor((s) => s.topics[id]?.link ?? '')
  const topics = useEditor((s) => s.topics)
  const linkFrom = useEditor((s) => s.linkFrom)
  const [text, setText] = useState(link)
  const [picker, setPicker] = useState(false)
  const files = useFiles()
  const linkedTo = useLinkedFile(link)
  const isFileLink = !!linkedFile(link)
  useEffect(() => setText(link.startsWith('#topic:') || link.startsWith('#map:') ? '' : link), [link, id])
  const target = linkedTopicId(link)
  return (
    <Sec id="link" title="Hyperlink" icon="link">
      <div className="flex gap-1.5">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && setTopicLink(id, text)} placeholder="https://…" aria-label="Web address" className={`${field} min-w-0 flex-1`} />
        <button type="button" onClick={() => setTopicLink(id, text)} aria-label="Save link" title="Save link" className={iconBtn}><Icon name="check" size={16} /></button>
        {link && (
          <button type="button" onClick={() => setTopicLink(id, '')} aria-label="Remove link" title="Remove link" className={iconBtn}><Icon name="unlink" size={16} /></button>
        )}
      </div>
      <button type="button" onClick={() => (linkFrom ? cancelLinkPick() : startLinkPick(id))} aria-pressed={!!linkFrom} className={`${field} flex w-full items-center gap-2 hover:bg-bg ${linkFrom ? 'border-brand bg-brand/15' : ''}`}>
        <Icon name="map" size={16} /> {linkFrom ? 'Click a topic in the map… (Esc to cancel)' : 'Link to another topic in this map'}
      </button>
      <button type="button" onClick={() => setPicker(true)} className={`${field} flex w-full items-center gap-2 hover:bg-bg`}>
        <Icon name="notebook" size={16} /> Link to map or knowledge base
      </button>
      {target && <p className="text-xs text-muted">Linked to: {topics[target]?.text || '(untitled topic)'}</p>}
      {isFileLink && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="min-w-0 flex-1 truncate">Linked to file: {linkedTo ? linkedTo.name : 'a file that is no longer here'}</span>
          {linkedTo && (
            <button type="button" onClick={() => files.open(linkedTo)} className="shrink-0 rounded-ui border border-line px-2 py-0.5 hover:bg-bg">Open</button>
          )}
        </p>
      )}
      {picker && <FileLinkPicker topicId={id} onClose={() => setPicker(false)} />}
    </Sec>
  )
}

function AttachmentsSection({ id }: { id: string }) {
  const files = useEditor((s) => s.topics[id]?.attachments) ?? []
  return (
    <Sec id="attachments" title="Attachments" icon="attachment">
      <button type="button" disabled={files.length >= MAX_ATTACHMENTS} onClick={async () => void attachFiles(await pickFiles(), id)} className={`${field} flex items-center gap-2 hover:bg-bg disabled:opacity-40`}>
        <Icon name="attachment" size={16} /> Attach files…
      </button>
      {files.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <Icon name="notebook" size={15} />
          <span className="min-w-0 flex-1 truncate" title={f.name}>{f.name}</span>
          <span className="text-xs text-muted">{formatBytes(f.size)}</span>
          <button type="button" aria-label={`Download ${f.name}`} title="Download" onClick={() => void downloadAttachment(f)} className={iconBtn}><Icon name="download" size={15} /></button>
          <button type="button" aria-label={`Remove ${f.name}`} title="Remove" onClick={() => detachFile(id, f.id)} className={`${iconBtn} text-bad`}><Icon name="trash" size={15} /></button>
        </div>
      ))}
      <p className="text-xs text-muted">Up to {MAX_ATTACHMENTS} files of 10 MB each, kept in this browser.</p>
    </Sec>
  )
}

function InlineNoteSection({ id }: { id: string }) {
  const note = useEditor((s) => s.topics[id]?.inlineNote ?? '')
  const [text, setText] = useState(note)
  useEffect(() => setText(note), [note, id])
  return (
    <Sec id="inline" title="Short note" icon="inlineNote">
      <input value={text} maxLength={MAX_INLINE_NOTE} onChange={(e) => setText(e.target.value)} onBlur={() => setInline(id, text)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="A line shown under the topic" aria-label="Short note" className={`${field} w-full`} />
    </Sec>
  )
}

function LatexSection({ id }: { id: string }) {
  const latex = useEditor((s) => s.topics[id]?.latex ?? '')
  const [text, setText] = useState(latex)
  useEffect(() => setText(latex), [latex, id])
  return (
    <Sec id="latex" title="Formula (LaTeX)" icon="latex">
      <textarea value={text} maxLength={MAX_LATEX_LENGTH} rows={2} onChange={(e) => setText(e.target.value)} onBlur={() => setFormula(id, text)} placeholder="e.g. \frac{a}{b} + \sqrt{x}" aria-label="LaTeX formula" className={`${field} w-full resize-y font-mono`} />
      {text.trim() && (
        <div className="overflow-x-auto rounded-ui border border-line px-2 py-2 text-center" aria-label="Formula preview">
          <Formula latex={text} display />
        </div>
      )}
    </Sec>
  )
}

function TableSection({ id }: { id: string }) {
  const table = useEditor((s) => s.topics[id]?.table) ?? null
  const [rows, setRows] = useState<string[][]>(table ?? [])
  useEffect(() => setRows(table ?? []), [table, id])
  const cols = Math.max(0, ...rows.map((r) => r.length))
  const commit = (next: string[][]) => {
    setRows(next)
    setTopicTable(id, next.length ? next : null)
  }
  const setCell = (i: number, j: number, v: string) => setRows(rows.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r)))
  return (
    <Sec id="table" title="Table" icon="table">
      {rows.length === 0 ? (
        <button type="button" onClick={() => commit([['', ''], ['', '']])} className={`${field} flex items-center gap-2 hover:bg-bg`}>
          <Icon name="table" size={16} /> Add a 2 × 2 table
        </button>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((c, j) => (
                      <td key={j} className="p-0.5">
                        <input value={c} aria-label={`Row ${i + 1}, column ${j + 1}`} maxLength={80} onChange={(e) => setCell(i, j, e.target.value)} onBlur={() => commit(rows)} className={`${field} w-20`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" disabled={rows.length >= MAX_TABLE_ROWS} onClick={() => commit([...rows, Array.from({ length: cols }, () => '')])} className={`${field} hover:bg-bg disabled:opacity-40`}>+ Row</button>
            <button type="button" disabled={cols >= MAX_TABLE_COLS} onClick={() => commit(rows.map((r) => [...r, '']))} className={`${field} hover:bg-bg disabled:opacity-40`}>+ Column</button>
            <button type="button" disabled={rows.length <= 1} onClick={() => commit(rows.slice(0, -1))} className={`${field} hover:bg-bg disabled:opacity-40`}>− Row</button>
            <button type="button" disabled={cols <= 1} onClick={() => commit(rows.map((r) => r.slice(0, -1)))} className={`${field} hover:bg-bg disabled:opacity-40`}>− Column</button>
            <button type="button" onClick={() => commit([])} aria-label="Remove the table" title="Remove the table" className={`${iconBtn} text-bad`}><Icon name="trash" size={16} /></button>
          </div>
        </>
      )}
    </Sec>
  )
}

/** Everything that can be put inside the selected topic besides its text. */
export default function DetailsPanel() {
  const selected = useEditor((s) => s.selected)
  const id = selected[selected.length - 1]
  const exists = useEditor((s) => (id ? !!s.topics[id] : false))
  if (!id || !exists) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted">
        <Icon name="details" size={28} />
        Select a topic to add a picture, tags, a task, a link, attachments, a formula or a table.
      </div>
    )
  }
  return (
    <div key={id}>
      <PictureSection id={id} />
      <TagsSection id={id} />
      <TaskSection id={id} />
      <LinkSection id={id} />
      <Backlinks topicId={id} />
      <AttachmentsSection id={id} />
      <InlineNoteSection id={id} />
      <LatexSection id={id} />
      <TableSection id={id} />
      <section className="px-4 py-3 text-xs text-muted">
        Marks and clipart have their own tabs. Rich notes are in the Notes tab.
      </section>
    </div>
  )
}
