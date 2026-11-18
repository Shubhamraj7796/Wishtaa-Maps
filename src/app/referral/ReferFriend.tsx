import { useCallback, useEffect, useState } from 'react'
import type { ReferralSummary } from '@/core/plan'
import { referralLink } from '@/core/referral/capture'
import { IconButton } from '@/ui/IconButton'
import { auth, useAuth } from '../account'
import { Modal, buttonSecondary } from '../Modal'
import { freePeriodText, WORDING } from './wording'

type Load = { state: 'loading' } | { state: 'ready'; data: ReferralSummary } | { state: 'unavailable' } | { state: 'failed' }

/** Reads my own referral numbers from the database (counts only). A database without the referral functions is "unavailable", not an error. */
export function useReferralSummary(): { load: Load; reload: () => void } {
  const uid = useAuth().user?.id
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!uid) return
    let gone = false
    setLoad({ state: 'loading' })
    auth
      .backend()
      .then((b) => b.db.referralSummary())
      .then((data) => !gone && setLoad(data && data.code ? { state: 'ready', data } : { state: 'unavailable' }))
      .catch(() => !gone && setLoad({ state: 'failed' }))
    return () => {
      gone = true
    }
  }, [uid, n])
  return { load, reload: () => setN((x) => x + 1) }
}

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-ui border border-line bg-bg px-3 py-2 text-center">
      <p className="text-xl font-semibold leading-tight" data-testid={`ref-count-${label.toLowerCase()}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

/** The panel itself: my link with copy and share icons, three counts, months earned, the free period and one quiet note. No banners. */
export function ReferralPanel() {
  const { load, reload } = useReferralSummary()
  const [status, setStatus] = useState('')
  useEffect(() => {
    if (!status) return
    const t = window.setTimeout(() => setStatus(''), 2500)
    return () => window.clearTimeout(t)
  }, [status])

  const copy = useCallback(async (url: string) => setStatus((await copyText(url)) ? WORDING.copied : WORDING.copyFailed), [])
  const share = useCallback(async (url: string) => {
    try {
      await navigator.share({ title: 'Wishtaa Maps', text: WORDING.shareText, url })
    } catch {
      /* the person closed the share sheet: nothing to report */
    }
  }, [])

  if (load.state === 'loading') return <p role="status" className="text-sm text-muted">{WORDING.loading}</p>
  if (load.state === 'unavailable') return <p className="text-sm text-muted">{WORDING.unavailable}</p>
  if (load.state === 'failed') {
    return (
      <div className="space-y-2">
        <p role="alert" className="text-sm">{WORDING.failed}</p>
        <button type="button" className={buttonSecondary} onClick={reload}>{WORDING.retry}</button>
      </div>
    )
  }
  const d = load.data
  const url = referralLink(typeof location === 'undefined' ? 'https://maps.wishtaa.com' : location.origin, d.code as string)
  return (
    <div className="space-y-4" data-referral-panel>
      <div>
        <label htmlFor="ref-link" className="mb-1 block text-xs font-medium text-muted">{WORDING.yourLink}</label>
        <div className="flex items-center gap-1">
          <input id="ref-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-ui border border-line bg-bg px-3 py-2 font-mono text-xs" />
          <IconButton icon="copy" label={WORDING.copy} onClick={() => void copy(url)} style={{ minWidth: 44, minHeight: 44 }} />
          {canShare() && <IconButton icon="share" label={WORDING.share} onClick={() => void share(url)} style={{ minWidth: 44, minHeight: 44 }} />}
        </div>
        <p role="status" aria-live="polite" className="mt-1 h-4 text-xs text-muted">{status}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Count label={WORDING.invited} value={d.invited} />
        <Count label={WORDING.joined} value={d.joined} />
        <Count label={WORDING.successful} value={d.successful} />
      </div>

      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{WORDING.monthsEarned}</dt>
          <dd className="font-medium">
            {d.monthsEarned}
            {d.waiting > 0 && <span className="ml-2 text-xs font-normal text-muted">{WORDING.onTheWay(d.waiting)}</span>}
          </dd>
        </div>
      </dl>
      <p className="text-sm font-medium" data-testid="ref-free-until">{freePeriodText(d)}</p>
      {d.capReached && <p className="text-xs text-muted">{WORDING.capReached}</p>}
      <p className="text-xs text-muted">{WORDING.note}</p>
    </div>
  )
}

/** The panel in a dialog (from the account menu). */
export function ReferFriendDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={WORDING.title} onClose={onClose}>
      <ReferralPanel />
    </Modal>
  )
}
