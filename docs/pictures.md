# Adding pictures

**Add picture** (from the picture toolbar, the Insert menu, a topic's More menu, its right-click menu, or the command palette; hidden in Read mode)
is one menu: a bottom sheet on a touch screen, a popover on a desktop.

| Source | What it does |
| --- | --- |
| Upload file / Upload and crop | choose files (several at once); the second one opens the crop step |
| Take photo | opens the camera app (`<input capture>`); shown on touch devices and where a camera can be reached |
| Choose from Photos / gallery | choose from the device (this is how a screenshot taken with the device buttons is added on a tablet) |
| Paste image from clipboard | a button using `navigator.clipboard.read`; friendly messages if refused or empty. Ctrl/Cmd+V on a selected topic still works |
| Capture screen (Ctrl+Shift+S) | `getDisplayMedia`, video only. The browser's own picker asks what to share. ONE frame is drawn at the real size, then every track is stopped. Hidden/disabled where the browser cannot do it (found by feature detection, never by user agent) |
| Drag and drop | an image file, or a picture from another app (Split View), onto a topic |
| Insert from my pictures | pictures already in this map and recent ones: a new reference to the same picture, nothing new stored |

A single picture from the camera, photos, the clipboard or a screen capture opens the **crop step**: a draggable, resizable rectangle (44 px
hit targets), pinch to zoom and two fingers to pan, rotate 90 degrees, Full image, Retake, Cancel, Use selection, the size in pixels and a live
size estimate. Arrow keys nudge (Shift = 10 px, Alt resizes), Enter confirms, Esc cancels. "Crop again" works until the tab is closed.

## Readable, not high resolution
Two choices: **Compressed (readable)**: longest side up to 1280 px, never enlarged, WebP (JPEG where the browser cannot encode WebP, PNG
when that is smaller for flat-colour screenshots) at about 0.8 and never under 0.78; text is never shrunk below 900 px on its longer side
unless it started smaller. **Original**: as it is after cropping, within the hard limits of 10 MB and 4000 px (explained, never hidden).
"More options" adds High (2400 px, about 0.92). EXIF and location data are removed and orientation is fixed.

The question is asked only when compressing would save at least a quarter AND at least 30 KB; otherwise the picture is kept as it is,
silently. Preferences > Pictures: Ask each time (default) / Always compress / Always keep original. The same choice applies once to all pictures
of an imported .emmx.

## Storage ids
A stored picture's id comes from its content (SHA-256, first 40 hex digits, `p-…`), so the same picture is always one picture. `crypto.subtle`
is used where it exists (https and localhost), with a plain-JavaScript fallback for plain-http development.

## Touch
Touch-friendly controls follow the device (`(pointer: coarse)` and `(hover: none)`), not the window width, so a tablet or phone asking for the
"Desktop site" still gets 44 px targets and bottom sheets. Preferences > Touch-friendly controls: Auto (default) / Always on / Off.
