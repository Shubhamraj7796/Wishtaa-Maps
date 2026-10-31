# Changelog

## Unreleased

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
