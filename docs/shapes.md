# Topic shapes and size

Thirty shapes, all drawn by the app as SVG paths (`src/core/shapes`). Each shape defines:

- **outline**: one path, used for the border, the fill and the hit area;
- **text area**: the largest rectangle inside the outline that text can use (an inset fraction per shape). The topic's box is
  grown until the text, an image and the padding fit inside it (`fitBox`), so a heart or a star is bigger than a rectangle
  holding the same words;
- **anchors**: where branches attach, found by crossing the outline with the line to the parent, so a branch touches the edge
  of a circle or a cloud, not an invisible box.

Shapes: rounded box, box, pill, soft square, snipped box, dashed box, dotted box, ellipse, circle, ring, **double circle**,
underline, double underline, text only, diamond, parallelogram, hexagon, octagon, tag, gem, shield, cloud, burst, starburst,
spikes, speech bubble, heart, star, cross, clover.

## Style panel > Topic
Shape picker (grid popover, arrow keys, every shape has a spoken name), corner (square, rounded, pill: box shapes only),
filling (none, solid, gradient, pattern), shadow, custom width, border colour, weight, dash and Single/Double border style.
**Apply changes to** chooses the selected topics, all topics at this level, or this branch and below. All changes are one
undo step.

## Double circle
An inner filled circle and an outer ring, separated by a gap. Inner fill, ring colour, ring thickness (default 6) and gap
(default 4) are separate settings; by default both use the node colour, with the gap showing the background. Text is centred
in the inner circle, branches attach to the outer ring. Any topic can use it.

## Width
Auto-size by default. **Custom width** (80 to 800 px) wraps the text inside that width and the height follows. Drag the handle
on the selected topic, or press Alt+Shift+Left/Right. Pictures keep their proportions; the shape grows to hold them.

## Stored in the file
`topic.style` gains `shape`, `corner`, `fillKind`, `fill2`, `pattern`, `shadow`, `width`, `borderLine`, `ringWidth`, `ringGap`
and so on. All are optional; an older map has none of them and opens exactly as before.
