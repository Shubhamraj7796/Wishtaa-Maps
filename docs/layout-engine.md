# Layout engine

`src/core/layout/mindmap.ts` is a pure function: `buildScene(topics, options) → Scene`. No DOM, no React.

## Inputs
- `topics`: the topic map from the Yjs document.
- `options.maxDepth`: "show levels N" (null = all).
- `options.focusId`: lay out only that branch (focus mode).
- `options.reveal`: topics treated as expanded regardless of collapse or level limit (search results).

## Output (`Scene`)
`boxes` (position, size, side, depth, branch colour index per visible topic), `edges`, `order` (depth-first),
`hidden` (hidden-descendant counts for the badge), `bounds`.

## Algorithm (mind map, balanced)
1. Measure each topic from its text length (deterministic, no DOM measuring).
2. Post-order pass: a subtree's height is `max(own height, sum(child heights) + gaps)`.
3. The central topic sits at the origin. Top-level branches whose start is before the vertical midpoint go right,
   the rest go left.
4. Each side is placed pre-order: children are stacked vertically and centred on their parent, one horizontal gap
   further out. Left-side branches mirror the same rule.
5. Floating topics are laid out the same way, one-sided, around their own `floatingPosition`.

Cost is O(n). 2,000+ topics lay out in well under 300 ms (asserted in `mindmap.test.ts`).

## Rendering and culling
The canvas keeps a pan/zoom transform and renders only boxes and connectors that intersect the viewport (plus a
margin). A 2,100-topic map renders ~20 DOM nodes at a time. The minimap draws every box on a `<canvas>`.

## Document model
Yjs `Y.Map` of topic objects plus a `meta` map holding `rootId`. Every user edit runs in a transaction with origin
`local`; `Y.UndoManager` tracks that origin (100 steps, one step per command). Guest maps are saved to
`localStorage` as a base64 Yjs update, debounced 400 ms.

Phase 2 adds the other layouts behind the same `buildScene` contract.
