# Importing MindMaster / EdrawMind (.emmx) files

Open an `.emmx` from **Import** (Home, All files, or the New file dialog) and you get ordinary, editable Wishtaa maps.
Import only: there is no `.emmx` export.

## What comes across

| In the .emmx | In Wishtaa Maps |
|---|---|
| Central topic, main topics, subtopics (the tree from each topic's `SubLevel` list, in order) | The same tree |
| Topic text (several paragraphs become several lines) | Topic text |
| Pictures inside topics | The topic's picture, at the size it was shown (kept within 40 to 1200 px) |
| Which side a main topic was on (its position compared with the central topic) | The topic's side in the balanced mind map |
| Fill colour, outline colour, branch colour, font size, a chosen text colour | The topic's fill, border, connector colour, font size and text colour |
| Each page (`page/*.xml`) | A separate map named after the page (the file name for a single page) |

MindMaster themes, shapes and geometry are not reproduced: the Wishtaa theme is used, but the original colours win.

Colours are `#AARRGGBB` (alpha first). Fully transparent values are ignored. A text colour that is only the theme's
default is not imported (so it can't make text unreadable in dark mode).

### Pictures

- The original bytes are kept for PNG, JPEG, GIF and WebP (nothing is re-encoded or blurred). The type is detected from
  the first bytes, never from the file name.
- Only a picture whose longest side is over **4000 px** is reduced (to 4000 px).
- Identical pictures are stored once. SVG is refused (it can contain scripts), as is anything over 10 MB, damaged
  pictures, and pictures with an absurd number of pixels.
- Pictures go into the normal image store, not into the map data.

### Placeholder text

The default texts "Main Topic", "Subtopic", "Central Topic" and "Floating Topic" are treated as empty **only when the
topic has a picture** (so a screenshot topic isn't labelled "Main Topic"). Topics with real text keep it. This is an
import option (`clearPlaceholderText`, on by default).

## What is skipped (and how you find out)

Nothing here stops the import. Anything not understood is skipped, counted, and listed in the report that appears after
the import ("2 floating topics skipped"), and the names are written to the browser console (`[emmx import] not supported
yet`) so more sample files can be sent and support added: notes, hyperlinks, icons and markers, tags, floating topics,
callouts, boundaries, summaries, relationship lines, attachments, comments, formulas.

A shape of an unknown type that sits inside the topic tree is imported as a normal topic (its text and subtopics).

## Safety (the file is untrusted)

- Files over 50 MB are refused without being read.
- The ZIP is checked before anything is unpacked: at most 2,000 entries and 200 MB when unpacked (a zip bomb is refused).
- Only `document.xml`, `page/*.xml`, `rels/*.xml` and `media/<file>` are ever read. Entry names are only used as lookup
  keys, never as file paths.
- A picture location that climbs out of the archive (`..`), is absolute, uses backslashes, has a scheme, or is not in
  `media/` is refused.
- XML is read by a small strict parser: any `DOCTYPE` or `ENTITY` declaration is refused, only the five built-in entities
  and numeric references are decoded, and size, depth and element count are limited. No DOM, no external resources.

## Where the code is

- `src/core/import/emmx/` — `parse.ts` (`parseEmmx`), `zip.ts`, `xml.ts`, `images.ts`, `color.ts`, `build.ts`. Pure, no UI.
- `src/app/importEmmx.ts` — stores the pictures, creates the files. `src/app/importFlow.tsx` — the picker and the report.
- A main topic can carry `side: 'left' | 'right'`; the balanced mind map keeps those and balances the others around them.
  A topic style can carry `lineColor` (the connector colour).
- Tests: `emmx.test.ts` uses `tests/fixtures/IND_AS_2.emmx` and small synthetic files.

## Where the imported maps are saved ("Save to")

Import asks the same question as New file: **Save to** This browser or Google Drive (with the connected account),
with the same remembered choice, the same Drive folder choice (default: the "Wishtaa Maps" folder; "Choose another
folder" opens Google Picker) and "Connect Google Drive" when Drive is not connected. "Don't ask again" (and its reset in
Storage settings) applies here too.

The question is skipped when the place is obvious, exactly as for New file:

| Where you start the import | What happens |
|---|---|
| Inside a local folder in All files | Imported into that folder, in this browser |
| Google Drive page ("Import .emmx") | Imported into the Drive folder being viewed |
| Home, the top of All files, the New file dialog | Asks "Save to" (the New file dialog uses the choice made there) |

In Drive, each map is first kept in this browser (so it can never be lost) and then created in Drive as a `.wishtaa` file
with its pictures inside, the same way pasted pictures travel. The first autosave therefore updates that Drive file
instead of making a duplicate.

If Drive fails (offline, sign-in expired, Drive full) a message explains why and offers **Retry** (only the maps that
failed are retried; a Drive folder that no longer exists falls back to the Wishtaa Maps folder) or **Import to this
browser instead**. The imported maps stay in All files either way, even if the message is closed.

In code: `importToPlacement` and `retryDriveUpload` in `src/app/importEmmx.ts`; `ImportDialog` in `src/app/importFlow.tsx`.
