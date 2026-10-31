# Keyboard shortcuts

The same list is in the app: press **?** (or search "shortcuts" in the command palette, Ctrl+K). On a Mac, Ctrl means Cmd, and Alt means Option.

## Rules

- **The browser keeps its own keys.** The app never handles, and never calls `preventDefault` on: Ctrl/Cmd+R, Ctrl/Cmd+Shift+R (hard refresh,
  needed to pick up a new version), F5, Ctrl+F5, Ctrl/Cmd+T, W, N, Shift+N, L, Q, tab switching (Ctrl+Tab, Ctrl+PageUp/PageDown, Ctrl+1 to 9, and Alt+1
  to 9, which switch tabs on Linux), the developer tools (F12, Ctrl+Shift+I, J, C), Ctrl+Shift+Delete, Alt+Left / Right (back and forward), the browser
  menus (Alt+F, E, D) and Chrome's Alt+Shift+T, B, I, A. This list is in `src/editor/registry.ts` (`isReservedChord`) and a test fails if any shortcut uses one.
- **No Ctrl+Alt combinations.** On many keyboard layouts AltGr is Ctrl+Alt, so those keys type letters (for example @ or the euro sign).
- **On a Mac, Option+letter types a symbol,** so Alt shortcuts follow the physical key: Option+R is Alt+R.
- **Shortcuts wait** while you type in a text box, while a topic is being edited, and while a dialog is open (Escape still closes things).
- **Read mode** (Alt+R) was Ctrl+Shift+R, which is the browser's hard refresh. It is now **Alt+R** (Option+R on a Mac).
- **Customising** shortcuts is not offered yet.

## Kept on purpose

Ctrl+F (search topics and notes), Ctrl+K (command palette), and Ctrl+0 / Ctrl+= / Ctrl+- (zoom the map) replace the browser's find, search bar and page
zoom only while the map has focus. They are not on the browser's protected list, and a page can override them. Click outside the map (or use the browser's
menu) for the browser's own versions.

## Moved to avoid the browser

| Was | Now | What it does |
|---|---|---|
| Ctrl+Shift+R | Alt+R | Read / Edit mode |
| Ctrl+Shift+S | Alt+Shift+Q | Capture screen (Firefox uses Ctrl+Shift+S for its screenshot tool) |
| Ctrl+Alt+... (all) | Alt+Shift+... | Insert items, copy / paste format, outline view (AltGr) |
| Ctrl+D | Alt+Shift+D | Duplicate (Ctrl+D bookmarks the page) |
| Ctrl+G | Alt+Shift+G | Tags (Ctrl+G is find next) |
| Ctrl+1 | Alt+Z | Zoom to 100% (Ctrl+1 switches to the first tab) |
| Alt+1, 2, 3, 0 | Alt+Shift+1, 2, 3, 0 | Show levels (Alt+1 to 8 switch tabs on Linux) |

## The list

### Edit

| Shortcut | What it does |
|---|---|
| Tab | Add child topic |
| Enter | Add sibling topic |
| F2 | Rename topic |
| Delete or Backspace | Delete topic (or the selected image) |
| / | Collapse / expand branch |
| Alt+ArrowUp | Move topic up |
| Alt+ArrowDown | Move topic down |
| Ctrl+Z | Undo |
| Ctrl+Y or Ctrl+Shift+Z | Redo |
| Ctrl+C | Copy |
| Ctrl+X | Cut |
| Ctrl+V | Paste |
| Ctrl+V | Paste an image into the selected topic |
| I | Select topic image (to resize) |
| Shift+ArrowRight or Shift+ArrowUp | Enlarge the selected image |
| Shift+ArrowLeft or Shift+ArrowDown | Shrink the selected image |
| Alt+Shift+D | Duplicate |
| Ctrl+A | Select all |

### Insert

| Shortcut | What it does |
|---|---|
| Alt+Shift+P | Add picture to topic… |
| Alt+Shift+Q | Capture screen as a picture |
| Alt+Shift+R | Relationship line |
| Alt+Shift+O | Callout |
| Alt+Shift+Y | Boundary |
| Alt+Shift+S | Summary |
| F9 | Marks (priority, progress, emoji, flags…) |
| Alt+Shift+U | Clipart |
| Alt+Shift+E | Notes (rich text) |
| Alt+Shift+N | Short note |
| Alt+Shift+G | Tags |
| Alt+Shift+K | Task |
| Alt+Shift+L | Hyperlink |
| Alt+Shift+H | Attachment |
| Alt+Shift+X | Formula (LaTeX) |
| Alt+Shift+J | Table |

### Navigate

| Shortcut | What it does |
|---|---|
| ArrowLeft | Select left |
| ArrowRight | Select right |
| ArrowUp | Select up |
| ArrowDown | Select down |
| Ctrl+F | Search topics and notes |
| Ctrl+K | Command palette |
| ? | Keyboard shortcuts |
| Escape | Close / deselect |

### View

| Shortcut | What it does |
|---|---|
| Ctrl+0 | Fit to screen |
| Alt+Z | Zoom to 100% |
| Ctrl+= or Ctrl++ | Zoom in |
| Ctrl+- | Zoom out |
| Ctrl+Shift+F | Focus on branch (toggle) |
| Alt+Shift+1 | Show level 1 |
| Alt+Shift+2 | Show levels 1–2 |
| Alt+Shift+3 | Show levels 1–3 |
| Alt+Shift+0 | Show all levels |
| Alt+Shift+M | Outline view |
| Alt+R | Read mode (view only) on / off |

### Format

| Shortcut | What it does |
|---|---|
| Alt+Shift+ArrowRight | Make topic wider |
| Alt+Shift+ArrowLeft | Make topic narrower |
| F4 | Show / hide the format panel |
| Alt+Shift+C | Copy topic format |
| Alt+Shift+V | Paste topic format |

### Tools

| Shortcut | What it does |
|---|---|
| H | Hand tool (drag to pan) |
| V | Select tool (drag to box-select) |
