# Themes and styling

## Themes (`src/core/theme`)
- 26 built-in themes (light, dark and hand-drawn). A theme gives: canvas background and pattern, text colour, branch
  palette, central-topic colour and shape, how main topics (level 1) and sub topics (level 2+) are drawn
  (`solid`, `tint`, `outline`, `plain`) and in which shape, line thickness, font, and a hand-drawn flag.
- Text colour on filled topics is chosen with `readableText`, which always reaches 4.5:1 contrast. A test checks every
  theme, every palette colour and every level.
- **Rainbow** gives each top-level branch its own palette colour; off uses a single accent.
- **Custom palette, background colour/pattern and hand-drawn** are map-level overrides applied on top of any theme.
- **Theme editor**: edit a copy of any theme and save it as a custom theme (stored with the map, up to 20).
  Custom themes coming from saved data are validated (hex colours, known shapes, safe font strings).

## Per-topic style (`TopicStyle`)
Shape, fill, border colour and width, text colour, font family, size, bold, italic, and the line to the parent
(solid/dashed/dotted, thickness). Anything unset follows the theme. A custom fill picks readable text automatically.
"Apply to the whole branch" restyles descendants too. **Format painter** copies a topic's style and paints others
(Shift keeps painting); Alt+Shift+C / Alt+Shift+V copy and paste a format.

## Map settings (`src/core/settings.ts`)
Stored in the document's `settings` map, so they save, sync and undo like topics: layout, line style, spacing, overlap,
align siblings, free positioning, theme, rainbow, hand-drawn, background, palette, custom themes. Everything read back
is validated and falls back to defaults.

## Hand-drawn look
Irregular borders on topics, an SVG turbulence displacement on connectors, and a handwriting font stack.
