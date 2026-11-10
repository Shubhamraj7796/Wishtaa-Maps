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

## Panel size, divider and the Outline drawer

- **Expand** (arrows button in the panel header) cycles **Normal** (the split you set), **Wide** (about 70% of the editor) and **Full
  screen** (the PDF takes the whole editor area), then back. **Esc** (or the button again) restores Normal. The **chevron** beside it
  hides the panel to a small tab without closing the PDF; the tab brings it back. Wide is remembered on this device; Full screen is
  never reopened by itself on a computer. On a tablet or phone a PDF **opens in Full screen when the device is upright (portrait)**,
  respecting the safe areas.
- **Divider.** The edge between the PDF and the Outline or Map (the top handle of the bottom sheet) is dragged with a mouse, a
  finger or a pen, or moved with the **arrow keys** (24 px; Shift for 96 px; Home and End for the smallest and largest). **Double-click**
  or Enter switches between Normal and Wide. The width is kept per device (`wishtaamaps:pdf-width`, `pdf-height`) and limited so the
  map always keeps at least 320 px.
- **Full screen has an Outline drawer.** A floating **Outline** button (on the side away from the tools) slides the Outline over the
  PDF. Select text or a highlight and press Add as topic, or Make topic, and the new topic appears in the drawer without leaving full
  screen. Esc closes the drawer first, then restores Normal.
- Page, zoom and the place in the document are kept when the size changes; with **Fit** the page is fitted to the new width and
  the same spot stays in view.
- The PDF panel sits above the settings panel in every size, so its buttons are never covered.

## Markup (Edit mode only)

**The tools are a narrow vertical toolbar floating over the page** (not in the panel header): Select, Highlight, Underline,
Strikethrough, Pen, Text box, **Shapes** (one button showing the last shape used; Rectangle, Ellipse, Line and Arrow are in its
flyout), Whiteout, **Eraser** (touch or drag over markup to delete it), Link, then Undo, Redo, Turn left, Turn right and Hide page.
The panel header keeps the file name and menu, page number, zoom, Capture area and the Pages and Markup tabs.

- **Moving it.** Drag the grip at its top anywhere: on letting go it **snaps to the nearer left or right edge** of the PDF area. Its
  place is remembered per device. It starts at the left edge on a computer, and at the bottom of the right edge on a touch screen, away
  from the thumb and the system gestures. The **chevron** collapses it to one small handle (tap to open, drag to move). **Fade** dims it
  a moment after the last touch (and wakes on touch or hover), so it never has to cover the page. When the tools do not fit the height they go into **two columns**, and when even that is too tall into the tools alone with a **More** button (undo, redo, turn, hide and fade open from it). The bar never has a scrollbar.
- **Colours and sizes.** There is no permanent row of colour dots. Each marking tool shows **its own colour** as a bar on its icon.
  Tapping the active tool, or the small chevron on its corner, opens a **flyout** beside the bar with a palette plus a custom colour,
  a **thickness** slider (text size for the text box) and a live preview; the highlighter also has a **strength** slider.
  **Each tool remembers its own colour and size, across sessions, on this device** (for example Pen red, Highlight yellow).
- **Keys** (while the PDF has the focus, shown in each tooltip): V Select, H Highlight, U Underline, S Strikethrough, P Pen, T Text box,
  R Shapes, W Whiteout, E Eraser, L Link.
- 44 px targets everywhere. A pen (stylus) draws with its full path; once a pen has touched the screen, fingers
  scroll and zoom instead of drawing, so a resting hand does nothing. Touch selection of text uses the system handles; the selection bar
  then marks it.
- **Read mode has none of it**: the toolbar, the flyouts and the selection bar are gone; only viewing tools remain.

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

`src/core/pdf/` (types, geometry, text helpers, engine around pdf.js, device store, export, test kit) and `src/editor/markup/MarkupToolbar.tsx` (the floating toolbar, shared with the picture viewer) and `src/editor/pdf/` (panel,
viewer, page view, layers, tools, selection, topics, capture, markup, export actions). Tests: `src/core/pdf/*.test.ts` and
`src/editor/pdf/*.test.tsx`.

## Several PDFs at once: tabs and split view

**Tabs.** A strip under the panel's header lists every PDF open in this map: name, a close button (the PDF stays in the map, only the
tab goes), drag to reorder, and **+** to open another from this device or Google Drive. **+ ▸ Recent PDFs** lists the PDFs of this map
that are closed and the ones this device has kept. Each tab keeps its own **page, zoom and place on the page**; switching away and back
puts you exactly where you were. Open tabs, their order, the split and each PDF's place are remembered **per map and per device**
(local storage, key `wishtaamaps:pdf-workspace:<map id>`); PDFs the map no longer has are dropped.

**Split view.** Two PDFs side by side (one above the other when the PDF area is narrower than about 560 px, as on a phone). Drag a tab
onto the **left or right half** of the PDF area, or press **Split** in the controls row (or "Split view with…" in the PDF menu, for touch
and keyboard); **One PDF** or dropping a tab back on the strip merges. Each pane has its own page, zoom and scroll; click a pane to make it the
**active** one (marked by a coloured top edge): the page box, zoom, markup tools, selection bar, Add as topic and Capture all work on the
active pane, so they work in every pane and tab. **Sync scrolling** (checkbox, shown when split) makes the other pane follow by page and
position. The divider between panes is dragged (mouse, finger, pen) or moved with the arrow keys.

**Wide screens.** In **Wide** and **Full screen** (and when the area is at least 900 px), the PDF menu offers **Show the Outline beside
the PDFs**: PDF A | PDF B | Outline, with a draggable divider each; its width is remembered. (The Map itself cannot be put inside the PDF area; in
Normal size the PDF area sits beside it as before.)

**"p. N" badges.** Following a topic's link opens that PDF in its tab (a closed tab is reopened), or just focuses the pane when it is
already showing, and goes to the page and passage. When the file is not on this device the pane shows **Reopen PDF**.

**Memory.** Only the pages near the screen of the panes in view are drawn, and the page renderer (two at a time) is shared by all
panes. One memory budget covers all PDFs: the documents on screen stay open, the **two most recently used** others are kept for a quick
return, and every other one is closed and opened again from this device's copy when its tab is shown (`trimOpenPdfs` in `runtime.ts`).
Measured on the production build (Chromium, 5 PDFs of 200 pages, see `e2e/pdf-tabs.spec.ts`): JS heap about 10 MB after visiting all
five tabs twice; at most 3 to 6 page bitmaps alive (one pane to two panes); 60 frames per second while scrolling one pane, two panes
and synced panes (worst frame 17 to 33 ms).

## Capture area: always a NEW topic (Group A)

Before, a capture was put on "the selected topic itself", so a capture replaced that topic's picture, and with the new topic left
selected the next capture replaced the one just taken. Now **a capture never changes an existing picture**: replacing a picture is
only the explicit **Replace** on that picture.

**Capture area** (controls row) shows the **capture bar**:

- **Into: <topic> [Change]**. The target is **pinned when capture starts**: the topic selected at that moment, else the last target used for
  this PDF, else the central topic. Selecting other topics afterwards does NOT move it. **Change** waits for the next topic you choose
  in the map or the Outline (the selection is cleared so even the old target is a visible choice); **Esc** cancels. A deleted target falls
  back to the central topic.
- **Add as:** **Sub-topic** (default; after the existing children, in capture order), **Next sibling** (right after the target, and
  captures in a row keep their order; the central topic has no siblings, so it goes under it), **New branch** (under the central topic).
- **Keep capturing:** capture stays on after each capture. **Esc** ends it (the first Esc only cancels "Change"). Without it, the tool goes
  back to Select after one capture.

Each capture drags a rectangle, draws it fresh from the PDF, and makes ONE new topic with the picture (one undo step), a link
`{PDF, page, rectangle}` (so the "p. N" badge opens that PDF at that spot, in any tab or pane), and an empty title. A confirmation says
where it went ("Added topic 3 under "Chapter 5", page 12") with **Undo**, which removes exactly that topic and refuses (with a message)
once other edits were made after it. The picture goes through the normal store: the same bytes are one picture however many topics use
it, and it uploads once to Drive. **Compressed or Original** is asked **once per capture session** (until capture ends) and the answer is
used for the rest. Every captured picture gets the same tidy width, **320 px** by default (Preferences, "Captured picture width", 120 to
1200), aspect kept, never enlarged; any picture can be resized later. Read mode has no capture and writes nothing.

**Titles (Group B, both off by default, remembered on this device).** The **...** button in the capture bar opens "Give the new topic a title":

- **Name the topic from the page:** "<PDF name without .pdf>, p. <page>", for example "Audit may 24, p. 3".
- **Add the text inside the rectangle as the title:** the text-layer lines whose middle is inside the rectangle and at least half of whose
  width is (hyphenated breaks mended, up to 200 characters). A scan (no text layer) or a failed text read gives no title. With both on, the
  text wins when there is some, otherwise the page name. Titles apply in every Add as mode. Esc closes the menu first.

Touch: the capture rectangle uses pointer events with the page's touch scrolling turned off (`touch-none`), so a finger or pen draws it
instead of scrolling; the bar's buttons are 44 px on touch screens. Checked with synthetic touch events in a real Chromium (see
`e2e/pdf-capture.spec.ts`); **not** yet tried on a physical tablet.

Not yet built (later group): the clips tray.

## View menu: Two-page view (Part 2, Group A)

The **View** button (book icon) is in the panel's tool row and, in a split view, at the top right of each pane. It acts on that PDF only; the
choices are remembered per PDF and per device with the workspace (`wishtaamaps:pdf-workspace:<fileId>`, optional fields `two`, `cover`,
`paged`, `rtl`, `fit`; saves from before load as one page, scrolling, fit width).

| Choice | What it does |
| --- | --- |
| Single-page view / Two-page view | One page per row, or two pages side by side (a *spread*). |
| Show cover page | Two-page only. On: page 1 alone on the right, then 2-3, 4-5... Off: 1-2, 3-4... (the last page of an odd book is alone on the first side). |
| Enable scrolling | On (default): a continuous column of pages or spreads. Off: one page or spread at a time, turned with the page buttons, the page box, or the arrow keys (the arrows scroll instead when the page is zoomed past the pane; Page Up/Down turn when the page fits top to bottom). |
| Right-to-left reading | The first page of a spread is on the right (the cover on the left). |
| Fit width / Fit page / Actual size / 50-300% | Fit width fits the whole spread across the pane; Fit page also fits its height. Paged fits the spread on show. |

- **Common height.** Pages of different sizes in a spread are scaled to the taller one; an empty half (a lone cover or last page) is as wide as the page beside it.
- **Narrow panes.** A chosen Two pages is honoured down to **480 px** of pane width; narrower, one page is shown, the choice is kept, and the menu says why (and Two pages returns when there is room). Nothing switches to two pages by itself, so the 640 px automatic limit has no case yet.
- **Page buttons** read "Previous/Next spread" and the page box says "(showing 3–4)" when two pages are showing. "p. N" links, Sync scrolling and the page box all use page numbers, so they open the spread that has the page.
- **Memory.** Only the spreads near the screen exist (as with single pages) and Paged draws one spread. The 2-background-document limit is unchanged. Measured in Chromium with a 60-page PDF: three spreads in the page and six page pictures while scrolling, two while Paged.
- **Tools.** Text selection, markup, Add as topic and Capture work on either page of a spread (each page has its own layers). Read mode shows the pages without tools.
- Code: `src/editor/pdf/spreads.ts` (pure layout maths, tested in `spreads.test.ts`), `spreadState.ts` (what each pane shows now), `ViewMenu.tsx`, `Viewer.tsx`; tests `views.test.tsx` and `e2e/pdf-views.spec.ts`.
- **Not yet (Group B):** page-turn styles (Slide, Flip, Fade, None), tap-the-edge and swipe turning, Presentation mode, laser pointer.
- **Not tested on a physical tablet or phone**, nor in Safari or Firefox.

### Two-page view makes room, Fit height, remembered layout (Part 1 of the combined list)
- `chooseLayout(id, change)` (actions.ts) is the one way the View menu and the book button change the layout. Turning Two pages on sets the panel to Full and stores `widenedFrom` (the size before); turning it off restores that size only if the size was not changed by hand since (`setPdfSize` clears `widenedFrom`) and no other pane is still in Two-page view. Not saved to disk.
- Fit height: `fitScale(..., 'height')` fills the pane height; saved as `fit: 'height'`.
- The last layout is stored per device in `wishtaamaps:pdf-default-layout` (`layoutDefault.ts`, only the valid layout fields). A newly added PDF starts in it when the window is at least 900 px wide. `resetPdfLayout` ("Reset to default layout") clears the key and returns the current PDF to one page, scrolling, fit width.
- The book button (toolbar, `data-two-toggle`) is not shown in the small View button of a split pane.
- Presentation mode is a disabled menu item until Group B builds it.

