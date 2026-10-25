# Topic images and autosave

## Images
- A topic stores only `image: { imageId, width, height }` (display size). No image data is in the map.
- On add (paste, drag-and-drop, file picker): validate (image type, not SVG, at most 10 MB) → downscale to 1600 px on the
  longest side → encode as WebP (quality 0.85; JPEG for JPEG sources or PNG otherwise if WebP is unavailable) → store
  the blob in IndexedDB → set the topic's image reference (one undo step).
- `src/core/images/store.ts`: `ImageStore` interface with `IndexedDbImageStore` and `MemoryImageStore`. Replace the
  instance in `src/editor/images.ts` to move blobs to Supabase Storage later.
- Resize: pure math in `src/core/images/resize.ts` (min 40 px, max 1200 px wide, aspect locked unless Shift).
  The drag shows a live frame and writes the document once on release, so a resize is one undo step.
- Clean-up (`src/core/images/gc.ts`): an unused blob is deleted only after more than 100 further undo steps (so undo
  can still restore it). At start-up, every blob not referenced by the loaded map is removed.

## Autosave
- `src/core/autosave.ts`: `Autosaver` (debounce 400 ms, serialised writes, latest state wins, retry with backoff
  1 s / 2 s / 5 s / 10 s / 30 s, flush on blur, tab hidden and page hide).
- Status: `saving` as soon as a change is made, `saved` only after the write succeeds, `error` keeps the changes and retries.
- `MapStorage` is the persistence interface (`LocalMapStorage` today). A Supabase implementation can replace it.
- Image blobs are written before the map that references them (`beforeSave`).
- Closing the tab: the autosaver writes synchronously; the browser's leave warning shows only if something could not be saved.
