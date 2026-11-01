# PDF source panel and markup

Read a PDF beside the map, take topics and pictures from it, link topics back to the page they came from, and mark the PDF up. The
PDF itself is **never changed and never stored in the map**.

Open it with the **PDF** button in the top bar (or the command "Open or close the PDF panel"). On a computer it docks on the left
of the Outline and Map (drag its edge to resize; the width is remembered). On a tablet or phone, or a narrow window, it is a sheet
along the bottom. The panel is loaded only when first opened: pdf.js (about 480 KB, plus its worker) is not part of the editor and is
not in the offline pre-cache list.

## Opening a PDF

**Insert menu ▸ PDF from this device… / PDF from Google Drive…**, the **PDF** button in the top bar, the **+** button in the panel, the
command palette ("Insert PDF from this device…", "Insert PDF from Google Drive…"), or **dragging files onto the panel**. All of them are
hidden or blocked in Read mode. Several PDFs can be chosen or dropped at once.

- **From this device:** the file chooser accepts `.pdf` and `application/pdf`; a drop is judged by what is inside the file, not its name
  or type (a PDF with no type, or typed `application/octet-stream`, is fine).
- **From Google Drive:** a Picker of its own, set up for PDFs (the Picker for opening .wishtaa and .emmx maps is separate and
  unchanged, except that its message now says PDFs are inserted with Insert, PDF). My Drive, Shared with me, Recent and Shared drives
  tabs filter on `application/pdf`, folders can be browsed, several files can be chosen, and a last tab lists every file for PDFs that
  Drive typed as a generic binary. Picking a file gives the app access to that file under the existing `drive.file` scope; it is
  downloaded with the signed-in access and kept on this device.

Every file is **checked by content**: the first bytes must contain `%PDF-` (a few bytes of junk before it are allowed, as the PDF
format allows), then it must open. What you see when it does not:

| Situation | Message |
|---|---|
| Not a PDF | "*name* isn't a PDF." |
| Over 50 MB | "*name* is larger than 50 MB, which is more than we open." (a Drive file is refused before it is downloaded) |
| Damaged | "This PDF is damaged and could not be read." |
| Password protected | A dialog: "This PDF is password protected. Enter the password." with a password field; a wrong password says so and asks again; Cancel adds nothing. The password is kept in memory for the session only (never in the map or on disk), so a protected PDF already in a map asks again after a reload, in the panel. |

When several files are picked, the ones that fail are reported by name and the rest are still added. A PDF that needs a password cannot
be downloaded **with markup** (the copy cannot be written); the markup stays in the map.

pdf.js is loaded only when the panel is first opened and is not in the offline pre-cache list. Its worker, and the files it fetches
(JPEG 2000, JBIG2 and colour decoders as wasm, standard fonts, colour profiles and CJK character maps), come from this site: the build
copies them to `/pdfjs/` and the dev server serves them from the package, so no other host is involved. pdf.js runs with scripting,
XFA forms and `eval` off; the scripting engine is not shipped.

### What a map stores

A **reference** only: `{ id, name, size, SHA-256 hash, page count, Drive file id, added }`. Markup, page edits and topic links are
stored beside it. A map with PDFs stays small (a source plus 500 markup objects adds a few tens of KB to the map update).

The bytes live in this browser's IndexedDB (database `wishtaa-maps-pdfs`), keyed by hash, so the same file added to two maps is kept
once. **Remove from this device** (source menu) deletes the copy; the map keeps its links and markup, and shows **Reopen PDF** where
the pages were. Choosing the same file again restores everything (a different file is refused, because its markup would not fit it).
If the PDF came from Drive, **Download again from Google Drive** also works. **Remove from this map** removes the reference, its
markup and page edits (one undo step); topics that came from it keep their text and lose the "p. N" link target.

## Reading

Pages are laid out as one long column and **only the pages near the screen exist**: the others are empty space of the right height.
At most about 8 pages hold a picture at once, 2 are drawn at the same time (the queue is cancelled when a page scrolls away), and
the memory of a page is given back when it leaves. One page is capped at 16 million pixels. Zoom with the buttons or Ctrl + wheel
(25% to 400%; **Fit** is the width of the panel). The page box goes to a page; the Controls row shows "Page N of M".

A PDF with **no text layer** (a scan or handwriting) shows a notice and points to **Capture area**.

## Topics from a PDF

Select text on a page. A bar appears:

| Button | What it does |
|---|---|
| **Add as topic** | A topic beside the selected topic (under the central topic when nothing is selected). |
| **Add as sub-topic** | A topic under the selected topic. |
| **One per line** | Makes a topic for every line instead of one for the whole selection. |
| **Highlight / Underline / Strike** | Marks the words (see Markup). |
| **Drag to Outline** | Drag the handle onto a row of the Outline: the text becomes sub-topics of that row. |

Hyphenated line breaks are joined ("Absorp-" + "tion" becomes "Absorption"), line breaks and spaces are tidied. Each topic stores
`source = { sourceId, page, rectangle }`. Several topics from one selection are **one undo step**.

**Capture area** (Controls row) lets you drag a rectangle over a page. The region is drawn fresh from the PDF (sharp at any zoom,
longest side about 1,800 px) and goes through the normal **Add picture** steps for the selected topic or a new one, so it works on
scanned and handwritten pages.

### Source links

A topic from a PDF shows a **p. N** badge on the Map and in the Outline. Clicking it opens the panel on that page, scrolls so the
passage is in the upper part of the view, and marks it for a few seconds. Selecting a linked topic does the same. The link is kept
when a branch is copied and pasted.

### Starting an outline from a PDF

Source menu ▸ **Start an outline from this PDF…**. Two sources, both shown as an **editable preview** (never applied by themselves):

- **PDF bookmarks**, with their nesting, as they were saved in the file.
- **Detect headings**: guessed from text size (the commonest size is body text; clearly bigger lines are headings, bigger means a
  higher level; page numbers and very long lines are skipped; a wrapped title is joined). It is a suggestion, so check it.

Rename, change the level (L1 to L6), or untick items, then **Add to map**. The tree goes under the selected topic (or the central
topic) in one undo step, each topic linked to its page.

## Markup (Edit mode only)

The tool row has Select, **Highlight, Underline, Strikethrough, Pen, Text box, Rectangle, Ellipse, Line, Arrow, Whiteout, Link**,
seven colours, Undo and Redo, and **turn left / turn right / hide** for the page being looked at. On a touch screen every target is
at least 44 px. A pen (stylus) draws with its full path; once a pen has touched the screen, fingers scroll instead of drawing, so a
resting hand does nothing. Touch selection of text uses the system handles; the selection bar then marks it.

- **Highlight / underline / strike**: with the tool chosen, a mouse or pen selection is marked as soon as it is let go; on touch use
  the bar. One rectangle per line of text; the words are kept.
- **Pen, shapes, arrow**: drag; lifting the pointer keeps it.
- **Text box**: drag an area (or click), type, press **Add text** or Ctrl+Enter. **Link**: drag an area, type a page number of this PDF
  or a web address (only http, https and mailto are accepted).
- **Whiteout** covers part of the page. **It does not remove what is underneath**: the text is still in the original and in the
  downloaded copy, so it is not a way to redact anything private.
- Click markup with the Select tool to choose it. A bar offers **colour, Add note, Make topic** (highlights with words) and
  **Delete**; the Delete key also works.
- **Make topic from highlight** creates a linked topic and remembers it on the highlight. **Send all highlights to outline** (Markup
  tab) makes a topic per page ("Page 3") with each new highlight under it, all linked; highlights already made into topics are skipped.
- The **Markup tab** lists everything by page (words, notes, colour). Clicking an item goes to it.
- **Turn** and **hide** apply to the page being looked at. A hidden page is dimmed and left out of the downloaded copy
  ("Show N hidden pages" in the Controls row brings them back into view). Nothing in the file changes.

**Read mode** shows all markup and links but has no tools, no selection bar, and no changes.

### Where markup is stored (non-destructive)

In the map document, in three maps beside the topics, all inside the same undo history (one step per action): `pdfSources`,
`markup` (one object per markup, `MarkupObject` in `src/core/pdf/types.ts`) and `pageEdits` (turn and hide, per page). Positions
are **fractions of the page as it is read** (its own /Rotate applied), measured from the top left, so they do not depend on zoom
or on how the page is drawn; a turned page turns its markup with it. The map holds at most 20,000 markup objects.

## Download PDF with markup / Save copy to Google Drive

Source menu ▸ **Download PDF with markup** makes "Name (marked up).pdf" with [pdf-lib](https://pdf-lib.js.org/) (MIT). Source menu ▸
**Save copy to Google Drive** puts the same file in the *Wishtaa Maps* folder as a **new file** (the original is never replaced).

- The original bytes are read, not written; a new document is produced. The tests check the original's hash before and after.
- Highlights are drawn with a multiply blend, shapes and pen strokes as vector lines (with round caps), whiteout as an opaque white
  rectangle, text boxes in Helvetica (characters it cannot show become "?"), links as real link annotations (web address, or a
  jump to a page; a link to a hidden page is dropped).
- Coordinates are turned from "page as read" into PDF space with the page's own rotation, so markup lands in the same place on pages
  stored with /Rotate 0, 90, 180 or 270; the person's turn is added to the page's own. Hidden pages are left out.
- If every page is hidden there is nothing to download, and you are told so.

## Measured

Chromium 148 (headless, software drawing), the **development build** (slower than the production build), a generated 47.2 MB,
200-page PDF with 31 lines of text per page, and 500 markup objects (100 each of highlight, pen stroke with 60 points, rectangle,
text box, arrow) spread over the pages:

| What | Result |
|---|---|
| Add the 47 MB PDF (read, hash, validate, keep on the device) | about 0.6 to 1.6 s |
| Add 500 markup objects | about 20 ms, one undo step |
| Scroll the whole PDF slowly (200 pages in 20 s, 10 pages a second) | 58 to 59 fps, 95th percentile frame 17 ms |
| Scroll the whole PDF very fast (200 pages in 8 s, 25 pages a second) | 22 to 27 fps (pages are drawn once the scroll slows) |
| Pages in the page at once / pictures held | at most 5 / at most 5 |
| Memory (JS heap) while scrolling | stays within 90 to 235 MB, including the 47 MB file held for the test; no growth across 200 pages |
| Export with 500 objects (200 pages, 47 MB) | about 0.85 s; original unchanged |

**Not measured on a real tablet or a phone.** Expect the very-fast-scroll case to be rougher there.

## Not built (deferred)

- Editing the existing text of a PDF.
- Signatures and form filling.
- Inserting, merging or reordering pages (pages can be turned and hidden only).
- True redaction (whiteout only covers).
- Searching inside the PDF and OCR of scanned pages (Capture area then the existing OCR on a picture works).
- Downloading a password-protected PDF with markup.

## Files

`src/core/pdf/` (types, geometry, text helpers, engine around pdf.js, device store, export, test kit) and `src/editor/pdf/` (panel,
viewer, page view, layers, tools, selection, topics, capture, markup, export actions). Tests: `src/core/pdf/*.test.ts` and
`src/editor/pdf/*.test.tsx`.
