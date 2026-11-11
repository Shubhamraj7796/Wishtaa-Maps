# Wishtaa Maps: project state

Last updated: 2026-11-11, after icons first steps 1 to 4 (on top of `bbcf084`; see the lists below, which are newer than this line). Built from the code, `git log` and `docs/`. Anything not checked is
marked **unverified**. Rules for working on this project: `CLAUDE.md`.

## The app in two lines
A web mind-mapping app (no topic cap, no export watermark) that works as a guest with maps saved in the browser, or with maps saved in the
person's own Google Drive. Optional accounts (emailed code, password, Google) add sync of small records and Drive linking.

## Stack and where it runs
- **Code:** React 18, TypeScript (strict), Vite 5, Tailwind, Zustand, Yjs (map model), pdf.js and pdf-lib (PDFs), `@supabase/supabase-js`.
  Tests: Vitest (jsdom), Playwright (real Chromium, `e2e/`). GitHub: `Shubhamraj7796/Wishtaa-Maps`, branch `main`.
- **Vercel:** every push to `main` deploys https://maps.wishtaa.com (static site; no serverless functions yet: `api/` is empty).
  `vercel.json` sets caching and the page rewrite (never for `/assets/`, `/pdfjs/`, `/api/`).
- **Supabase:** sign-in (Auth) and a small account database. Migration `supabase/migrations/0003_accounts.sql` (profiles, user_preferences,
  recent_files, drive_links, owner-only RLS). `0001`/`0002` are an old unused plan for maps in Supabase: do not run. The project address
  stopped resolving on 2026-11-08 and resolved again by 2026-11-09 (public check only). **Unverified:** whether `0003` has been run
  (a read-only check on 2026-11-09 said the `profiles` table did not exist yet).
- **Google Cloud:** one OAuth client (web) used for Google Drive (token flow, scope `drive.file` only), the Google Picker (needs the API key)
  and, through Supabase, Google sign-in. **Unverified:** consent screen publishing status, authorised redirect URIs.
- **Domain/DNS:** `maps.wishtaa.com` points at Vercel; the owner says DNS is at Hostinger (**unverified**, not checked from here).
- **Cloudflare Turnstile** (CAPTCHA for sign-up and code requests): **unverified**, not known to be set up.

## Built and verified (automated tests and/or a real desktop browser; most also on the live site)
- **Editor:** topics, many layouts and themes, shapes, floating topics, relationships, boundaries, summaries, callouts, notes, tags, tasks,
  tables, LaTeX, search, Outline view (drag to reorder, zoom), keyboard shortcuts, branch thickness and direction, low-zoom level of detail, minimap.
- **Files:** home, folders, trash, star, search, `.emmx` (MindMaster/EdrawMind) import including newer formats, export, Read mode (view-only lock,
  per-file default).
- **Pictures at scale:** add, crop, compress (Compressed/Original), content-hash ids, upload once to Drive as separate files, lazy loading with
  thumbnails and a memory budget, 500-picture benchmark, picture viewer (rotate, flip, markup, make permanent), single-click vs
  double-click selection.
- **Google Drive:** save/open `.wishtaa`, Open-from-Drive picker, cross-device sync (always checks Drive on open, three-way merge by topic,
  never overwrites newer content), offline queue, conflict handling kept out of normal editing, quiet token renewal, same-account check.
- **PDF panel:** viewer (virtualised pages), text to topics, "p. N" source badges, capture area, markup (highlight, underline, strike, pen,
  text, shapes, whiteout, links), page rotate/hide, export with markup, Normal/Wide/Full size with draggable divider, floating toolbar,
  Insert-menu PDF and its own Drive picker, password prompt, **tabs and split view** (part 1).
- **Capture area (Group A):** every capture is a new topic with a source link; pinned target with Change; Add as Sub-topic / Next sibling / New
  branch; Keep capturing; confirmation with Undo; tidy width; Compressed/Original asked once per session; optional titles (name from the page, text inside the rectangle) (unit tests, real-browser tests at three sizes, a synthetic-touch capture test).
- **View menu, Part 2 Group A (live):** Single or Two-page view, Show cover page, Enable scrolling off (paged), Right-to-left, Fit width / Fit page / Actual size / percentages; per PDF and per device; in the panel header and in each Split pane; page buttons step by spread; "p. N" opens the spread; capture and text layers on both pages (unit tests, 19 component tests, real-browser tests at desktop and tablet size with synthetic touch, memory counts).
- **Google picker failure notice:** when the picker is blocked, cannot start or does not open within 15 s, one notice (copy link, try again, choose from device, copy details) instead of a hang; cancel never shows it (unit and component tests with mocked pickers).
- **App shell:** installable PWA, offline start, Android share target for pictures, update bar, deploy-skew recovery (a stale tab recovers
  once), production smoke test.
- **Accounts (logic and UI against mocks and a real Postgres engine):** login dialog, code/password/Google, reset, account page, sign-out and
  user-switch clearing, preferences and recent-files sync with an offline queue, Drive auto-connect at Google sign-in with account check,
  friendly Google errors, `/privacy` and `/terms` (draft text, live and indexable).

## Built, but not verified on real devices or real accounts
- **Anything on a physical phone or tablet** (touch drawing, pinch, swipe, tab dragging, floating toolbars, bottom sheet, install, share target).
- **Real Google and real Supabase flows:** sign-in by code/password/Google, email delivery, the migration, rate limits, CAPTCHA, Google
  consent screen behaviour (blocked/not a test user), the Drive token handed over at sign-in, silent renewal over hours.
- **Two real accounts on one browser** (sign-out / user-switch clean-up has only been tested with mocks).
- Safari and Firefox (only Chromium was used for real-browser tests).
- **Capture on a real tablet or phone** (finger drawing of the rectangle, the capture bar at touch size, "Change" in the Outline); only mouse-driven browser tests were run.
- **The picker notice in a real Brave or a browser with third-party cookies blocked** (only mocked pickers were tried), and that Google's "loaded" event arrives in real use as assumed.

## Standing design rules (from the owner; also in `CLAUDE.md`, rules 7 and 8)
- **Clean reading UI (rule 7):** content first, one thin primary bar, floating or on-demand tools, progressive disclosure, no permanent notice rows; measure the content area before and after a large layout change.
- **ICONS FIRST: wherever possible use a clear icon/symbol instead of a text label. The full name shows as a tooltip on hover (and on long-press on touch devices, and on keyboard focus). Every icon-only control has an accessible name (aria-label). Keep a short text label only where an icon cannot be understood on its own. The selected option is shown by a highlighted background, not by an added tick plus words. Use one consistent icon set, one consistent size, and one tooltip component for the whole app.** Status: **steps 1 to 4 done** (shared Tooltip and controls, 14 custom icons, PDF View menu, PDF top bar, capture bar, selected-markup and lasso bars, pen bar tooltips; committed locally, live after "go live"). **Steps 5 to 7 wait for the owner's "go":** map toolbar and header captions and native titles (5), Insert menu grid, quick toolbar, Files and menu leading icons (6), the rest of `docs/icons-audit.md` (7). Before and after pictures of the View menu: `docs/screenshots/icons-first/`.

## Open tasks, in priority order
1. Owner: run `0003_accounts.sql` and finish the dashboard checklist in `docs/auth-setup.md`; then test sign-in for real.
2. Owner: fill the placeholders in `/privacy` and `/terms` (contact email, company/owner name, address, region, retention days, ages, law,
   court), remove the DRAFT box, set `VITE_SUPPORT_EMAIL`, publish the Google consent screen.
3. Capture, Group C (clips tray as references). Groups A and B are done and live.
3b. **Done:** Two-page view auto-widens the panel and restores it, Fit height, book-icon toggle, remembered layout for new PDFs on wide screens, Reset to default layout, Presentation mode shown disabled.
3c. **Part 2 Group A (clean reading interface) done:** one thin 44 px top bar, floating pen bar (Markup button, auto-fold after 4 s), Markup list drawer instead of the Pages/Markup tabs, page chip, Focus mode, app header and map toolbar hidden at Full screen, scan note as a once-per-PDF hint, optional thumbnail strip. Page area start (px from the window top) at 1366x768: Normal 285 before, 141 after; Full 249 before, 44 after. Tablet landscape (sheet): Normal 662 before, 497 after; Full 294 before, 44 after; tablet portrait Full 294 before, 44 after. Order from now on: B1+B3, then C1 to C3, then B2, then B4, with C4 (Hide answers) last.
3d. **Part 2 B1+B3 (reduced) done:** Document colour Light/Dark/Grey/Sepia (display only), First page alone (rename), 1-page flipping, grouped View menu. **Postponed:** Horizontal scrolling and the 4-page (2x2) grid (they need the viewer core to change). 3e. **Part 2 C1 to C3 done:** customisable pen bar with presets, finer thickness, stylus pressure, straight-angle correction (hold 0.6 s), palm rejection, Stylus only, lasso select (move, resize, recolour, copy, delete). Not tested on a real tablet and stylus. Open next: B2 (page-turn styles, Presentation mode, laser pointer), then B4 (popup document), with C4 (Hide answers) last. The one-folder-per-map plan is next after Group C. Not tested on a real tablet or phone.
4. PDF booklet view, **Group B** (page-turn styles Slide / Flip / Fade / None, tap edge and swipe, Presentation mode, laser pointer; Flip falls back to Slide if it cannot hold 30 fps). Group A is done (see above); (B2: not built; its Presentation entry is a disabled item in the View menu.)
5. Write `docs/pdf-ai-plan.md` (plan only: AI outline from a PDF; requested earlier, not written).
6. Content-Security-Policy header (needs testing with pdf.js, OCR and Google scripts).
7. Optional: server-side Drive refresh tokens (plan, cost and risk are in `docs/drive-sign-in.md`; not built).
8. Test on real devices (first item of "not verified" above).

## Known bugs and limits
- Two-page view: "Fit width" fits the first spread (the one on show when Paged), so a later spread with wider pages (a landscape page) may need a sideways scroll in the continuous view. The automatic 640 px fallback has no case yet: Single page is the default, and a chosen Two pages is honoured down to 480 px.
- A browser tab already open on an old build needs one manual reload after a deploy that predates the recovery code; later deploys recover by themselves.
- Live site shows the Sign in button because Vercel has the Supabase variables, even if the Supabase project is not set up; sign-in then fails
  with a message (guest mode is unaffected).
- The "Files are saved in this browser only" bar still shows when signed in. Minor.
- The Map cannot be placed inside the PDF area (the optional third column holds the Outline only).
- `.emmx` import is read-only conversion; original files are never changed.

## Dashboards and settings the owner configured by hand
(Names only, never values.)
- **Google Cloud:** OAuth client (web) with JavaScript origins for the site and localhost; API key (for the Picker); consent screen. Setup:
  `docs/google-drive-setup.md`. Needed for sign-in too: Supabase callback URL as a redirect URI, scopes `openid`, `email`, `profile`,
  `drive.file`. **Unverified** what is currently set.
- **Supabase:** Email and Google providers appear enabled (public settings, 2026-11-09). Everything else in `docs/auth-setup.md` Part A
  (Site URL and redirect URLs, email templates with the code, custom SMTP, rate limits, CAPTCHA, manual linking, password rules) is **unverified**.
- **Vercel environment variables (names):** `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (these four are in use); `VITE_TURNSTILE_SITE_KEY`, `VITE_SUPPORT_EMAIL` (optional, **unverified** if set). Server-only names listed in
  `.env.example` (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) are not used by any code yet.
- **Cloudflare / DNS / Hostinger:** unverified.

## Commands
```bash
npm install
cp .env.example .env            # fill in the public values; never commit .env
npm run dev                     # dev server (the owner uses port 5181: npm run dev -- --port 5181)
npx tsc --noEmit                # typecheck        (also: npm run typecheck)
npm run lint
npx vitest run                  # unit and component tests (about 2,000)
npm run build                   # typecheck + production build into dist/
npm run e2e:smoke               # build, then production smoke test: opens a PDF at 640/1280/390 px
npm run e2e:login               # login screens with a pretend Supabase (builds dist-auth)
npm run e2e:skew                # deploy-skew test with two builds
npx playwright test e2e/pdf-tabs.spec.ts   # 5 PDFs x 200 pages: memory and frame rate
E2E_URL=https://maps.wishtaa.com npx playwright test e2e/smoke.spec.ts   # the same against the live site
```
Playwright needs a Chromium: set `CHROME_PATH` to an installed one or run `npx playwright install chromium`.

**Deploy:** push to `main` (after typecheck, lint and tests pass). Vercel builds and publishes by itself; then verify the live site (the
smoke test above, and the feature that changed). Vercel builds with its own environment variables, so its file names differ from a local
build. There is no staging environment.
