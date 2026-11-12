# Notes and tasks

Several notes per topic, tasks of their own, and a Task view. Built in five small steps (popup shell, notes data and list, note popup, tasks, Task view with Agenda). Month, Board and all-maps are later steps (not built).

## Step 1: the popup shell
`src/ui/ItemPopup.tsx` is the one popup a note or a task is written in. Props: `label` (the dialog's name), `header` (title area), `actions`, `onClose`, `wide`. Mark the control that should have the focus first with `data-autofocus`. Behaviour (tested in `itemPopup.test.tsx`): role "dialog" with aria-modal, so the global shortcuts wait (`keyboard.ts` already ignores keys inside a dialog); Tab goes round; Escape closes it unless a `[data-popover]` is open (that closes first); a press on the dim background closes it; the focus returns to the opener; under 640 px it fills the screen.

## Step 2: several notes per topic (data and list)
- **Data.** A new shared Yjs map `notes` (`core/model/notes.ts`): `{ id, topicId, title, html, createdAt, updatedAt, order }`. A topic's **first note stays in `topic.note`** (no migration): it is listed first as a "legacy" entry with the id `topic:<topicId>` and is shown only when it has text. Old files, other devices on an older app and .emmx imports (which fill `topic.note`) keep working; an older app simply does not see the extra notes (they are not lost).
- **Merge.** `notes` is in `MERGE_MAPS` (`core/drive/merge.ts`), so every note is its own key: two devices writing DIFFERENT notes merge cleanly; the same note changed on both keeps the newer text and reports the other (as a conflict that can be recovered); a note edited on one device survives a delete on the other. It is also tracked by Undo. Tested in `core/model/notes.test.ts`.
- **On the topic.** Only a small notes icon, with a count when there are several (`editor/items/NotesChip.tsx`), on the map and in the Outline; no permanent strip. A click opens a popover list (`NoteList.tsx`: title or the start of the text, a two-line preview, "Edited ... ago", an Add icon). The layout gives the badge row the width it needs (`itemCounts` in `core/layout`, derived in `session.ts`, never saved).
- **Search and files.** Map search finds a topic by the title or text of any of its notes (`core/search.ts`); the per-file index appends the other notes to the topic's note text, so the Files page Notes list and file search see them (`core/files/indexer.ts`).
- **Outline export.** Copying branches as an outline now writes the notes under their topic as `[Note] Title: text` lines (one level deeper). Reading an outline back skips these lines, so they never become topics.
- **Not in this step:** the note popup and its editor (step 3). Pictures inside a note: the note editor has never had a picture tool and its cleaner drops images, so this is not changed here.

## Step 3: the note popup
- `NotePopup.tsx` (in `ItemPopup`): title field (own notes only; the first note of a topic is "First note of this topic"), `RichNoteEditor` (TipTap, the same sanitizer as before), footer with created and edited times, a Delete icon (removes at once, a notice offers Undo; for the first note it empties `topic.note`), and a close that first saves the title and the text, then removes a new note that is completely empty.
- `RichNoteEditor.tsx` holds the editor and its **icon toolbar** (`IconTile`: shared tooltip, `aria-label`, chosen = highlighted background; no native `title`). Autosave 500 ms after typing stops; `handle.flush()` is called before the popup closes; the editor follows changes from outside (undo, another device) unless typing is waiting to be saved. Read mode: no toolbar, nothing saved.
- The side panel's **Notes tab** (`NotesPanel.tsx`) is now the list of the selected topic's notes (the same rows as the popover) with the Add icon.
- Insert > Notes opens that tab; **Add a note** creates a note and opens it in the popup.
- **Pictures inside a note:** the note editor never had a picture tool and the cleaner (`sanitizeNote`) drops images, so none were added. It needs the picture store (upload once, the 500 picture cap, Drive pictures) and is a separate decision.
- Tests: `notePopup.test.tsx` (jsdom), `e2e/notes-tasks.spec.ts` (real Chrome: typing, bold, Escape, autosave, reload, count, list, Outline icon, search, phone-size full screen, tablet centred).

## Step 4: tasks (data and popup)
- **Data.** A new shared Yjs map `tasks` (`core/model/tasks.ts`): `{ id, topicId | null, title, details, due?, status (todo | doing | done), priority? (1 highest to 5), createdAt, updatedAt, order }`. A **topic that is a task** (the older `topic.task` flag) is listed too, as a "legacy" task with the id `topic:<topicId>`, its title being the topic's text; its status is stored in the same flag (`done`, plus `status: "doing"`), and a done flag always means Done, so older versions of the app keep reading it. Nothing is migrated.
- **Merge.** `tasks` is in `MERGE_MAPS`. Completing a task on one device while the other edits its title keeps both (different fields); the same field changed on both keeps the newer and reports the other; a task edited on one device survives a delete on the other; the "edited" time of a note or task never counts as a clash (the later one is kept). Tested in `tasks.test.ts`.
- **On the topic.** A small tasks icon (count when several) for topics with tasks of their own, on the map and in the Outline; it opens a popover list (tick, title, due date, Add icon). A topic that is itself a task keeps its round tick as before. The side panel's Details > Task section shows "More tasks on this topic" with the same rows and Add icon.
- **Popup (`TaskPopup.tsx`).** Title, status as three icons (To do, Doing, Done), due date (with a clear icon), priority as five numbered tiles, the topic (a searchable list of paths, or "No topic"), details, created and edited times. Autosaves; closing saves what was typed; a new task with no title, date or details is removed; Delete removes at once with an Undo notice. In Read mode nothing can be changed.
- **Search and files.** Map search finds the topic of a task by its title or details; the file index appends the tasks on a topic to its text; the outline export writes `[Task] [ ] Title (due 2026-11-20, doing, priority 2)` lines under the topic (`[x]` done, `[~]` doing) and reading an outline back skips them. **A task with no topic is not found by the map search or the Files search** (there is no topic to go to); the Task view's own search finds it. New tasks start on the selected topic, so this is the exception.
- Tests: `tasks.test.ts`, `taskUi.test.tsx`, `e2e/notes-tasks.spec.ts`.

## Step 5: the Task view (Agenda)
- **Where.** A **Task view** icon beside Map and Outline (edit and Read toolbars). It is a third value of the view (`'tasks'`), drawn by `items/TaskView.tsx`; the map and the Outline stay as they were. Entering it puts the side panel away (a sheet over the list on a phone); keys without Ctrl, Alt or Cmd do nothing to the hidden map while it shows (`keyboard.ts`), so Enter, Tab or Delete cannot change topics that are not on screen. No keyboard shortcut was added.
- **Agenda** (`core/tasks/agenda.ts`, tested in `agenda.test.ts`): groups **Overdue, Today, Tomorrow, This week** (the rest of the Monday to Sunday week), **Later, No date**, and **Done** (only when that status is shown). A finished task is never overdue. Each group is sorted by date, then priority. A row: tick (completes; Done goes back to To do), title, the topic's path as a small label, a clock for Doing, a P1 to P5 badge, the due date (red when overdue). A click opens the task in its popup. Tasks of their own and topics that are tasks are in the same list.
- **Filters** (hidden until the filter icon is pressed; the icon is highlighted while anything but the start view is chosen, and a Clear icon appears): status (starts with To do and Doing), priority 1 to 5, topic with "this topic only" or "with its sub topics", due between two dates (tasks with no date drop out), a search box (title, details, topic path; finds tasks with no topic too). The state is kept while switching between Map, Outline and Tasks. "Project" is this map (the all-maps scope is a later step; the screen says "This map only").
- **Add a task** (plus icon) starts a task on the selected topic and opens it. Read mode: no Add, a tick says reading mode.
- Tests: `agenda.test.ts`, `taskView.test.tsx`, `e2e/notes-tasks.spec.ts` (real Chrome: groups, tick, filters, popup from a row, map keys ignored, phone-size window without sideways scroll).
- **Not built (later steps, waiting for a new "go"):** Month calendar, Board by status, all maps ("maps opened on this device").

# Part 2: wider notes, a task on the note, the Task view by time

## 2.1 Data
- `TaskItem.time` ("HH:MM", local clock time; stored with the date, so it does not move when the device time zone changes; only valid with a date, clearing the date clears it; a missing time means all day). A topic that is a task (the older flag) has no time.
- `TaskItem.noteId`: the note a task belongs to (`topic:<topicId>` for a topic's first note). The link lives on the task only. `tasksOfNote()` lists a note's tasks, oldest first; the note chip shows the first (one task per note for now) and the data already allows more.
- Deleting a note never deletes its task: the task keeps its title, date and topic, and its `noteId` simply points at nothing (treated as no link). The Undo notice restores the note.
- Merge: both fields merge per field like every other task field (tests in `tasks.test.ts`).

## 2.2 The Task view by time, and Arrange
- **Due time** (`TaskPopup`): a time input next to the date, disabled until there is a date; clearing the date clears the time; a topic that is a task has none. A row shows `Nov 14` and under it the time or `All day`.
- **Overdue by the clock** (`groupOf(task, today, nowTime)`): done is never overdue; a task with a time is overdue when its time is earlier than now (so 5 pm is not overdue at 5:00 pm, overdue at 5:01 pm) and then moves from Today to Overdue (red); a task without a time is overdue from the next day. `useNow` in `TaskView.tsx` refreshes every 15 seconds.
- **Filter Time of day**: any / only tasks with a time / only all-day tasks (three icon tiles in the filter panel).
- **Arrange** (`ArrangeMenu.tsx`, state in `taskViewState.ts`, localStorage key `wishtaa.taskArrange`, per device): Group by Date, Priority, Status, Topic / branch (the topic path as the heading, A to Z), None; Sort by Date and time, Date only, Name, Priority, Status, Created, with an ascending / descending icon. The groups keep a fixed order (priority 1 to 5, To do / Doing / Done, topics A to Z, date groups as before); the direction only turns the tasks inside a group. Missing values (no date, no priority) are always last; tie-breaks: for the date sorts the priority, then always the name. A reset icon appears when the arrangement is not the starting one.
- Popover: `Popover` now also moves between `menuitemradio` and `menuitemcheckbox` items with the arrow keys.

## 2.3 Wider note popup
- `ItemPopup` takes `size`: `normal` (640 px), `wide` (up to 1040 px, 86 vh high), `full` (the whole window). Under 640 px (`sm`) every size is the full-screen sheet.
- `NotePopup`: one `IconButton` cycles the size (icon and name show the next step: Wider / Full screen / Narrower), stored in localStorage `wishtaa.noteSize` (read with `loadNoteSize`, a bad value is ignored); hidden on a phone.
- `NoteToolbar` (`RichNoteEditor.tsx`): one row, never wraps. `visibleTools(width, count, groups)` says how many tools fit; the rest are listed in the **More formatting** popover (same icons with their names). When the width is unknown (tests) all tools show.

## 2.4 / 2.5 A task on the note
- `NotePopup` finds the note's task with `tasksOfNote(tasks, noteId)` (the oldest is shown; more show as "+n"). `RichNoteEditor` has two slots: `belowToolbar` (the chip) and `floating` (the icon and the panel, outside the scrolling part; the text has `pb-20`).
- `NoteTask.tsx`: `NoteTaskChip` ("Task · date, time · status", reads the task so it follows the Task view) and `NoteTaskPanel` (title, date, time, status, priority). Without a task it keeps a draft and "Add the task" creates it with `noteId` and the note's topic; with a task every change is saved at once (title after 500 ms). The panel has `data-popover` so the popup's Escape waits for it; a press outside it closes it.
- Delete rule: deleting a note never touches its tasks; an empty new note that has a task is kept on close.
- Task view: `TaskView` opens `openNote(noteId)` when the task has a note that exists (a topic's first note counts only when it has text), otherwise the task popup.

## 2.6 Outline copy opt-in, and the two-device script
- `cmdCopy(withItems = false)`: the plain Copy leaves notes and tasks out; the `copyItems` command ("Copy with notes and tasks (as text)") passes `true`. Parsing an outline back still skips the `[Note]` / `[Task]` lines.
- `docs/two-device-test.md` is the script for testing the merge on two real devices.

# Checklist in the note editor

- **Tool.** TipTap `TaskList` and `TaskItem` (`@tiptap/extension-list`, explicit dependency), with `ChecklistItem` in `items/RichNoteEditor.tsx` (Ctrl/Cmd+Enter ticks the item under the cursor, only inside a checklist; the box has the name "text, done / not done"). The toolbar tool "Checklist" uses its own icon (`checklist` in `ui/customIcons.tsx`: boxes with lines), different from the `task` icon ("Add task details"). Select all (Ctrl+A) is made an ordinary selection first so the tool can turn a whole note back.
- **Narrow toolbar.** Tools have a `rank`; when the bar is too narrow the least useful go into the More menu first (code, strikethrough, quote, heading 2 ... ). Checklist is rank 5 of 15 (after bold, italic, bullets, numbers), so it leaves the bar only on a bar under about 230 px.
- **Stored form (no migration).** Inside the note's `html`: `<ul data-type="taskList"><li data-checked="true|false" data-type="taskItem"><p>text</p></li></ul>`. The cleaner keeps those attributes and drops the box input, label and wrappers (a test locks it in). Older notes are unchanged.
- **Text forms.** `noteText()` writes `[ ] text` / `[x] text` (search, file index, notes list, "Copy with notes and tasks"). There is no .emmx export in the app (import only), so nothing to change there.
- **Read mode.** The editor is not editable (a click on a box is undone by the extension, Ctrl+Enter does nothing) and `onUpdate` ignores a read-only editor, so nothing is saved. The Read side panel (first note of a topic) draws the checklist from the stored text with CSS only (`.note-read`).
- **Progress.** `checklistProgress(html)` gives done / total; `NoteRows` shows "3/6".
- **Older app versions** show the items as a bulleted list (text intact, no boxes). If an old version edits and saves such a note, it becomes plain bullets (the ticks are lost, the text is not).
- **Merge.** The note is one `html` string, so a tick on one device and typing on another is one field changed twice: the newer wins and the other is reported (tests in `notes.test.ts`). A finer merge needs item ids and a per-item tick map; not built. Linking a checklist item to a real task later would also need item ids.
- **Not the Tasks feature:** no date or status, not in the Task view, not counted as a task.
