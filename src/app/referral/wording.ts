/**
 * Every word of the referral programme that the person sees, in ONE file, so the owner can change the wording without touching any logic.
 * (The numbers themselves are settings in the database table app_settings; see docs/referrals.md.)
 */
export const WORDING = {
  /** Menu item, panel title and the name of the icon. */
  title: 'Refer a friend',
  note: 'Each friend who joins and saves a map gives you 1 more month.',
  yourLink: 'Your link',
  copy: 'Copy link',
  share: 'Share link',
  copied: 'Link copied',
  copyFailed: 'Could not copy. Select the link and copy it by hand.',
  shareText: 'Try Wishtaa Maps, a mind-mapping app.',
  invited: 'Invited',
  joined: 'Joined',
  successful: 'Successful',
  monthsEarned: 'Months earned',
  onTheWay: (n: number) => `${n} on the way`,
  foundingFree: 'Free for founding members',
  capReached: 'Maximum free period reached',
  loading: 'Loading…',
  unavailable: 'Referrals are not available yet.',
  retry: 'Try again',
  failed: 'Could not load your referrals. Check your connection and try again.',
  /** The one quiet line for a visitor who arrived through a friend's link (sign-in dialog). */
  invitedByFriend: 'Invited by a friend',
  freeUntil: (date: string) => `Free until ${date}`,
} as const

/** "14 Nov 2027" (UTC, so everyone sees the same day). */
export function formatFreeDate(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** The one line about the free period: an end date, "founding members" before the launch date is set, never anything alarming. */
export function freePeriodText(p: { freeUntil: string | null; founding: boolean }): string {
  if (p.freeUntil === null) return WORDING.foundingFree
  const d = formatFreeDate(p.freeUntil)
  return d ? WORDING.freeUntil(d) : WORDING.foundingFree
}
