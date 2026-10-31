import { useSettings } from '@/stores/settings'
import { Modal, buttonSecondary } from './Modal'

/** Preferences kept on this device. */
export function PreferencesDialog({ onClose }: { onClose: () => void }) {
  const wheel = useSettings((s) => s.mouseWheel)
  const setWheel = useSettings((s) => s.setMouseWheel)
  const panelMode = useSettings((s) => s.panelMode)
  const setPanelMode = useSettings((s) => s.setPanelMode)
  const picturesPref = useSettings((s) => s.picturesPref)
  const setPicturesPref = useSettings((s) => s.setPicturesPref)
  const touchControls = useSettings((s) => s.touchControls)
  const setTouchControls = useSettings((s) => s.setTouchControls)
  const allRead = useSettings((s) => s.openAllReadOnly)
  const setAllRead = useSettings((s) => s.setOpenAllReadOnly)
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
        <fieldset className="rounded-ui border border-line p-3">
          <legend className="px-1 font-semibold">Pictures</legend>
          <p className="mb-2 text-xs text-muted">Pictures only need to be readable. When compressing would save a good amount, you can choose.</p>
          {(
            [
              ['ask', 'Ask each time', 'Only asked when it would save at least a quarter and 30 KB.'],
              ['compress', 'Always compress', 'Up to 1280 px, still readable. Never enlarged.'],
              ['original', 'Always keep original', 'As it is, within the limits of 10 MB and 4000 px.'],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className="flex items-start gap-2 py-0.5">
              <input type="radio" name="pictures-pref" checked={picturesPref === id} onChange={() => setPicturesPref(id)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
              <span>
                {label}
                {id === 'ask' && <span className="text-xs text-muted"> (default)</span>}
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="rounded-ui border border-line p-3">
          <legend className="px-1 font-semibold">Touch-friendly controls</legend>
          <p className="mb-2 text-xs text-muted">Big targets and bottom sheets. Auto follows the device (a touch screen, even when it shows the desktop site).</p>
          {(
            [
              ['auto', 'Auto'],
              ['on', 'Always on'],
              ['off', 'Off'],
            ] as const
          ).map(([id, label]) => (
            <label key={id} className="flex items-center gap-2 py-0.5">
              <input type="radio" name="touch-controls" checked={touchControls === id} onChange={() => setTouchControls(id)} className="h-4 w-4 accent-[rgb(var(--c-brand))]" />
              {label}
              {id === 'auto' && <span className="text-xs text-muted">(default)</span>}
            </label>
          ))}
        </fieldset>
        <fieldset className="rounded-ui border border-line p-3">
          <legend className="px-1 font-semibold">Settings panel</legend>
          <p className="mb-2 text-xs text-muted">The panel with layout, theme, style and picture settings.</p>
          {(
            [
              ['auto', 'Auto', 'Opens when you select something or point at the right edge, and tucks away again.'],
              ['always', 'Always open', 'Stays open beside the map.'],
              ['manual', 'Manual', 'Opens only from its handle on the right edge (or F4).'],
            ] as const
          ).map(([id, label, hint]) => (
            <label key={id} className="flex items-start gap-2 py-0.5">
              <input type="radio" name="panel-mode" checked={panelMode === id} onChange={() => setPanelMode(id)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
              <span>
                {label}
                {id === 'auto' && <span className="text-xs text-muted"> (default)</span>}
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-start gap-2 rounded-ui border border-line p-3">
          <input type="checkbox" checked={allRead} onChange={(e) => setAllRead(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-brand))]" />
          <span>
            <span className="font-semibold">Open all files in Read mode</span>
            <span className="block text-xs text-muted">Maps and knowledge bases start view-only. Switch to Edit in the editor when you want to change something.</span>
          </span>
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="button" className={buttonSecondary} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  )
}
