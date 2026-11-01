# Keeping a Drive map in step across devices

A map kept in Google Drive can be edited on a laptop and on a phone. This describes how each device finds out about the other's
changes, and how two sets of changes are combined. Code: `src/core/drive/` (`sync.ts`, `repository.ts`, `merge.ts`, `syncStore.ts`)
and `src/editor/remoteSync.ts`.

## The bug this fixed (the root cause)

Every write to Drive is stamped with the writer's *session* and a counter (`editorSessionId`, `writeCounter`) so a device can tell its
own write from someone else's. A device that fetched Drive's revision also stored that revision's stamp as its *base*, so the base
carried the **other** device's session. When the laptop then saved again, the phone compared "same session as my base, counter not
older" and decided the new revision was **its own write**. Result:

- the phone opened the old local copy and showed the **old structure**, even with Drive reachable;
- a save from the phone was accepted as if nothing had changed and **overwrote the laptop's newer content** (a real data loss).

The rule is now: a revision is "ours" only when its stamp is **this tab's own session** (`classify(base, remote, mySession)`).
Anyone else's revision, including the writer our base came from, is a change by someone else.

Two more weaknesses were found while reproducing it, and fixed:

- opening a Drive map used the local copy **without asking Drive at all** when the page had no access token in memory (always true
  right after a page load on a phone, where tokens live in memory only). A check is now always tried; the request renews the token
  silently (`DriveApi.canCheck`). Only if that fails does it show the local copy, marked "Offline: may be out of date";
- an open map never looked at Drive again (only Read mode did, on focus).

Drive calls use `cache: "no-store"` and the service worker never touches them (it only handles this site's own files; its test now
also covers Drive metadata and download addresses).

## Opening

Opening always reads Drive's metadata first (revision id, checksum, writer stamp):

| What it finds | What happens |
|---|---|
| Same revision as last synced | The local copy is used. Status: "Last synced: time". |
| Newer revision, no unsent edits here | Downloaded, the local copy is refreshed. |
| Newer revision AND unsent edits here | The two are merged (below), and the result is sent. |
| Drive cannot be reached | The local copy is shown: "Offline: may be out of date". |
| Drive is slow (over 8 s) | The local copy is shown and the check carries on; its result is put into the open map when it arrives. |

While it checks the status line reads "Checking for the latest version...".

## While the map is open

Metadata only (one small request): when the tab becomes visible, on focus, on the `online` event, and every 60 seconds while visible.
If there is something new and nothing typed since the last save, it is downloaded and put into the map on screen **quietly**: the
selection and the view stay, it is not an undo step and not a save of its own, and anything typed meanwhile is left alone field by
field (`applyDelta`). A small note says "Updated from another device." If edits are waiting to be saved they are sent first, and the
send merges with the newer version if there is one ("Merged changes from another device.").

## Never overwriting newer content

Immediately before every upload the file's metadata is read again. If Drive moved on, nothing is uploaded: the two are merged first,
and the check is repeated right before the upload of the merge (up to four rounds if the other device keeps saving).

## The three-way merge

Inputs: the **base** (the content both sides had the last time they matched, kept on this device in its own IndexedDB store
`wishtaa-maps-sync`), **local** (this device) and **remote** (Drive). The map is merged by id, for every shared map in the file: topics,
settings, relationships, callouts, boundaries, summaries, PDF sources, PDF markup and page edits (`MERGE_MAPS` in `merge.ts`; a
new feature that adds a shared map must be added there).

- Only one side changed something: that side's version is taken (added topics, moves, deletions, styles, a picture added to a topic).
- Both sides changed **different fields** of the same topic (text on one, a picture or style on the other): both are kept.
- Both changed the **same field** of the same thing: the newer side wins (by this device's last edit and Drive's save time), and the
  other value is kept as a **recoverable version** (see below).
- One side deleted a topic the other edited: the edit wins, so nothing written is lost.
- Afterwards the tree is mended: a topic added under one that was deleted goes under the central topic; two moves that would put each
  topic inside the other are broken; topics given the same place get a stable order.
- Maps with different central topics are not copies of each other and are never merged.

Pictures: a picture added on the phone is a field of a topic, so it is kept along with the laptop's structure; the picture files are
uploaded once as before, only the map file is merged.

If the content cannot be merged (unreadable, unrelated, or no merge store in this browser), the old **"Two versions of this file"**
dialog is used, naming where the other version came from.

## Recover earlier version

Each clash saves the version that lost (this device's, or the other device's) with the time and a few of the things that differed.
File menu (the menu of a file in All files) or the command palette: **Recover earlier version…** lists them (up to 10 per map);
**Restore this version** puts one back like an edit, **Forget** drops it.

## What is unchanged

Pictures upload once; edits that change only the map send only the map JSON; one undo step per action; autosave; "Two versions" never
appears in normal single-device editing (Drive's own housekeeping never counts as a change); themes and Read mode.

## Tested

Two simulated devices on a fake Drive (`crossDevice.test.ts`): the root cause, a stale open map refreshed, an idle map refreshed on
check, a phone adding pictures while the laptop restructures (both survive), the same-topic clash keeping the newest plus a
recoverable copy (both directions), an offline edit merged on reconnecting, no upload on an outdated base, same-place topics, the
dialog only for unreadable content; the editor side (`remoteSync.test.tsx`): focus, visibility, online and the minute timer,
selection kept, typing kept; the service worker; and a real-browser run with two separate browsers against a mock Drive.

## Not covered

Drive offers no "upload only if unchanged" condition for a file, so two saves in the same fraction of a second can still cross; the
check right before the upload makes that window very small, and a crossing is merged by the next check rather than lost.
