# Layout engine

`src/core/layout/engine.ts` is a pure function: `buildScene(topics, options) → Scene`. No DOM, no React.
Layout ids and groups live in `catalog.ts` (22 layouts); shared types are in `types.ts`.

## Inputs
- `topics`: the topic map from the Yjs document.
- `maxDepth` ("show levels N"), `focusId` (focus mode), `reveal` (topics shown expanded for search).
- `layout` (e.g. `mindmap:both`), `connector` (`auto | curve | elbow | straight`), `spacing` (0.6 to 1.8),
  `overlap`, `alignSiblings`, `freePositioning`, and `shapeOf` (the shape a topic is drawn with, which decides its size).

## Output (`Scene`)
`boxes` (position, size, direction, depth, branch colour index, where children hang), `edges` (anchor sides and
connector kind per parent/child), `decor` (spines, ribs, sector wedges, braces), `order` (depth-first), `hidden`
(hidden-descendant counts), `layoutShape` (e.g. ellipse for bubbles), `bounds`.

## Block model
Every subtree is a box (a *block*): the topic plus all its descendants. A block knows its size and where its topic
sits inside. Because blocks are boxes, any direction can nest inside any other, which is how per-branch layouts work.

| Direction | Children go | Used by |
|---|---|---|
| `right` / `left` | stacked vertically to that side | mind map, tree, org (left-right), bracket, vertical timeline |
| `down` / `up` | in a row below / above | top-down and bottom-up maps, org chart |
| `stack` / `stackUp` | indented column below / above (outline) | compact org chart, timeline and fishbone branches |
| `both` | balanced between right and left | central topic of the balanced mind map |

1. Measure each topic from its text, font size, image and shape (deterministic, no DOM measuring).
2. Build blocks bottom-up (heights, widths, child offsets).
3. Emit boxes and edges top-down, centring the central topic at the origin.

## Layout families
- **Mind map**: both / right / left / down / up. **Tree map**: four directions, any connector style.
- **Org chart**: top-down, left-right, compact (first row across, deeper levels stacked).
- **Timeline**: branches alternate above/below (or right/left) a spine, each as an outline column.
- **Fishbone**: the horizontal timeline with slanted ribs; "head right" is the mirror image of "head left".
- **Tree table**: a grid of merged cells (levels are columns or rows; parents span their children).
- **Circular / sector**: rings per level, wedge angle proportional to space needed; sector adds tinted wedges.
- **Bubble**: branches fan outward as ellipses, then an overlap-relaxation pass separates any that collide.
- **Bracket**: a right/left tree whose branches are grouped by curly braces instead of lines.

## Options
- **Spacing** scales every gap. **Overlap** packs siblings by their own box so subtrees may overlap.
  **Align siblings** gives siblings the widest sibling's width.
- **Per-branch layout**: a topic's `branchDir` overrides the direction inside its branch (never the opposite of its parent's).
- **Branch free positioning**: a topic's `offset` shifts its whole branch (only applied while the option is on).
- Floating topics are laid out as their own trees at their own positions in every layout.

## Branch direction (two-sided Mind map only)
Canvas tab, Layout, "Branch direction", or the command palette ("Branch direction: ..."). Stored with the map as `settings.branchDirection`
(`balanced` | `clockwise` | `reverse`; missing or unknown means `balanced`). It is shown only for **Mind map, both sides**, and not in Read mode.
n main topics are numbered 1..n in their stored order, half = ceil(n / 2):

| | right side, top to bottom | left side, top to bottom |
|---|---|---|
| **Balanced** (default, unchanged) | the first topics, until about half the total height | the rest, in order |
| **Clockwise** | 1 .. half | n, n-1, .. half+1 (topic half+1 is at the bottom, the last topic at the top left) |
| **Reverse** (anticlockwise) | n, n-1, .. half+1 (the last topic is at the top right) | 1 .. half |

Notes:
- Balanced is what the app has always done. It fills the right side first, down to about half the height, then the left, both top to bottom.
  It does **not** alternate right, left, right, left. It was kept exactly as it was, so no existing map changes.
- Only where a main topic is drawn changes. The stored order of the topics is never touched, so going back to Balanced restores the old
  picture exactly; branch colours still follow the stored order.
- Sub-topics stay on the side of their main topic. Adding or removing a main topic follows the rule at once (the topics glide for 0.3 s).
- A main topic's stored `side` (only set by importing an `.emmx`) is honoured under Balanced and ignored while Clockwise or Reverse is chosen;
  it is not overwritten, so Balanced brings it back. There is no way to move a topic to the other side by hand yet, so there is no "Reset to automatic".
- The **Outline** always shows the logical order of the children (see `docs/outline-view.md`); a branch direction changes only the map.
- One undo step. Hidden for Right only, Left only, Top-down and every other layout; the choice stays stored with the map.
- **`.emmx` files:** nothing is read for this. In the sample file (IND AS 2) the page and the central topic carry `<Layout V="8"/>`
  and no direction flag; `<LayoutDirection V="0"/>` appears only on two nested shapes. One sample is not enough to map it reliably, so imported
  maps open as Balanced.

## Rendering and culling
The canvas renders only boxes and connectors that intersect the viewport (plus a margin). Connector geometry is in
`src/editor/canvas/paths.ts` (curve, rounded elbow, straight, brace, wedge). A 2,100-topic map renders ~20 DOM nodes.

## Document model
Yjs `Y.Map` of topics, a `meta` map (root id, title) and a `settings` map (layout, theme, spacing...). Every user edit
runs in a transaction with origin `local`; `Y.UndoManager` tracks topics and settings (100 steps, one step per command).
