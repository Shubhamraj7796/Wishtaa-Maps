# Navigation, automatic branch thickness and Read mode

## 1. Navigation (`src/editor/navigation.ts`)
| Input | What it does |
| --- | --- |
| Two-finger scroll on a trackpad (small or fractional deltas) | moves the map (both directions) |
| Ctrl + wheel, trackpad pinch (the browser reports it as Ctrl + wheel) | zooms around the pointer; the browser's own page zoom is blocked |
| Shift + wheel | moves sideways |
| A real mouse-wheel notch (line-mode, or a whole `deltaY` of 100 or more with no `deltaX`) | follows **Preferences > Mouse wheel**: Move the map (default) or Zoom |
| Hand tool / Space + drag, middle-mouse drag | pans |
| Ctrl + 0 fit, Ctrl + 1 reset to 100%, Ctrl + / Ctrl - zoom | as before |
| Click the zoom % | type a value (2 to 400) |
| Touch | one finger on empty canvas pans, two fingers pan and pinch as one gesture, a flick glides a little |

Wheel events are collected and applied once per animation frame. Events that start in a text field, the notes editor or an element
marked `data-no-wheel` are left to that element and are not prevented. The first time the wheel moves the map a one-time tip
about Ctrl + wheel / pinch is shown. Zoom range is `MIN_ZOOM` 0.02 to `MAX_ZOOM` 4.

## 2. Automatic branch thickness (`src/core/theme/autoBranch.ts`)
Auto is the default, for the whole map and for each branch. A branch's thickness in map units is

`clamp(k × larger side of the child topic × central scale × 0.75^(depth-1), min, max)`

with `k` 0.025, first level between 4 and 28, never under 2, and a gentle `√(central size / 200)` scale (0.8 to 1.5) so small maps
stay modest and big ones bold. Auto branches are tapered unless the branch or the map says otherwise. Every constant lives in the
one `AUTO_BRANCH` object.

A thickness set on the branch (Branch popover or Style panel), on the whole map (Theme tab), or written in an imported file, is
**manual** and wins. Moving the slider makes the branch manual; **Auto** returns it. **Reset to automatic** (selection) and
**Reset all branches to automatic** (map) are one undo step each. Widths are in map units, so they scale with zoom, but are drawn at
least 1.5 px wide on screen (`onScreenWidths`).

Old maps have no explicit thickness, so they use Auto and may look bolder.

## 3. Read mode
Header switch **Edit | Read** (Ctrl+Shift+R), a "Read mode" badge, and "Read only" with a lock where the save status was.

**Nothing is written.** Three layers:
1. `lockDoc` (`src/core/model/lock.ts`): a locked document ignores every `transact`, so no command, setting, theme or style change can reach the map even if a code path forgot to check.
2. Commands: every command is blocked in Read mode unless it is in `READ_SAFE` (`registry.ts`); new commands are blocked by default. Store-only edit actions (rename, painter, relationship, link, task, paste) check `mayEdit`.
3. Saving: nothing is marked dirty, `RepoMapStorage.save` and renaming return early, and the autosaver stays idle. A test scans `src/editor` and fails if anything else starts writing to the file repository.

Switching to Read first flushes a pending edit and waits for Saved. If it cannot save, you stay in Edit and are told why.

**Still works:** pan and zoom, fit, focus a branch, levels, fold and unfold (view state only, never saved), selecting a topic (its path stays strong, other branches soften), search, Outline (read-only, arrow keys move, left/right fold), minimap, tag filter, following links, copying text, the read-only Details panel (path, notes, tags, link, task), and the picture viewer with zoom and next/previous.

**Google Drive.** The Read toolbar has **Refresh from Drive** (and a quiet check when the tab regains focus). It only reads, replaces the local copy when Drive has newer content and nothing here is waiting to be sent, and never raises a conflict. If Drive says you may not edit the file (`capabilities.canEdit` false) it opens read-only, with no Edit button and an explanation.

**Protection.** File menu: *Open in read mode by default* (a lock). Stored on the file record (`readOnlyDefault`), not in the map, and mirrored to Drive as the `wishtaaReadOnly` property so it follows the file. Opening such a file starts in Read mode; **Edit** is one click and shows a brief tip. A file menu item *Open in read mode* opens any file read-only once. **Preferences > Open all files in Read mode** (off by default) covers everything. Lists show a lock badge.

**Accessibility.** The mode change is announced (`aria-live`), the switch uses pressed buttons, and the arrow keys still move through topics.
