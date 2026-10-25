# Changelog

## Unreleased

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
