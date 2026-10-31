# The settings panel

Layout inspired by the Canvas / Style / Picture format panels of other mind-map tools; names, icons and assets are our own.

## What it shows
The section follows the **kind** of selection (`src/editor/panel/behaviour.ts`):

| Selected | Section |
| --- | --- |
| nothing | **Canvas**: Layout (one row), Theme and Theme colour (rows with a thumbnail), spacing and lines, background |
| one or more topics | **Style**: text, shape, corner, filling, shadow, width, border, branch, and *Layout of this branch*. Never the map layout. With the central topic in the selection the branch settings are left out (it has no branch) |
| a picture | **Picture format**: width and height (in step with the resize handles, 40 to 1200 px), Keep aspect ratio, Reset to original size, Apply this size to all pictures (asks first, one undo step), position (above, left, below, right, behind), alt text, Replace, Preview, Download original, Copy, Delete. A small toolbar also floats above the picture |
| a relationship line, callout, boundary or summary | **Object style**: label, colour, thickness, dash, arrows, curve (as the object has them) |

A tab picked by hand is kept until the kind of selection changes again. Tabs carry text labels and tooltips. The section that opens is
announced to screen readers (`aria-live`).

## Dropdowns instead of long lists
`ChoiceDropdown` and `PopoverRow` (`src/editor/ui/`): a label, a thumbnail of the current choice and a chevron. Clicking opens a popover (a
bottom sheet on a phone) with the choices grouped under headings, each with its own thumbnail and name; arrow keys move, Enter applies
(one undo step) and closes, Esc closes and returns focus, hovering or focusing shows the name. Used for the map layout (Mind map, Tree map,
Timeline, Org chart, Fishbone, Tree table, Other: only layouts the engine has), the layout of a single branch (the directions a branch can
have), Theme and Theme colour.

## Opening and closing
- Collapsed to a thin handle on the right edge; it takes no space from the canvas. The panel overlays the map and is docked only when pinned.
- **Hover** (mouse only): resting on the right edge (about 16 px) opens it after 150 ms; leaving closes a panel the pointer opened after 400 ms.
  Using it (clicking inside) keeps it open. It never takes keyboard focus by itself.
- **Selection**: selecting a topic, picture or object opens it on the matching section; clearing the selection closes it (unless pinned, opened from
  the handle, busy, or under the pointer). Changes settle for 120 ms first, so quick changes do not flicker.
- **Busy**: it never closes while a dropdown, gallery or colour picker inside it is open, a field has focus, or something is being dragged or resized.
- **Keep visible**: when it opens over the selected topic, the canvas glides just far enough to keep that topic visible.
- **Pin** (header): docks it open on large screens; remembered per user. **Preferences > Settings panel**: Auto (default), Always open, Manual (only from the handle or F4).
- **Touch**: no hover. Tap the handle, swipe in from the right edge, or tap the small section button that appears near the bottom while something is selected. On a narrow screen the panel is a bottom sheet.
- **Esc** closes it and returns focus to the canvas. The handle is a button with `aria-expanded` and a visible focus ring; the panel is a labelled complementary region.
- **Read mode** hides it; the read-only Details panel still works.
