# Wishtaa Maps: standing rules for Claude

These rules come from the owner and apply to every task in this project. Keep them here. State of the project: `docs/PROJECT_STATE.md`.

## 1. Plan first, every time
For anything the owner asks (a feature, a fix, a question that leads to changes), the FIRST reply is a plan for them to read. **Do not
change any code until they reply "go".** The plan is in plain language, short enough to read in two minutes, with these parts:

- **What I understood:** the request restated in two or three lines, and any assumption made.
- **What I will see:** the visible changes, described as a user would see them.
- **Steps:** a numbered list, each step with its size (small, medium or large), in the order they will be done.
- **Risks and things that could break:** especially data loss, Drive sync, pictures, saved maps, and anything that could slow the app.
- **Decisions for me:** questions where the answer changes what gets built, each with a recommended option. Only the few that really matter.
- **How I will test it:** exact clicks on desktop and tablet.
- **Cost:** roughly how much work this is, and what could be postponed to keep it small.

**Always give the plan inside ONE fenced code block (plain text), so it can be copied and pasted in one click.** No code in the plan. If the request is tiny (a typo, a colour), a two-line plan is enough, and work may continue without waiting only for
changes that are trivial and easy to undo. Writing or updating documentation is not a code change.

## 2. After "go": small parts
One commit per part, tests green, then a short report (nothing is pushed: see 2b): what changed, measured numbers where relevant, what was NOT tested on
real devices, and what the owner should test (exact clicks, desktop and tablet). Every commit message ends with the attribution line the
session gives (currently `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`).

## 2b. Never push until the owner says "go live"
**Commit locally, then STOP.** Run `git push` (to `main` or anywhere) ONLY after the owner writes the clear words **"go live"** for that
push. No other wording counts: not "go", not "push to main" or "push" written inside a task, not "proceed", not "continue". Nothing is
pushed on my own judgment, including documentation, rule changes and fixes, and no earlier permission carries over. Commits made while
waiting stay local (they all go out together at the next "go live"). If unsure, do not push and ask. Pushing to `main` deploys
https://maps.wishtaa.com through Vercel.

## 3. Never guess about the current state
Look at the code, `git log` and `docs/` first. If something is unknown, say so. Do not claim something works on a real device, a real
Google account or the real Supabase project unless it was actually tried there.

## 4. Never delete or overwrite user data; keep the guarantees
Autosave; pictures uploaded once (JSON-only edits afterwards); no "Two versions" dialog in normal editing; Read mode with no writes; guest
mode working without an account; Drive sync and topic-level merge; the 10-edit no-conflict test. Local files are never removed without
a clear choice. Sign-out never drops unsent edits.

## 5. Secrets
Never print or commit keys, client secrets or tokens. `.env` is never committed. Only names of environment variables go in docs, never
values. Only public values (Supabase URL and anon/publishable key, Google client id, Turnstile site key) may appear in the browser.

## 6. Finish a part: update `docs/PROJECT_STATE.md`
(and the relevant feature doc and `CHANGELOG.md`).

## 7. Every new screen must be clean
Content first, one thin primary bar, floating or on-demand tools, progressive disclosure (rare settings in menus, not on the bar), no
permanent notice rows. For any large layout change, measure the content area before and after (at 1366x768, tablet landscape and tablet
portrait) and report the numbers.

## 8. Icons first (a standing design rule, next to rule 7)
ICONS FIRST: wherever possible use a clear icon/symbol instead of a text label. The full name shows as a tooltip on hover (and on long-press on touch
devices, and on keyboard focus). Every icon-only control has an accessible name (aria-label). Keep a short text label only where an icon cannot be
understood on its own. The selected option is shown by a highlighted background, not by an added tick plus words. Use one consistent icon set, one
consistent size, and one tooltip component for the whole app.
How to apply it: use `IconButton`, `IconTile`, `IconToggleGroup`, `Swatch` or `TipButton` (`src/ui/IconButton.tsx`) and the shared `Tooltip` (`src/ui/Tooltip.tsx`); never a native
`title`. New icons: lucide if it has one, otherwise `src/ui/customIcons.tsx` in the same 24 px / 1.9 stroke style, registered in `src/ui/icons.tsx`. The work list is
`docs/icons-audit.md`; the sizes are in `src/ui/iconSize.ts`. Every icon-only control needs its name (aria-label) and a test that finds it by that name.

## Working conventions (learned in this project)
- Before every push: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`. For UI that matters, also the real-browser tests in `e2e/`
  (`npm run e2e:smoke`, `npm run e2e:login`, `npx playwright test e2e/pdf-tabs.spec.ts`).
- "Go live" means: push to main, wait for Vercel, and verify the live site (not just that the push worked). Vercel builds with its own
  environment variables, so its file hashes differ from a local build: verify behaviour, not hashes.
- The dashboards (Supabase, Google Cloud, Vercel, Cloudflare, DNS) are configured by the owner by hand. Write exact click-by-click steps in
  docs; do not try to do them.
- The Windows shell breaks on multi-line heredocs that contain apostrophes: write scripts and files with the file tools instead.
- Playwright uses an installed Chromium: set `CHROME_PATH` (see `playwright.config.ts`).
- Keep `README.md`, `CHANGELOG.md` and the docs in `docs/` current with every change.
