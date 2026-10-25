# Changelog

## Unreleased

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
