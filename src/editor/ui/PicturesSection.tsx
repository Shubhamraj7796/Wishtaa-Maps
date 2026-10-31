import { useEffect, useState } from 'react'
import { limitState } from '@/core/images/limits'
import { mapPictureUsage, type PictureUsage } from '../images'
import { applyOptimize, planOptimize, type OptimizePlan } from '../pictures/optimize'
import { useEditor } from '../store'
import { Section, field } from './panelKit'

const mb = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`)

type Step = { kind: 'idle' } | { kind: 'looking'; done: number; of: number } | { kind: 'ready'; plan: OptimizePlan } | { kind: 'working' } | { kind: 'done'; replaced: number; saved: number }

/** "Pictures: N, total X MB" for the open map, with Optimize pictures (estimate, confirm, one undo step). */
export function PicturesSection() {
  const topics = useEditor((s) => s.topics)
  const [usage, setUsage] = useState<PictureUsage>({ count: 0, bytes: 0 })
  const [step, setStep] = useState<Step>({ kind: 'idle' })
  useEffect(() => {
    let live = true
    void mapPictureUsage().then((u) => live && setUsage(u))
    return () => {
      live = false
    }
  }, [topics, step.kind])
  if (!usage.count && step.kind === 'idle') return null
  const limit = limitState(usage.count, usage.bytes)

  const look = async () => {
    setStep({ kind: 'looking', done: 0, of: usage.count })
    const plan = await planOptimize((done, of) => setStep({ kind: 'looking', done, of }))
    setStep({ kind: 'ready', plan })
  }
  const apply = async (plan: OptimizePlan) => {
    setStep({ kind: 'working' })
    const replaced = await applyOptimize(plan)
    setStep({ kind: 'done', replaced, saved: plan.before - plan.after })
  }

  return (
    <Section title="Pictures">
      <p data-testid="picture-usage" className="text-sm">
        Pictures: {usage.count}, total size {mb(usage.bytes)}
      </p>
      {limit.message && (
        <p role="status" className={`text-xs ${limit.state === 'hard' ? 'text-bad' : 'text-warn'}`}>
          {limit.message}
        </p>
      )}
      {step.kind === 'idle' && (
        <button type="button" onClick={() => void look()} className={`${field} w-full hover:bg-bg`}>
          Optimize pictures…
        </button>
      )}
      {step.kind === 'looking' && (
        <p role="status" className="text-xs text-muted">
          Checking pictures… {step.done} of {step.of}
        </p>
      )}
      {step.kind === 'ready' && (
        <div className="space-y-2 text-sm">
          {step.plan.items.length ? (
            <p>
              {step.plan.items.length} of {step.plan.total} pictures can be made smaller, saving about {mb(step.plan.before - step.plan.after)} ({mb(step.plan.before)} to {mb(step.plan.after)}). They stay readable. Undo brings the originals back.
            </p>
          ) : (
            <p>These pictures are already small. Nothing to do.</p>
          )}
          <div className="flex gap-2">
            {step.plan.items.length > 0 && (
              <button type="button" onClick={() => void apply(step.plan)} className="rounded-ui bg-brand px-3 py-1 text-xs font-semibold text-brand-ink hover:opacity-90">
                Make them smaller
              </button>
            )}
            <button type="button" onClick={() => setStep({ kind: 'idle' })} className={`${field} hover:bg-bg`}>
              {step.plan.items.length ? 'Cancel' : 'Close'}
            </button>
          </div>
        </div>
      )}
      {step.kind === 'working' && (
        <p role="status" className="text-xs text-muted">
          Making pictures smaller…
        </p>
      )}
      {step.kind === 'done' && (
        <div role="status" className="space-y-1 text-xs text-muted">
          <p>
            Made {step.replaced} picture{step.replaced === 1 ? '' : 's'} smaller, saving about {mb(step.saved)}. Press Undo to bring the originals back.
          </p>
          <button type="button" onClick={() => setStep({ kind: 'idle' })} className={`${field} hover:bg-bg`}>
            Close
          </button>
        </div>
      )}
    </Section>
  )
}
