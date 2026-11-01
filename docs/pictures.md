# Adding pictures

**Add picture** (from the picture toolbar, the Insert menu, a topic's More menu, its right-click menu, or the command palette; hidden in Read mode)
is one menu: a bottom sheet on a touch screen, a popover on a desktop.

| Source | What it does |
| --- | --- |
| Upload file / Upload and crop | choose files (several at once); the second one opens the crop step |
| Take photo | opens the camera app (`<input capture>`); shown on touch devices and where a camera can be reached |
| Choose from Photos / gallery | choose from the device (this is how a screenshot taken with the device buttons is added on a tablet) |
| Paste image from clipboard | a button using `navigator.clipboard.read`; friendly messages if refused or empty. Ctrl/Cmd+V on a selected topic still works |
| Capture screen (Alt+Shift+Q) | `getDisplayMedia`, video only. The browser's own picker asks what to share. ONE frame is drawn at the real size, then every track is stopped. Hidden/disabled where the browser cannot do it (found by feature detection, never by user agent) |
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

## Pictures paused
The line next to "Saved" says how many pictures are waiting to go up to Google Drive, **in all your maps**. The map itself is always saved first; pictures follow in the background and never hold up editing. If they stop, the line says why and has a button:

| Why | What it says | Button | Carries on by itself? |
|---|---|---|---|
| The Google sign-in expired (it is kept only in memory, so every reload needs it again) | sign in to Google Drive to continue | **Sign in** | **Yes**, as soon as a new sign-in arrives |
| Access to a file or folder was removed in Drive | Google Drive no longer allows access | **Sign in** | No: Resume after fixing it in Drive |
| Google Drive is full | Google Drive is full | **Resume** | No: free some space first |
| You paused them (Preferences, Storage and picture uploads) | paused by you | **Resume** | No |
| Data saver is on and "pause on data saver" is chosen | paused because data saver is on | **Sync now** | No |

"Only when I tap Sync" is not a pause: the pictures wait, and **Sync now** sends them. A connection that drops only delays them (they retry with growing waits); that never counts as a pause. **Resume** also makes the ones that failed try again at once instead of waiting.

## Selecting a topic and selecting its picture

A topic with a picture has two things that can be selected, and a click chooses between them on purpose:

| Do this | What is selected |
|---|---|
| Single click or tap anywhere on the topic (its picture or its text) | **Only the topic.** The topic toolbar and Style tab show; the picture has no frame or handles. This holds for the central topic, topics and sub-topics. |
| Double click or double tap **on the picture** | **The picture**: picture toolbar, Picture tab, selection frame and resize handles. |
| Double click or double tap on the **text** | Edits the text (as before). |
| Click or tap empty canvas | Nothing is selected. |
| **Esc** | From the picture back to its topic; Esc again clears the selection. |
| **I** (keyboard) | Selects the picture of the selected topic (Esc goes back). |

A picture can be resized only once it is selected, so panning on a tablet with a finger on a picture never resizes it. Dragging a topic
by its picture while only the topic is selected moves the **topic**. A click on a picture that is already selected keeps it selected;
a click on the text goes back to the topic alone.

The Outline works the same way: a single click on a row's picture selects the row; a double click selects the picture, which then shows
**View the picture larger** (rotate and mark up in the viewer), Replace and Delete.

**Read mode:** a single tap selects the topic; a double tap on a picture opens it full screen; nothing can be edited (a double tap on
text does not edit).

Double clicks are told from single ones by time (350 ms between presses on the same topic), which also covers touch screens where
the browser does not send a double-click event. Tested (fake timers and a real browser at desktop and tablet size): `src/editor/pictureSelection.test.tsx`.
