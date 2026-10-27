# Changelog

## Unreleased

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
