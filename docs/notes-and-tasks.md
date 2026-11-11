# Notes and tasks

Several notes per topic, tasks of their own, and a Task view. Built in five small steps (popup shell, notes data and list, note popup, tasks, Task view with Agenda). Month, Board and all-maps are later steps (not built).

## Step 1: the popup shell
`src/ui/ItemPopup.tsx` is the one popup a note or a task is written in. Props: `label` (the dialog's name), `header` (title area), `actions`, `onClose`, `wide`. Mark the control that should have the focus first with `data-autofocus`. Behaviour (tested in `itemPopup.test.tsx`): role "dialog" with aria-modal, so the global shortcuts wait (`keyboard.ts` already ignores keys inside a dialog); Tab goes round; Escape closes it unless a `[data-popover]` is open (that closes first); a press on the dim background closes it; the focus returns to the opener; under 640 px it fills the screen.
