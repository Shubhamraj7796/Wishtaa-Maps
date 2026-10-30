# Themes, colour schemes and topic styling

How a map looks is decided by three separate things, plus per-topic tweaks:

1. a **theme** (`themeId`): the look of the canvas and of each level of topics and branches;
2. a **colour scheme** (`colorSchemeId`): an ordered palette for branches. Changing it recolours, and never changes shapes;
3. **map overrides**: map-wide tweaks (custom palette, background, hand-drawn, branch thickness, taper);
4. **topic overrides** (`topic.style`): anything a single topic sets for itself.

The light/dark mode of the app is separate from all of this: a dark map theme works in a light app and the other way round.

## Resolution order (strongest first)

1. the topic's own override (`TopicStyle`; `undefined` and `null` both mean "inherit")
2. the map's override (`MapSettings`: `palette`, `colorSchemeId`, `background`, `handDrawn`, `branchThickness`, `taper`)
3. the theme's level (`levels.central | main | sub | deeper`)
4. built-in defaults

Branch colour specifically: topic `lineColor` > the map's custom `palette` > the chosen colour scheme > the theme's own
palette. Main branches take colours in order (wrapping), sub-branches keep their parent branch's colour.

Branch thickness: topic `lineWidth` > the map's `branchThickness` (px at the main branches; other levels keep their
proportion) > the theme level's `branch.thickness`. Taper: topic `taper` > map `taper` > theme level `branch.taper`.

## Theme data (format version 2)

Themes are plain JSON: `src/core/theme/themes.json` holds the built-in ones, so adding a theme needs no code. Every theme,
built in or from a file, is checked by `sanitizeTheme` before use.

```jsonc
{
  "version": 2, "id": "orbit", "name": "Orbit", "dark": false,
  "bg": "#f8fafc", "pattern": "dots", "text": "#1f2937", "font": "Inter, system-ui, sans-serif", "handDrawn": false,
  "palette": ["#2563eb", "#0891b2", ...],                // the theme's own colour scheme
  "levels": {                                            // central, main, sub, deeper
    "central": {
      "shape": "doubleCircle", "cornerRadius": null,
      "fill": "solid",                                   // solid | tint | outline | plain
      "fillColor": "#1e3a8a",                            // central only; other levels use their branch colour
      "borderWidth": 2, "fontFamily": null, "fontSize": 17, "fontWeight": 600,
      "textColor": "#ffffff",                            // null = chosen automatically so text is readable
      "branch": { "curve": "auto", "thickness": 6, "taper": true, "falloff": 0.6, "dash": "solid" }
    },
    "main": { ... }, "sub": { ... }, "deeper": { ... }
  }
}
```

`branch.curve` is `auto | curve | straight | elbow | roundedElbow | none` (`auto` follows the layout; the map's own
connector choice, when it is not "auto", beats the theme). For `deeper`, `falloff` is how much thinner each further level is.

### Per-topic overrides

`topic.style` is a small optional object (`undefined`/`null` = inherit). Today: `shape`, `fill`, `border`, `borderWidth`,
`textColor`, `fontFamily`, `fontSize`, `fontWeight`, `italic`, `lineColor` (branch colour), `lineWidth`, `lineStyle`, `taper`,
`branchCurve`. "Reset to theme" clears the object on the selection (undoable). Planned for the next phases, stored in the
same object: corner radius, border dash, shadow, custom width, double-circle ring settings, branch arrowheads.

### Older maps

Maps saved before this format keep working with no conversion step on disk: a version 1 theme (three levels and one line
width) is converted on read by `migrateV1Theme` so that it draws exactly as before. This is proved by
`src/core/theme/golden.test.ts`, which replays a recording of how all 26 earlier themes resolved (`golden-v1.json`). A map
with none of the new settings opens with the theme's own colours, thickness and taper.

## Applying and previewing

- `applyTheme` is one undo step. It clears the map-wide tweaks (palette, scheme, background, hand-drawn, thickness, taper)
  and keeps each topic's own overrides, unless "reset overrides" is chosen (still one step).
- A theme that is not built in is stored **inside the map file**, so a map keeps its own theme wherever it goes (Drive,
  sharing, export).
- Hovering or focusing a gallery item previews it on the canvas through `themePreview` in the editor store only: nothing is
  saved and there is no undo step. The thickness slider previews live while dragging and saves one step on release.

## Custom themes

"Save this map's look as a theme" (`themeFromMap`) bakes the map's colour scheme, background, hand-drawn, thickness and
taper into a new theme. The user's themes live behind `ThemeRepository` (`list/save/remove/subscribe`); `LocalThemeRepository`
(browser storage) is the only implementation today, and Drive or cloud storage can replace it without the panel changing.
Themes export and import as JSON (`wishtaa-theme`); an imported theme always gets a new id.

## Colour schemes

`src/core/theme/schemes.ts`: 15 ordered palettes (rainbow, warm, cool, sunset, ocean, pastel, candy, earthy, five one-colour
families, two colour-blind-safe sets). Text on a filled topic is always chosen to reach 4.5:1 contrast, for every theme and
scheme (tested).

## Drawing

Branches are SVG paths. A tapered branch is a filled outline built from points sampled along the branch path
(`taper.ts`), thick at the parent end and thinner toward the topic. The double circle is an outer ring, a gap and an inner
disc (CSS in the editor, SVG in previews); its box is square and sized so the text sits inside the inner circle.
Theme previews are SVG drawn from the theme's own data and rendered only when they scroll into view.

## Not built yet

PNG, PDF and SVG export does not exist in the app yet, so there is nothing to keep in step; when it is added it must read
the same resolved look (`resolveLook`, `resolveLine`, `taper.ts`).
