import { ARROWS, COLOR_NAMES, EMOJIS, PRIORITY_COUNT, PROGRESS_STEPS, SYMBOLS, makeMark } from '@/core/marks'
import { Icon } from '@/ui/icons'
import { clearMarksSelected, toggleMarkSelected } from '../content'
import { useEditor } from '../store'
import { MarkBadge } from './MarkBadge'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </section>
  )
}

function Pick({ mark, label, on }: { mark: string; label: string; on: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      onClick={() => toggleMarkSelected(mark)}
      className={`grid h-8 w-8 place-items-center rounded-ui border transition-transform hover:scale-110 ${on ? 'border-brand bg-brand/15' : 'border-transparent hover:bg-bg'}`}
    >
      <MarkBadge mark={mark} size={22} />
    </button>
  )
}

/** The marks that can be put before a topic's text. Clicking a mark again removes it. */
export function MarkPanel() {
  const selected = useEditor((s) => s.selected)
  const topics = useEditor((s) => s.topics)
  const primary = selected[selected.length - 1]
  const current = new Set(primary ? (topics[primary]?.marks ?? []) : [])
  const on = (m: string) => current.has(m)
  const none = selected.length === 0

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-muted">
          <Icon name="mark" size={16} />
          {none ? 'Select a topic, then click a mark' : `${selected.length} topic${selected.length > 1 ? 's' : ''} selected`}
        </span>
        <button type="button" onClick={clearMarksSelected} disabled={none} aria-label="Remove all marks" title="Remove all marks" className="grid h-8 w-8 place-items-center rounded-ui border border-line hover:bg-bg disabled:opacity-40">
          <Icon name="eraser" size={16} />
        </button>
      </div>
      <Group title="Priority">
        {Array.from({ length: PRIORITY_COUNT }, (_, i) => i + 1).map((n) => (
          <Pick key={n} mark={makeMark('priority', n)} label={`Priority ${n}`} on={on(makeMark('priority', n))} />
        ))}
      </Group>
      <Group title="Progress">
        {PROGRESS_STEPS.map((n) => (
          <Pick key={n} mark={makeMark('progress', n)} label={n === 100 ? 'Done' : `${n}% done`} on={on(makeMark('progress', n))} />
        ))}
      </Group>
      <Group title="Emoji">
        {EMOJIS.map((e) => (
          <Pick key={e} mark={makeMark('emoji', e)} label={`Emoji ${e}`} on={on(makeMark('emoji', e))} />
        ))}
      </Group>
      <Group title="Portrait">
        {COLOR_NAMES.map((c) => (
          <Pick key={c} mark={makeMark('portrait', c)} label={`Portrait, ${c}`} on={on(makeMark('portrait', c))} />
        ))}
      </Group>
      <Group title="Star">
        {COLOR_NAMES.map((c) => (
          <Pick key={c} mark={makeMark('star', c)} label={`Star, ${c}`} on={on(makeMark('star', c))} />
        ))}
      </Group>
      <Group title="Flag">
        {COLOR_NAMES.map((c) => (
          <Pick key={c} mark={makeMark('flag', c)} label={`Flag, ${c}`} on={on(makeMark('flag', c))} />
        ))}
      </Group>
      <Group title="Arrow">
        {ARROWS.map((a) => (
          <Pick key={a} mark={makeMark('arrow', a)} label={`Arrow ${a}`} on={on(makeMark('arrow', a))} />
        ))}
      </Group>
      <Group title="Symbol">
        {SYMBOLS.map((s) => (
          <Pick key={s} mark={makeMark('symbol', s)} label={s} on={on(makeMark('symbol', s))} />
        ))}
      </Group>
    </div>
  )
}
