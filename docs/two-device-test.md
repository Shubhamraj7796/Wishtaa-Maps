# Two-device test: notes, tasks and the merge

A manual script for the owner. It has NOT been run on real Google Drive by Claude: the merge is only unit-tested (`src/core/model/tasks.test.ts`, `notes.test.ts`). Run it with two real devices (a laptop and a tablet), or two Chrome profiles, both signed in to the same Google account, with the map saved to Drive.

Use a new test map so nothing real is at risk. Write down pass or fail for each step and send anything that looks wrong.

## Setup
1. On both devices open https://maps.wishtaa.com (or the local test page) and sign in with the same Google account.
2. Device A: create a map "Merge test", add a topic "Dose", save it to Google Drive. Wait for **Saved**.
3. Device B: open the same map from Drive. Wait for **Saved**. Both show the topic "Dose".

## 1. A note and a task, one device
4. A: select "Dose", add a note (Insert, Notes, plus). Title "Meeting", text "agenda".
5. A: in the note press the floating task icon ("Add task details"). Set tomorrow, 5:00 pm, Priority 1, press **Add the task**. The chip shows "Task · ... · To do". Close the note. Wait for Saved.
6. B: reload the map. Open the note on "Dose". Expected: same text, same chip. Open the Task view: the task is listed with its time, and a click on it opens the note.

## 2. Different edits at the same moment (offline)
7. Put both devices offline (browser offline mode, or aeroplane mode).
8. A: change the note text to "agenda changed".
9. B: in the Task view change the task time to 6:00 pm and tick it Done.
10. Put both back online and wait for Saved on both.
11. Expected on BOTH devices: the note says "agenda changed", the task is 6:00 pm and Done, the chip says Done, and there is no "Two versions" dialog.

## 3. The same field changed on both
12. Both offline again. A: set the task time to 7:00 pm (and set it To do). B: set it to 8:00 pm.
13. Both online, wait for Saved. Expected: one time wins (the later edit, 8:00 pm unless A was edited last) and the other change is mentioned in the merge notice; no data is lost silently.

## 4. Delete a note whose task is edited elsewhere
14. Both offline. A: delete the note (trash icon in the note popup). The message says its task is kept. B: change the task title to "Follow up".
15. Both online, wait for Saved. Expected: the note is gone, the task is still there with the title "Follow up", and in the Task view it opens its own task popup (it has no note any more).
16. Undo: on A, delete a note that has a task and press **Undo** in the message at once. Expected: the note comes back and the chip is there again.

## 5. Two tasks on the same note
17. Both offline. On both devices add a task to the same note with the floating icon (different titles).
18. Both online, wait for Saved. Expected: both tasks exist (the Task view lists both). The note chip shows one of them with "+1".

## 6. Arrange and the size are per device
19. On A set the Task view to Arrange, Group by Priority. On B it stays as it was (the choice is remembered per device, not shared).
20. On A make the note popup Wide. On B it keeps its own size.

## 7. Copy as text
21. Select "Dose" and press Ctrl+C, paste into a text editor: only the topics. Then use the command palette (Ctrl+K), "Copy with notes and tasks (as text)", paste: the `[Note]` and `[Task]` lines are included.

## Report back
For each numbered step: pass, or what you saw instead (a screenshot helps).
