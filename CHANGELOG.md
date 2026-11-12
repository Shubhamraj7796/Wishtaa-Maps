# Changelog

## Unreleased

### Notes and tasks (steps 1 to 5, built and committed locally, nothing pushed)
- Step 1: one **popup shell** (`src/ui/ItemPopup.tsx`) for notes and tasks: centred on a computer or tablet, a full-screen sheet under 640 px; Tab stays inside, Escape or a press on the dim background closes it, the focus goes back to where it was, a popover opened inside it takes Escape first, and the map keys wait behind it.
- Step 2: **several notes per topic.** The topic's first note stays where it is (`topic.note`, nothing migrated); extra notes live in a new shared map `notes` that is merged per note (two devices writing different notes keep both). On a topic only a small **notes icon with a count** shows (map and Outline); a click opens a popover list (title or start of the text, preview, edited time, an Add icon). Search finds topics by any of their notes, the file index and the Files Notes list include them, and copying an outline writes them as `[Note] ...` lines that are not read back as topics.
- Step 3: the **note popup.** A note opens in the popup with a title (the first note of a topic has none), the rich-text editor with an **icon toolbar** (bold, italic, underline, strikethrough, headings, lists, quote, code, link, undo, redo; every icon has the shared tooltip, the chosen one is highlighted) and its created and edited times. It autosaves (500 ms), closing it saves what was typed first, a new note left completely empty is removed, and Delete removes at once with an Undo notice. The Notes tab of the side panel is now the list of the topic's notes (one editor for a note, wherever it is opened from). In Read mode the popup has no toolbar and cannot be changed.
- Step 4: **tasks.** Tasks of their own (title, status To do / Doing / Done as three icons, due date, priority 1 to 5, the topic, details) in a new shared map `tasks` that is merged per task, beside the older "this topic is a task" flag (kept, listed too, still readable by older versions). A small tasks icon with a count on topics (map and Outline) opens a list; the popup edits a task; Details > Task lists more tasks on the topic. Search, the file index and the outline export include tasks (`[Task] [ ] ...` lines, not read back as topics).
- Step 5: the **Task view** (a new icon beside Map and Outline): all the tasks of the open map by date in an **Agenda** (Overdue, Today, Tomorrow, This week, Later, No date, Done), each row with a tick, the title, the topic path as a small label, priority and due date; a click opens the popup. Filters on demand: status, priority, topic (and sub topics), due dates, words. Month, Board and all-maps are not built yet.

### Notes and tasks, part 2 (wider notes, a task on the note, the Task view by time; local commits, nothing pushed)
- Part 2.1: **data.** A task gets two optional fields: `time` ("HH:MM", local clock time next to the date, never a UTC instant; needs a date) and `noteId` (the note it belongs to; kept on the task only, the note gets nothing, so the two can never disagree). Old tasks stay all-day with no note, and older versions ignore both fields. Merge tests: note text on one device and the task time on the other (both kept), the same time on both (newer wins, reported), a note deleted while its task is edited (the task survives), and two tasks added to one note (both kept).
- Part 2.2: **the Task view by time, and Arrange.** Tasks get a **Due time** in the task popup (next to the date; needs a date; a clear icon makes it all-day). Each row shows its time or "All day"; inside a date group the all-day tasks come first, then by time. **Overdue looks at the clock:** a timed task is overdue from the minute after its time (a 5 pm task is not overdue at 4 pm or at 5:00 pm, but is at 5:01 pm; the view re-checks every 15 seconds), a task with no time from the next day. A new filter **Time of day** (any / only timed / only all-day). A new **Arrange** icon in the Task view opens a popover: **Group by** Date (as before), Priority, Status, Topic / branch, or None (one flat list); **Sort by** Date and time, Date only, Name (A to Z), Priority, Status, Created; an icon turns the sort ascending / descending. The choice is remembered on this device and combines with the filters; tasks with no date or priority form a last "No date" / "No priority" group. (`core/tasks/agenda.ts`, `items/ArrangeMenu.tsx`, tests `arrange.test.ts`, `taskView.test.tsx`, e2e at desktop, tablet and phone size.)
- Part 2.3: **wider note popup.** One size icon in the note popup header steps Normal, Wide, Full screen, Normal; its tooltip names the next step ("Wider", "Full screen", "Narrower"). The size is remembered on this device (`wishtaa.noteSize`); under 640 px the popup stays a full sheet and the icon is hidden. The editor uses the extra width. The formatting toolbar never wraps: when the popup is too narrow, the last tools move into a **More formatting** menu (`visibleTools`, a ResizeObserver); at normal size on a computer and on a tablet all 14 tools show.

### Open a PDF in the toolbar (PDF panel)
- A new **Open a PDF** icon (a document with a plus) in the top bar, with the tooltip "Open a PDF". Click: a small popover (drawn above everything, never clipped; keyboard: arrows, Enter, Escape, focus returns; 44 px targets on touch) with two icons, a laptop **From this device** and a cloud **From Google Drive**, and a short Recent PDFs list (file names) under them. It is on the bar when only ONE PDF is open too.
- The **"+" of the tab row** is the same icon and opens the same popover (one shared component). The two items in the "..." menu stay as a second way. Drive opens exactly as before (the separate PDF Picker, the Brave notice).
- **The bar's buttons now leave in this order as the panel gets narrower:** Focus (under 680 px), Split (640), the page arrows (600), the two-pages book (560, it is in the View menu), Close (500, in "..."), and last Open a PDF (440; on a touch screen 500). Collapse, the file name, the page box, View, Capture, Markup, "..." and the size button always stay. The file name keeps at least 107 px at every width tested.
- **Empty panel** (no PDF open): two large buttons with words, "Open from this device" and "Open from Google Drive" (dropping a PDF still works). In Read mode only "This map has no PDF."

### Collapse PDF (PDF panel)
- A **Collapse PDF** icon (first button of the top bar, shortcut **Alt+Shift+F**, also "Collapse PDF" in the "..." menu and the command palette) tucks the panel into a slim **36 px edge tab** on the PDF's side: the PDF icon, the file name written downwards, a badge with the number of open PDF tabs when there are two or more, tooltip "Open PDF". On a touch screen, a phone or a narrow window it is a **floating 48 px button** instead. One click, a tap, Enter or the shortcut opens the PDF exactly as it was.
- The PDF stays open: tabs, split view, active pane, page, zoom, one or two pages, the markup tool and bar, and the panel size (Full too) are kept. Opening it again puts every pane back at the same place (0 px difference in the browser tests, including a split view and a 200-page PDF). While collapsed the page pictures are let go (fewer canvases and page elements).
- **Remembered across a reload** (per map, on this device): a collapsed panel comes back collapsed with the same tabs and places; a closed panel stays closed.
- Collapsing ends **Capture area** (its options and last targets are kept), is **refused with a notice while a text box, link or note has words typed in it**, and waits for an open question (Compressed or Original, password). Escape does not open a collapsed panel.
- **Fix:** while page sizes are still being learned in the background, the page in view no longer slides away in a PDF whose pages differ in size (the place is put back each time).
- The two-pages book button is on the top bar from a 560 px panel; below that it is in the View menu. The View menu opens to the left when it would run off the window, even after the panel moved under it.

### Icons first, steps 1 to 4 (shared tooltip, icon set, PDF View menu and bars)
- **One tooltip for the whole app** (`src/ui/Tooltip.tsx`): hover (after half a second, at once between neighbours), keyboard focus, and a **long-press on touch** that shows the name without running the control. It is drawn in a layer above everything, so a menu or panel never clips it, and it follows the screen edge. The header and Read-toolbar buttons use it now.
- **Shared controls** (`IconButton`, `IconTile`, `IconToggleGroup`, `Swatch`, `TipButton`): the name is required (aria-label and tooltip), the chosen option is a highlighted background, one size (36 px, 44 px on touch).
- **14 new icons** in the same style: one page, two pages, first page alone, scrolling, 1-page flipping, right to left, fit width, fit page, fit height, actual size, presentation, new topic after, new branch, make a topic.
- **PDF View menu rebuilt as icons**: pages (one, two, first page alone), reading (scrolling, 1-page flipping, right to left), four colour swatches, zoom - / % / + (the percentage is the real zoom, also while Fit is on; click it for a list), fit width / page / height, actual size, presentation (greyed), reset. 296 x 257 px with no scrolling (it was 288 x 600 px and scrolled). First page alone and 1-page flipping are greyed out, not hidden, until two pages are chosen. The menu opens to the left when it would run off the window.
- **PDF top bar**: Capture area, Split, Markup, View, Two pages, Focus, More, the page arrows and the size button are icons only (the PDF name, page number and zoom percentage stay text). Split now fits from a 560 px panel (it was 700 px).
- **Capture bar**: Add as Sub-topic / Next sibling / New branch and Keep capturing are icon toggles. **Selected markup and lasso bars**: Add note, Make topic, Copy, Delete, Done are icons. The pen bar, its flyouts and the customise panel use the shared tooltip instead of the browser one.
- Steps 5 to 7 (map toolbar and header captions, Insert menu, Files, menu icons, the rest of `docs/icons-audit.md`) are still to do.

### Pen and markup: customisable bar, pressure, straight-angle correction, palm rejection, lasso (PDF panel, Part 2 C1 to C3)
- **Customise the tools** (the sliders button on the pen bar): choose which tools show and their order (Select always stays), with **Reset to defaults** (every tool back, presets forgotten, pen settings back). Kept on this device.
- **Presets** in each tool's colour-and-size flyout: save the current colour and thickness (up to five per tool), tap one to use it, remove it. **Finer thickness:** lines go down to 0.5 in half steps (the starting values are unchanged); the flyout still has the live preview.
- **Stylus pressure:** a pen that reports pressure draws a thicker line where it presses harder (half pressure is exactly the chosen thickness). Stored as an optional list on the stroke, and kept in **Download PDF with markup**. A mouse, or a pen that cannot sense pressure, draws as before.
- **Straight-angle correction:** hold the pen still for 0.6 seconds at the end of a stroke. A nearly straight stroke becomes a straight line (flat, upright and 45 degree lines are made exact), a hooked end an arrow, and a nearly closed stroke a clean rectangle, circle or ellipse (only when it is nearly closed). After a line snaps the pen still steers its end; walking away from a snapped shape gives the stroke back as a drawing. Two switches: lines, and shapes.
- **Palm rejection** and **Stylus only:** after a pen has been used, while it is down or just lifted, or for a touch as big as a palm, a finger scrolls instead of drawing; Stylus only makes a finger never draw. Both are switches in the customise panel.
- **Lasso select** (new tool, key O): draw a loop round markup on a page, then drag the box to move it, drag a corner to resize it (keeping its shape, inside the page), recolour it, **Copy** it (a little to one side) or **Delete** it. Each action is one undo step. Read mode has no lasso.
- All of it is kept on this device or in the map as optional markup data; no change to the saved map format beyond the optional `pressure` list. Not tested on a real tablet and stylus.

### Document colour, First page alone, 1-page flipping (PDF panel, Part 2 B1+B3, reduced scope)
- **Document colour** in the View menu: Light (default), **Dark** (the page picture is inverted and the hue turned half way round), **Grey** and **Sepia**. It is display only: a CSS filter on the page picture and nothing else. The PDF file, the markup (drawn above the page picture, so it keeps its own colours and stays readable in Dark), captured and Add-as-topic pictures (drawn fresh from the PDF) and Download PDF with markup are untouched. Saved per PDF and per device; the last choice starts new PDFs on screens at least 900 px wide; **Reset to default layout** clears it.
- **Show cover page** is now **First page alone** (the saved value is still `cover`).
- **1-page flipping** (shown only when Two-page view is chosen): with Enable scrolling off, a turn moves by one page (1-2, 2-3, 3-4; with First page alone: 1, 2-3, 3-4). Scrolling mode is unchanged.
- The View menu is grouped: Pages on screen, Reading, Document colour, Zoom.
- Postponed (not built now): Horizontal scrolling direction and the 4-page (2x2) grid.

### Clean reading interface: the page comes first (PDF panel, Part 2 Group A)
- **One thin top bar** (44 px) replaces the rows above the page: close, the PDF's name (a drop-down of every PDF of the map, with Open a PDF, Split, Download and the rest), the page ("3 of 12": type a number to jump), the book button, **View**, **Capture area**, **Split**, **Markup**, **Focus**, **...** and the size button. On a narrow panel Split, Focus, Close and the arrows move into the **...** menu, which also holds Open a PDF, Sync scrolling, Page thumbnails, Markup list, Show hidden pages, "Pen bar folds away when idle", Make bigger and Hide the panel. Nothing was removed. Zoom (out, in, fit, percentages) is in the View menu.
- The tab strip shows only when two or more PDFs are open and the panel is at least 700 px wide; otherwise the name drop-down lists them.
- **Floating pen bar:** hidden until you press **Markup** (or pick a tool by its key). It is movable, collapses to a small button, and folds away by itself after about 4 seconds without activity (a setting in **...**; tap the small button to bring it back). The **Pages / Markup** tab row is gone: the **Markup list** is a drawer over the pages (**...**, then Markup list; Escape closes it).
- **Page chip:** "Page 3 of 12" (or "Pages 3-4 of 12") floats over the page and fades after a moment.
- **Focus mode:** hides every control except a tiny handle (top centre). Escape or the handle brings them back. At **Full screen** the app header and the map toolbar also step aside (Escape or the size button bring them back).
- The "looks scanned or handwritten" note is now a small dismissible hint, shown once per PDF, instead of a permanent row.
- **Page thumbnails** (optional, off by default, remembered): a strip beside the pages; only the thumbnails near the strip's view are drawn.
- Measured at 1366x768 (page area starts): Normal 285 px down before, 141 px after; Full 249 px before, 44 px after; Focus 0 px of panel controls. See `docs/pdf-source-panel.md`.

### Two-page view makes room; Fit height; remembered layout (PDF panel)
- Choosing **Two-page view** (View menu, or the new book button in the toolbar) takes the panel to Full screen so both pages show side by side; choosing Single-page view gives the earlier size back. A size you set by hand is never undone.
- **Fit height** added to the View menu (the page height fills the pane). **Presentation mode** is listed but disabled until it is built.
- The last layout you chose (Single or Two pages, cover page, scrolling, right to left, fit) is remembered on this device and used for NEW PDFs on screens at least 900 px wide. **Reset to default layout** in the View menu forgets it and puts the current PDF back to one page.

### View menu: Two-page view (PDF panel)
- New **View** menu in the PDF panel and in each Split pane: Single-page or Two-page view (two pages of the same PDF side by side, like an open book), Show cover page (page 1 alone on the right, then 2-3, 4-5...), Enable scrolling (off: one page or spread at a time, with the page buttons and the arrow keys), Right-to-left reading, and Fit width, Fit page, Actual size or a percentage. Remembered per PDF and per device. Pages of different sizes share one height in a spread. A pane narrower than 480 px shows one page and the menu says why. The page buttons step by spread; a "p. N" link opens the spread that has the page. Capture, text selection and markup work on both pages.
- Escape now closes an open View menu before it ends Capture area.

### Capture area always adds a NEW topic (PDF panel)
- Optional titles for captured topics (off by default, remembered): name from the page ("Audit may 24, p. 3") and the text inside the rectangle when the PDF has text. Escape inside the capture menu closes it first.
- A capture no longer changes the picture of a topic: every capture is a new topic (one undo step) with the picture, a PDF, page and rectangle link and a "p. N" badge. Capture bar with **Into** (pinned when capture starts; **Change** picks a topic in the map or Outline on purpose), **Add as** (Sub-topic, Next sibling, New branch) and **Keep capturing**; a confirmation with **Undo**; Compressed or Original asked once per capture session; tidy picture width (default 320 px, Preferences). See `docs/pdf-source-panel.md`.

### Google picker that cannot open
- When a browser blocks Google's file picker (for example Brave), or it does not open within 15 seconds, one notice says so, with Copy link to open in another browser, Try again, Choose a file from this device and Copy details. Google's picker is hidden and disposed, and anything it reports late is ignored. Cancelling never shows it. Previously the app waited forever.

### Drive always uses the account you signed in with
- **Sign in with Google** now connects Google Drive by itself in the same consent screen (only `drive.file`): no second window or click, and a clear "Google Drive connected as name@gmail.com." If Google gives no Drive token, one button asks for it.
- Every Drive token is checked: its account must match the sign-in account (Gmail addresses compared the way Google does). A different account is discarded and revoked, with "This Drive belongs to other@gmail.com. Please use the same Google account you signed in with (name@gmail.com)." and **Try again**. Email sign-ins with a Gmail address are held to the same rule; other addresses may connect any Google account, saved in the account.
- Friendly help for "Access blocked / app not verified / not a test user" (who to contact, **Copy details**) and for a blocked pop-up (a button opens it as a direct click). See `docs/drive-sign-in.md`.

### Privacy Policy and Terms (accounts, step 3)
- Static pages at `/privacy` and `/terms` (work without JavaScript, light and dark, phone-friendly), marked as **drafts** with highlighted blanks (owner name, contact email, region, age, governing law). Linked from the login dialog and the sidebar footer. The service worker never saves them as the app page.

### Google sign-in linked to Drive (accounts, step 2)
- After **Sign in with Google**, one clear question asks for the narrow Drive permission in the same Google account (`login_hint`). **Connect Google Drive** after an email sign-in always shows Google's account chooser, shows which account was linked, and says so when it differs from the sign-in email.
- Drive access renews itself: about every 50 minutes, when the tab returns, after a reload, and on the next click if the browser needs one. The "sign in again" bar appears only when Google itself asks the person to confirm. The account records which Google address is linked (never a token).
- Sign-out and a different person signing in remove Drive access and the cached Drive list from the browser, never dropping unsent edits. See `docs/drive-sign-in.md` (also: what needs a server, with a plan, cost and risk).

### Accounts (optional; the app is unchanged without the Supabase settings)
- **Sign in** with an emailed 6-digit code, email and password (confirmation, "Forgot password", reset page), or Google. One account per verified email whichever way. Account menu (name, Preferences, Storage settings, Account, Sign out), Account page (name, ways to sign in with add/remove and never the last one, sign out of all devices, delete account with a clear note that Drive files are not touched).
- Sessions refresh by themselves; offline the app stays signed in and sync resumes; an expired sign-in shows "Sign in again" and never loses local work.
- Supabase holds only profile, preferences, recent-files list and Drive link status (`supabase/migrations/0003_accounts.sql`, owner-only row-level security tested against a real Postgres engine). Never map content or pictures.
- First sign-in with files in this browser offers "Add my files to my account" (names only; optionally move to Drive). Sign-out removes the person's Drive access and cached Drive list (never dropping unsent edits); guest files stay.
- Service worker never reads or keeps sign-in traffic. CAPTCHA (Cloudflare Turnstile) and rate limits are dashboard settings: see `docs/auth-setup.md`.

### Add picture: one menu, crop, readable compression, touch
- **Add picture** menu with Upload, Upload and crop, Take photo, Choose from Photos, Paste from clipboard, Capture screen (Ctrl+Shift+S), drag and
  drop, and Insert from my pictures. Bottom sheet on touch devices (decided by the device, not the window width).
- **Crop step** for camera, photos, paste and capture: large touch handles, pinch and pan, rotate, Retake, live size, keyboard control.
- **Readable, not high resolution**: Compressed (about 1280 px, WebP/JPEG/PNG whichever is smallest, never enlarged, EXIF removed) or Original;
  asked only when it would save at least 25% and 30 KB; "don't ask again" in Preferences; the same choice once for a whole .emmx import.
- Pictures get content-hash ids, so the same picture is stored once. See `docs/pictures.md`.

### Open from Google Drive (.wishtaa and .emmx)
- One action, **Open from Google Drive**, everywhere (Home, All files, Google Drive page, New file dialog, command palette). Several files at once.
- Every pick is checked by name and content; other files are refused with a clear message. See `docs/google-drive-setup.md` for what the Picker cannot do.
- An **.emmx** is converted into a NEW `.wishtaa` in your Drive (the original is only read), with a link back to it; picking it again offers the
  converted copy. Failures offer Retry and "Convert into this browser instead". A summary lists converted, opened, skipped and failed files.
- New `.wishtaa` files in Drive have the type `application/vnd.wishtaa.map+json`; older ones (plain JSON) still open and are not rewritten.

### Settings panel: layout dropdown, context-aware sections, auto-show
- The layout list is one compact row that opens a grouped list with thumbnails (also used for the layout of a single branch, Theme and Theme colour).
- The panel shows what fits the selection: Canvas, Style, Picture format (size, aspect ratio, position, alt text, replace) or the style of the
  selected line, callout, boundary or summary. Tabs have text labels. A small toolbar floats above a selected picture.
- It tucks away to a thin handle, opens on hover over the right edge or when something is selected, can be pinned, and has Auto / Always open /
  Manual in Preferences. See `docs/settings-panel.md`.

### Navigation, automatic branch thickness, Read mode
- **Navigation**: two-finger scroll moves the map; Ctrl + wheel and trackpad pinch zoom around the pointer; Shift + wheel moves
  sideways; a mouse wheel follows Preferences (Move the map, or Zoom); zoom 2% to 400% with a typeable percentage; touch glide.
- **Automatic branch thickness** is the default: bold near the centre, thinner each level, tapered, sized from the topic and the
  central topic, never under 1.5 px on screen. Manual thickness still wins; Auto and Reset to automatic added.
- **Read mode** (Edit | Read, Ctrl+Shift+R): nothing can be changed or saved, view state only for folding and highlighting, a
  read-only details panel, picture viewer with zoom and next/previous, Refresh from Drive, view-only Drive files open read-only,
  per-file "Open in read mode by default" (mirrored to Drive) and an "Open all files in Read mode" preference. See
  `docs/navigation-thickness-read-mode.md`.

### Drive: recognise our own writes by a writer marker, not by clocks or versions
- Every write sets `appProperties` on the Drive file (`editorSessionId`, `writeCounter`, `writerOrigin`) and stores the same
  values plus the returned `headRevisionId` locally. A check is: same revision or checksum = unchanged; newer revision with our
  marker = our own write; otherwise another editor. Client and Drive clocks are never compared.
- Another writer whose content is byte-identical is adopted silently. The conflict dialog now says who wrote it (another
  address such as maps.wishtaa.com, another tab, or outside the app).
- Saves of one file are queued across every repository in the page and under a browser-wide Web Lock, so two tabs can't
  interleave "check, upload, store the new base".
- Editor header shows where the file saves: "Google Drive · account" or "This browser".

### Colour and line controls, quick toolbar (Phase 3 of 3)
- **Quick toolbar** next to the selected topic(s): font, size, bold / italic / underline / strikethrough, text colour,
  highlight, alignment, fill, line colour, shape, Branch, Connector style, format painter and More. Flips below when there is
  no room above, stays on screen, keyboard reachable, touch sized. See `docs/colours-and-toolbar.md`.
- **Colour picker**: map colours, standard colours, recent colours, hex box, eyedropper (where supported), No fill, opacity,
  and WCAG AA contrast warnings with a one-click readable colour.
- **Branch controls**: colour, thickness 1 to 20, curve (curved, straight, elbow, rounded elbow, tapered, none), dash, arrow
  head, opacity; for one branch or for the branch and everything below.
- **Relationship lines**: colour picker, thickness and curve sliders alongside dash and arrow ends.
- **Text**: underline, strikethrough, highlight, left / centre / right, A+ / A-.
- Slider drags show live on the canvas and save as one undo step.

### Topic shapes and size (Phase 2 of 3)
- **30 shapes**, drawn as cached SVG paths with text-safe areas and connection points: boxes, circles, double circle, diamond,
  hexagon, octagon, cloud, bursts, speech bubble, heart, star, cross, clover, gem, shield, underlines, text only, and more.
  See `docs/shapes.md`.
- **Style panel > Topic**: shape picker, corners, filling (solid, gradient, pattern), shadow, custom width, border colour,
  weight, dash and double border. Apply to the selection, a level or a branch.
- **Double circle**: inner circle plus outer ring with a gap; fill, ring colour, thickness and gap are separate settings.
- **Custom width** with text wrapping, a drag handle and Alt+Shift+Left/Right.
- Tests: a recorded drawing for every shape, picker and panel component tests.

### Fixed: false "Two versions of this file" conflicts on Google Drive maps
- **Cause**: after our own save, Drive raises its internal `version` number by itself (thumbnails, indexing, views) while the
  content and modified time stay identical. We compared that number, so our own file looked "changed by someone else".
- **Now** a conflict is raised only when Drive's content really differs from what we last wrote or fetched (content checksum,
  then revision, then modified time for older records). The new base is stored from Drive's response before the next save runs,
  saves of one file are strictly serialized, and "Keep mine", "Keep Drive's" and "Save a copy" all reset the base.
- "Not saved - retry" re-checks Drive afresh and shows the real reason under the status.
- A file open in two tabs shows "This file is open in another tab" instead of the tabs competing.
- Diagnostics: open any page with `?debug=drive` (or set `localStorage['wishtaamaps:debug-drive'] = '1'`) to log every
  check and save to the console and `window.__driveLog`.

### Themes, colour schemes and branch styling (Phase 1 of 3)
- **New theme model (format version 2)**: a theme defines, for the central, main, sub and deeper levels, the shape, fill style,
  border, font, text colour, and the branch curve, thickness, taper and dash. Themes are JSON (`themes.json`), so adding one
  needs no code. Older maps open unchanged: a recording of how all 26 earlier themes drew is replayed by a test.
- **Theme gallery** with Light, Dark and Custom tabs: live SVG mini-map previews (drawn lazily), hover or focus to preview on
  the canvas, click to apply as one undo step. 33 themes now (7 new): double-circle centre (Orbit, Halo), pastel, tapered
  brush, underline, and high-contrast light and dark (7:1).
- **Colour schemes**: 15 palettes (rainbow, warm, cool, pastel, earthy, five one-colour families, two colour-blind-safe).
  Main branches take colours in order, sub-branches inherit; changing the scheme recolours without changing shapes.
- **Branch thickness slider (1 to 20 px) and Taper**: map-wide overrides of the theme; tapered branches are thick at the parent
  and thinner toward the topic. Dragging the slider is one undo step.
- **Custom themes**: save the map's current look, customise, rename, duplicate, delete, export and import as JSON. They are
  stored through a repository interface (browser storage now) and kept inside each map that uses them.
- **Double circle** shape (outer ring, gap, inner disc) for any topic.
- Applying a theme keeps your per-topic overrides unless you choose to reset them. `.emmx` imports keep their colours as
  topic overrides on the default theme.
- See docs/themes.md.

### Import: choose where to save
- The import dialog has **Save to** (This browser or Google Drive with the connected account), with the same defaults,
  remembered choice, Drive folder choice, "Connect Google Drive" and "Don't ask again" as New file.
- The question is skipped inside a local folder (imports there) and on the Google Drive page (imports into the Drive
  folder being viewed, new "Import .emmx" button); the New file dialog's Import uses the choice made there.
- In Drive the `.wishtaa` file (with its pictures) is created first, so the first autosave updates it. If Drive fails:
  Retry or Import to this browser instead; the imported map is never lost.

### Import MindMaster / EdrawMind (.emmx) files
- **Import** (Home, All files, New file dialog) opens an `.emmx` as normal, editable Wishtaa maps, one per page. Topic
  tree, text, pictures at their displayed size, which side main topics were on, and the original fill, outline, branch
  and text colours and font sizes. Import only; no `.emmx` export.
- **Pictures keep their original bytes** (PNG, JPEG, GIF, WebP detected from the first bytes), stored once per distinct
  picture; only pictures over 4000 px are reduced. SVG and oversized or damaged pictures are refused.
- Placeholder texts ("Main Topic", "Subtopic", ...) are cleared on topics that have a picture (option, on by default).
- **Nothing unknown is fatal**: unsupported shapes and content are skipped, counted and listed in a report (and logged
  with their type names so samples can be sent).
- **Safe by design**: 50 MB / 2,000 entries / 200 MB limits, only known entries read, no path from entry names,
  traversal in picture locations refused, strict XML with no DOCTYPE or entities.
- Main topics can carry a chosen side in the balanced mind map; topic style gains a connector colour.
- See docs/emmx-import.md. New dependency: `fflate` (ZIP reading).

### Choose where new files are stored
- **"Save to" when creating** a mind map, knowledge base or folder: This browser or Google Drive (with the connected
  account). Drive is the default when connected, otherwise This browser; the last choice and the last Drive folder are
  remembered. When Drive isn't connected, **Connect Google Drive** connects and carries on creating.
- **Drive location**: defaults to the Wishtaa Maps folder; **Choose another folder** opens Google Picker in folder mode.
- **"Don't ask again, always use ..."**, resettable in Storage settings ("Ask me each time").
- **Context rules**: from the Google Drive page (or a Drive folder) it creates directly there; inside a local folder it
  creates directly in that folder; from Home, the sidebar, the top of All files and the command palette (New mind map,
  New knowledge base, New folder) it asks.
- **Created in Drive immediately** as a `.wishtaa` file, so the first autosave updates it; Drive folders are real Drive
  folders. If Drive fails (offline, expired sign-in, full), the new file stays safe in this browser and you can
  **Retry** or **Create in this browser instead**.
- **Move to this browser** (with a confirmation) next to Move to Google Drive. "Keep only in this browser" is now
  "Stop syncing with Drive" (it leaves the Drive copy as it is).

### Google Drive storage (Phase B)
- **Connect Google Drive** from the Google Drive page, the New file dialog, or Storage settings. Uses Google Identity
  Services with the single `drive.file` scope (only files this app creates or the user opens with it). Tokens live in
  memory only and are renewed silently; no Google token is stored anywhere. First connect creates a "Wishtaa Maps" folder.
- **Maps and knowledge bases as `.wishtaa` files** (versioned JSON, with pictures and attachments inside).
- **Move to Google Drive** and **Keep only in this browser** in each file's menu; **Open from Drive** with Google Picker;
  a Drive browser limited to the Wishtaa Maps folder; a Drive badge in file lists.
- **Autosave to Drive** with the same debounce, queue and save indicator. Saves go to this browser first, then Drive.
  Offline shows "Offline - will sync" and catches up when the connection returns.
- **Conflict detection** (Drive version check before every upload) with *Keep mine*, *Keep Drive's*, *Save a copy*.
- Handles expired sign-in (reconnect bar), revoked access, Drive full and rate limits with plain messages.
- `DriveRepository` wraps the local repository behind the same `FileRepository` interface. See docs/google-drive-setup.md.
- Fixed while building: the sync subscription lost its `this` when handed to React.

### App shell, files and knowledge bases (Phase A)
- **Shell**: sidebar (New file, Home, All files, Knowledge base, Gallery, Storage > Google Drive, Trash, storage info),
  top bar with search across all files, a drawer menu on phones, light and dark themes, and a dismissible
  "Files are saved in this browser only." banner. Routes: /home, /files, /files/:folderId, /kb, /kb/:id, /map/:id,
  /gallery, /drive, /search; `vercel.json` rewrite so refresh and deep links work.
- **Home**: Create new, Continue where you left off, Recent files, Starred, friendly empty state.
- **All files**: tabs My files / Notes / Resources / Recycle bin, filter chips, sort (editing time, name, created, with
  direction), grid and list views, folders nested to any depth with breadcrumbs, rename, move (drag and drop or "Move to"),
  duplicate, star, trash, restore, delete forever, multi-select with bulk actions. Every map has a thumbnail refreshed on
  each save.
- **Knowledge base**: files of type "kb" that open as a mind map, with starter structure (Concepts, Resources, Projects,
  Notes), a Notes button, an example knowledge base, search over topics, notes and tags, links to other maps or
  knowledge bases with a picker, and backlinks.
- **Data layer**: `FileRepository` interface; `LocalRepository` on IndexedDB (a Supabase or Drive repository can replace it
  without UI changes). The old single map in the browser is imported as "My first map". See docs/files-model.md.
- Fixed while building: opening and closing a file are queued so React's double mount can't leave a file without autosave.

### Phase 3: rich content, diagram objects, outline, icons
- **Diagram objects**: relationship lines (label, curve, arrow ends, style, colour), callouts, boundaries, summaries. Each has
  an inspector bar; all are undoable and follow their topics.
- **Marks**: priority 1 to 30, progress, emoji, portraits, stars, flags, arrows, symbols. **Clipart**: curated categories plus
  search over about 2,000 open-source icons.
- **Topic content**: rich-text notes, short notes, coloured tags with filtering, tasks (done, dates, assignee, priority),
  hyperlinks (web, mail, or to another topic), file attachments, LaTeX formulas, tables, automatic branch numbering.
- **Outline view**, editable and synced with the map.
- **Pictures**: position (above, below, left, right, behind), apply one width to all, preview, download, replace, and OCR
  that reads text from a picture in the browser and turns it into text, a note or sub-topics.
- **Icons everywhere**: toolbar, Insert menu, panels, context menu, layout thumbnails, shapes, line styles, arrow ends and
  picture positions. Every icon has a tooltip and screen-reader label.
- Insert menu with shortcuts; every new feature is also in the command palette and the shortcut sheet.
- Fixed: Enter/Space on a focused button no longer triggers editor shortcuts; summaries and boundaries could not be saved
  when selected (wrong collection lookup); the OCR dialog could freeze in development builds.

### Phase 2: layouts and styling
- 22 layouts: mind map (balanced, left, right, top-down, bottom-up), tree map (4 directions, curve/elbow/straight),
  timeline (horizontal, vertical), org chart (top-down, left-right, compact), fishbone (2 orientations), tree table
  (2), circular, bubble, sector, bracket map. Switchable at any time; undoable.
- Per-branch layout direction, adjustable topic spacing, branch free positioning, sibling alignment, topic overlap.
- 26 original themes (light, dark, hand-drawn), rainbow branch colours, custom palettes, background colour and
  pattern, hand-drawn style, and a custom theme editor (themes are saved with the map).
- Per-topic style: shape, fill, border, font, size, bold/italic, text colour, connector line style and thickness;
  apply to a whole branch; format painter and copy/paste format.
- Format panel (F4) with Layout, Theme and Style tabs. Layouts and themes are also in the command palette.
- Error boundary so a UI bug can't blank the editor; guard test against unstable store selectors.
- Fixed: the format panel's theme editor crashed the page (unstable store selector).

### Images in topics and instant autosave
- Images in topics: paste (Ctrl+V), drag-and-drop, file picker, context menu. Shown above the topic text; the topic and
  layout grow to fit. Corner handles resize (aspect locked, Shift = free), Shift+arrows resize by keyboard, double-click resets.
- Images are downscaled to 1600 px, stored as WebP in IndexedDB (not in the map JSON). Orphaned blobs are cleaned up
  once undo can no longer restore them.
- Autosave: debounced 400 ms, serialised writes, retry with backoff, flush on blur / tab hidden / page hide, leave warning
  only when unsaved. One save indicator in the header (Saving... / Saved at HH:MM / Not saved - retry).
- Map name in the header. Right-click context menu for topics. Friendly messages for rejected files.
- Fixed: Enter and Space on a focused button no longer trigger editor shortcuts.

### Phase 1: core canvas editor
- Yjs-backed document, 100-step undo/redo, guest autosave to localStorage ("Saved" indicator).
- Topics: add child (Tab), sibling (Enter), delete, rename (F2 / double-click), floating topics.
- Drag to re-parent or reorder (drop on a topic, or on its top/bottom edge); Alt+Up/Down reorder.
- Multi-select (Shift/Ctrl-click, box select, Ctrl+A), copy / cut / paste (also from indented text), duplicate.
- Collapse / expand with hidden-count badge; show levels 1/2/3/all; focus mode.
- Infinite canvas: wheel zoom, pan (hand tool, Space, middle mouse, touch), pinch, fit, minimap, fullscreen.
- Arrow-key navigation, command palette (Ctrl+K), shortcut sheet (?), search with reveal (Ctrl+F).
- Balanced mind-map layout engine with viewport culling (2,000+ topics).

### Phase 0
- Vite + React + TypeScript (strict), Tailwind, Zustand, Vitest, ESLint, CI workflow.
- Design tokens with light/dark theming and an empty app shell.
- Supabase schema and row-level security policies.
