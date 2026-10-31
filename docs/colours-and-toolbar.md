# Colour, line controls and the quick toolbar

## Quick toolbar
Appears next to the selected topic(s) in the map view (not while typing in a topic, in the outline, or with a diagram object
selected). It sits above the selection, flips below when there is no room above, and stays inside the canvas (`placeToolbar`
in `src/editor/quickToolbarPlace.ts`). On a phone it wraps to several rows and the buttons grow to touch size.

Tools: font family, A− / A+, bold, italic, underline, strikethrough, text colour, highlight, alignment (click to cycle),
fill colour, line (border) colour, shape, Branch, Connector style, format painter, More (copy / paste format, reset style,
open the Style panel). Arrow keys move between tools; Esc closes any popover and returns focus to its button. Everything
applies to all selected topics (or the level / branch chosen under **Apply changes to** in the Style panel).

## Colour picker
Opens from every colour button (toolbar and panels). Map colour scheme swatches, 24 standard colours, recent colours (kept in
this browser only), custom colour with a hex box (`abc`, `#abc`, `aabbcc` all work), an eyedropper where the browser has one,
"No fill" / "Auto (from the theme)" where they make sense, and an opacity slider for fills and branches.
On a phone it is a sheet along the bottom.

**Contrast warnings.** Text colour is checked against the topic's fill with the WCAG formula (`contrastReport` in
`src/core/theme/color.ts`): 4.5:1 for normal text, 3:1 for large text (24 px, or 18.7 px bold). Below that the picker shows the ratio
and a button that picks a readable colour (white, soft black or black, whichever works).

## Branch controls
Style panel > "Branch to parent", and the toolbar's **Branch** button: colour (with opacity), thickness 1 to 20 px, curve
(automatic, curved, straight, elbow, rounded elbow, tapered, none), dash, arrow head at the topic. A switch chooses **this
branch only** or **this branch and below**.

"Tapered" is a curved branch that thins toward the topic; picking any other curve turns tapering off for that branch.

## Relationship lines
Select one to get its toolbar: arrow ends, dash, thickness slider, curve slider (0 is straight), colour picker.

## One undo step
Sliders show the change on the canvas while dragged (`previewStyle`, nothing is saved) and save once on release
(`commitStyle`), so a drag is one undo step. Everything autosaves through the normal Saved indicator.

## Stored in the file
New optional `topic.style` fields: `underline`, `strike`, `highlight`, `align`, `fillOpacity`, `lineOpacity`, `lineArrow`.
Older maps have none and look exactly as before.

## Not yet
The app has no PNG, PDF or SVG export yet. When it does, shapes, the double circle, taper, opacity and arrow heads are drawn
from the same shape and path code the canvas uses (`src/core/shapes`, `src/core/theme/taper.ts`).
