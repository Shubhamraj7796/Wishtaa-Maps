# Picture viewer: rotate, flip and markup

Open a picture full screen: double-click or double-tap it and choose **View the picture larger** (in Edit mode), or double-click or
double-tap it in Read mode. See `docs/pictures.md` for how a picture is selected.

## Viewing

- **Zoom:** mouse wheel (around the pointer), pinch, the − and + buttons, or the keys + − 0. **Double-click or double-tap** zooms in on
  that spot, and again zooms back out.
- **Pan:** drag with the mouse or one finger; two fingers pinch and pan together.
- **Previous and next picture:** the buttons or the Left and Right keys. **Esc** closes it (first it stops a marking tool, closes a
  flyout or a dialog).
- Touch scrolling is never blocked: with no marking tool chosen a finger always pans. With a tool chosen, a **mouse or stylus draws**
  and a **finger pans and zooms**; the **Finger draws** checkbox lets a finger draw too, for a tablet with no stylus.

## Rotate and flip (Edit mode)

**Rotate left**, **Rotate right** and **Flip left to right** in the picture actions bar. These are **properties of the picture
reference in the topic** (`rotation`, `flipX`, `flipY`), so **nothing is uploaded again** and no new picture is stored: only the small
map file changes, as one undo step per action. A turn swaps the topic's shown width and height (`image.width` and `image.height` are
always the size as shown), so the layout engine needs to know nothing about turns. The picture is drawn turned clockwise, then mirrored
on screen; a mirrored picture turns the way it looks (clockwise on screen). It is shown turned **on the map, in the Outline, in the
viewer** and in anything made from them. A picture nobody has touched is drawn exactly as before (a plain `<img>`), so pictures at scale
cost the same as before.

## Markup (Edit mode)

The **same floating vertical toolbar as a PDF** (`src/editor/markup/MarkupToolbar.tsx`): Select, Highlight, Underline, Strikethrough,
Pen, Text box, Shapes, Whiteout, Eraser, Link, then Undo and Redo. Each tool shows its own colour and keeps its own colour and size
(the same memory as on a PDF: Pen can stay red while Highlight stays yellow). With no text to select, Highlight, Underline and
Strikethrough are drawn as a rectangle. The toolbar is hidden in Read mode.

Marks are stored **on the picture reference** as `image.marks` (a small JSON object per mark), with positions as fractions of the **stored
picture**, so they are **attached to what they mark**: turn or flip the picture and the marks turn and flip with it, and they scale
with its size. They are drawn over the picture **on the map, in the Outline and in the viewer** (on the map and Outline only when the
picture is at least 90 px across, so a speck is not covered in lines).

- **Show markup** (a checkbox; in Edit mode it is remembered, `image.markHidden`) hides the marks without deleting them.
- **Remove markup** deletes them all (one undo step). Select a mark with the Select tool for **Delete mark**.
- A picture holds up to 2,000 marks. 500 strokes of twelve points are about 150 KB of map JSON.

## Making it permanent

**Make permanent…** (shown when the picture has a turn, a flip or marks) stores a **new picture** with the change built in:

- **Turn and flip the picture itself**, and/or **Draw the markup into the picture (flatten)**;
- **Compressed** or **Original** quality (the same choice and limits as adding a picture);
- when other topics show the same picture **the same way**: **This topic only** or **All N topics showing it the same way**.

The new picture's id comes from its bytes, so it is stored once and **uploaded once**, and one undo step puts everything back. The
original picture is not changed, and is dropped later only when nothing uses it. Topics that show the picture differently are left alone.

## Syncing

A turn and marks are fields of the topic, so they travel in the map file and are included in **version history and the three-way merge**
(`docs/drive-sync-merge.md`): one device can turn a picture while another marks it, both devices can add marks, and the same mark
changed on both is merged field by field (the newer wins, the other is recoverable). Editing them uploads **only the map JSON**; a test
checks that no picture is sent and that one map write goes up.

## Measured

Chromium 148, headless, development build, a map of 500 pictures (one shared picture, so no network): panning and zooming the view for 5
seconds at two zoom levels, first with plain pictures, then after turning all 500, mirroring a third and marking 100 of them.

| | Plain | Turned and marked |
|---|---|---|
| Zoomed out (about 30 pictures drawn) | 10 fps | 10 fps |
| Zoomed in (about 12 pictures drawn) | 20 fps | 21 fps |
| Memory (JS heap) | 51 to 126 MB | 33 to 95 MB (no growth from turns or marks) |
| Applying the turns and marks to all 500 | | 47 ms, one transaction |

The frame rates are low for both because this is a development build drawing in software; the point is that turns and marks cost
nothing measurable. Only pictures near the view are drawn at all.

## Not tested on real devices

Pinch, two-finger pan, stylus drawing, palm rejection and double-tap on a real tablet or phone were tested with scripted pointer events
and in a desktop browser, not on a device.
