import { useSettings } from '@/stores/settings'
import { Modal, buttonSecondary } from './Modal'

/** Preferences kept on this device. */
export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const wheel = useSettings((s) => s.mouseWheel)
  const setWheel = useSettings((s) => s.setMouseWheel)
  return (
    <Modal title="Preferences" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <fieldset className="rounded-ui border border-line p-3">
          <legend className="px-1 font-semibold">Mouse wheel on a map</legend>
          <p className="mb-2 text-xs text-muted">A trackpad&apos;s two-finger scroll always moves the map. Hold Ctrl and scroll, or pinch, to zoom.</p>
          {(
            [
              ['move', 'Move the map'],
              ['zoom', 'Zoom'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 py-0.5">
              <input type="radio" name="mouse-wheel" checked={wheel === id} onChange={() => setWheel(id)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
              {label}
              {id === 'move' && <span className="text-xs text-muted">(default)</span>}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
