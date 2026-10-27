# Topic content, diagram objects and icons

## Marks (`src/core/marks.ts`)
Stored as short strings in `topic.marks`: `p:12` priority (1 to 30), `g:50` progress (0, 25, 50, 75, 100), `e:🔥` emoji,
`u:blue` portrait, `s:gold` star, `f:red` flag, `a:up` arrow, `y:check` symbol, `c:rocket[:#hex]` clipart (an icon name
from the open-source Lucide set). One priority and one progress per topic; clicking a mark again removes it. Anything
that doesn't parse is ignored when drawing and measured as zero width.

## Topic fields
`inlineNote` (one short line), `note` (rich text, saved as cleaned HTML), `tags`, `task` (done, start, due, assignee,
priority), `link` (web, mail, or `#topic:<id>`), `attachments` (metadata; bytes in IndexedDB), `latex`, `table`
(rows of cell text, up to 12 x 8), `image` (`imageId`, size, `position`: above, below, left, right, behind).

Safety: links are limited to http, https, mailto and topic links; notes pass through DOMPurify (basic tags, safe
addresses only, links open with `noopener`); KaTeX runs with `trust: false`; tags and file names are stripped of control
characters; attachments are limited to 10 files of 10 MB.

## Diagram objects (`src/core/model/objects.ts`)
Stored beside the topics in their own Yjs maps, so they save, undo and collaborate like everything else.
- **Relationship**: line between any two topics (curved, bend is draggable), label, arrow heads, colour, style, width.
- **Callout**: note bubble attached to a topic, draggable.
- **Boundary**: rounded, rectangular or elliptical outline around topics and their branches.
- **Summary**: curly bracket over sibling topics with its own text.
Deleting topics removes or trims the objects that refer to them; undo brings them back.
Geometry is pure and tested (`src/editor/canvas/objects.ts`).

## Layout
`measureTopic` sizes a topic from everything it holds, so boxes grow and connectors follow in every layout. Branch
numbers (1, 1.1, 1.1.1) are computed from sibling order and shown as a prefix.

## Views
Map and Outline. The outline is an editable indented list: Enter adds a topic, Tab and Shift+Tab indent and outdent,
arrows move between topics, Alt+arrows reorder, Backspace on an empty topic deletes it. Both views edit the same document.

## Pictures
Position, size (locked ratio), apply one width to all pictures, preview, download, replace, and **OCR**. OCR runs in the
browser with Tesseract (Apache-2.0): the picture never leaves the device; only the engine and language data are
downloaded once. Recognised text can replace the topic text, become a note, or become sub-topics (one per line).

## Icons
Every tool has an icon (`src/ui/icons.tsx`, from the open-source Lucide set, ISC licence), with its name as a tooltip and
screen-reader label. Layouts are shown as small drawings of their structure; shapes, line styles, arrow ends and picture
positions are drawn, not written. The clipart library offers curated categories plus search across about 2,000 icons,
loaded on demand.
