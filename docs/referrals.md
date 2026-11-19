# Referral programme and free access

Status: **all six steps built and committed locally, nothing pushed.** On the live Supabase project the owner ran `0003_accounts.sql` and
`0004_referrals.sql`, and the RLS test printed ALL REFERRAL AND RLS TESTS PASSED there. **Not yet run on Supabase: `0005_referral_summary_extras.sql`**
(optional, see below). Not tested for real: Google sign-in, email delivery, the native share sheet on a phone, Safari, Firefox.

## The rules (owner, final)
- Every new account gets **6 months** of free access (referred or not).
- Each successful referral adds **1 month** to the **referrer** (the invited friend gets the standard 6 months only). Maximum **24 months** in total
  (6 + up to 18). All of these are **settings**, not code.
- "Successful" = the invited person confirmed their email AND saved a first real map (**at least 3 topics**, a setting), then a **7 day** wait.
- There is **no paid plan and no payment**. Nothing that works today is locked. "Pro" only covers FUTURE premium features. The one place that asks
  is `hasPro(plan)` in `src/core/plan.ts`; today nothing calls it to lock anything.
- Guests (no account): unchanged.

## Where you change the numbers
Supabase, **Table editor**, table `app_settings` (one row per setting; edit the `value`). Each change is written to the log with who made it.

| key | now | meaning |
| --- | --- | --- |
| `free_months_standard` | 6 | free months for every new account |
| `months_per_referral` | 1 | months the referrer gets per successful referral (0 pauses the programme) |
| `max_total_months` | 24 | the most free months in total |
| `reward_delay_days` | 7 | wait between "friend qualified" and the month being added |
| `min_topics_first_map` | 3 | topics a map needs to count as a first real map |
| `referral_claim_hours` | 24 | a code can only be attached to an account this young |
| `launch_date` | empty | the day the founding members' months start counting (UTC, e.g. `2027-03-01T00:00:00Z`). Empty = not decided. |

Changing a number affects only FUTURE grants. Months already granted are never taken away (the cap is applied when a month is granted).

## Clock start: Option 2, founding members
- Accounts that exist before `launch_date` (all of today's accounts too) are **founding members**: their free months count from `launch_date`.
  Until you set it they have no end date ("Free for founding members"). When you set it, everyone's end date is `launch_date + 6 months + earned months`.
- Accounts created at or after `launch_date` count from their own sign-up day.
- Existing accounts get their plan row the first time they sign in (the app calls `my_plan()`). An optional commented backfill at the end of the
  migration creates all rows at once so owner counts are complete.
- Month arithmetic: calendar months in UTC, added to the start date in one step; a shorter month cuts the day (31 Aug + 6 months = 29 Feb 2028).

## What is stored (Supabase only; never map content or pictures)
| table | what | who can read it from the browser |
| --- | --- | --- |
| `app_settings` | the numbers above | any signed-in person |
| `entitlements` | plan, source, standard/bonus months, clock start, end date, frozen | own row only; the `frozen` column is hidden |
| `referral_codes` | one random 8-character code per person (no personal data) | own row only |
| `referrals` | referrer id, invited id, status, dates, a hash of the normalised invited email | nobody (counts come from `my_referral_summary()`) |
| `entitlement_log` | append-only: every grant, freeze, manual change and setting change, with who did it | nobody |
| `admin_users` | who is an admin (nothing in the app uses it yet) | nobody |

Nobody can write any of these from the browser. Writes happen inside SECURITY DEFINER functions (`claim_referral`, `record_first_map`, the
lazy reward step inside `my_plan()` / `my_referral_summary()`) or by the owner in the dashboard. The inviter sees **counts only**, never who.

## Admin-ready (nothing is built for it now)
- **How an admin is stored:** a row in `admin_users` (user id). NOT a flag on the profile and NOT in the sign-in metadata: a person can edit their
  own profile and their own user metadata from the browser, so a flag there could be set by anyone. `admin_users` has row-level security on, no policy
  and no grant: only the owner (SQL editor / service role) can add a row, and `is_admin()` is the only way to ask.
- **Later:** an admin dashboard reads through new SECURITY DEFINER functions that start with `if not is_admin() then raise exception`. They can read
  `entitlements`, `referrals`, `entitlement_log` and `app_settings` as they are: no table needs to change. Freezing = `entitlements.frozen`; a manual
  grant = editing `bonus_months`/`standard_months`; both are logged automatically with the actor (`owner_sql` today, `admin` later).
- An admin sees account and plan data and counts, **never map content or pictures** (they are not in Supabase).
- **Audit trail:** `entitlement_log` cannot be updated, deleted or truncated (a trigger refuses, even for the owner). When an account is deleted its id
  is blanked in the log (anonymous numbers stay).

## Abuse protection (what is realistic)
- Own code or the same person through an address alias (`a+x@`, Gmail dots) is refused; one reward per invited person; one reward per referral
  forever (a unique index in the log).
- A month is added only after the 7 day delay and only when the email is confirmed and the first map has enough topics. The app sends only a
  topic COUNT, so a determined person could send a false number; the delay, the cap and the owner freeze limit the damage.
- Turnstile on sign-up is already coded (`VITE_TURNSTILE_SITE_KEY`) but its dashboard switch (docs/auth-setup.md step 10) is unverified; Google
  sign-in has no Turnstile. A person with many real mailboxes can still farm months: not preventable without identity checks.
- Freeze an account: Table editor, `entitlements`, set `frozen` to true. It earns nothing and nothing is credited to it; the freeze is logged.

## Running the migration (by hand, in this order)
1. **Is 0003 live?** SQL editor, run (read-only):
   `select to_regclass('public.profiles'), to_regclass('public.user_preferences'), to_regclass('public.recent_files'), to_regclass('public.drive_links');`
   Four names = it is live (skip step 2). Any empty (null) = it is not.
2. **Only if 0003 is missing:** paste and run `supabase/migrations/0003_accounts.sql`. Check again with the select above.
3. Paste and run `supabase/migrations/0004_referrals.sql`. It needs only Supabase Auth; it does not touch the 0003 tables.
   Check (read-only): `select key, value from public.app_settings order by key;` should show 7 rows, and
   `select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('app_settings','admin_users','entitlements','referral_codes','referrals','entitlement_log');`
   should show `true` on all 6. After a new sign-up, `select count(*) from public.entitlements;` goes up by one (or it is filled on first sign-in).
4. Run the test: `supabase/tests/referrals_rls_test.sql` (see below). Do NOT run `0001_schema.sql` or `0002_rls.sql` (an old unused plan), and do NOT run
   `docs/proposed/0003_files_and_kb.sql` (a proposal for a different, unused design; it changes tables that do not exist in this project).

## The RLS and rules test
`supabase/tests/referrals_rls_test.sql`: paste it into the SQL editor and Run, **after** 0004. It makes test accounts (`@rls-test.invalid`) inside one
transaction and ends with ROLLBACK, so nothing stays. Good result: one line, **ALL REFERRAL AND RLS TESTS PASSED**; a failure stops with `FAIL: ...`.
It proves: a person sees only their own plan row and code; cannot read `referrals`, the log or `admin_users`; cannot write any table or call the
internal functions; visitors can call nothing; bad/unknown/own/alias/late codes are ignored; one referral per account; qualification needs a confirmed
email and 3 topics; the 7 day delay; a reward is added once; the 24 month cap; a frozen account earns nothing; the launch date and the month-end
rule; the log refuses update, delete and truncate; admin is only a table row; deleting an account blanks the log ids.
- Run here (not on Supabase): the migration, the test and both undo files ran against an in-memory PostgreSQL (PGlite) with stand-ins for Supabase's
  roles, `auth.users` and `auth.uid()`; the test was also checked to FAIL when a permission is wrongly opened. That is not the real Supabase project:
  the real result is yours to confirm.

## Undo
- `supabase/undo/0004_referrals_undo.sql`: removes the referral tables, functions and the two triggers on `auth.users`. Keeps every account and all
  of 0003. Deletes referral history and the log for good. To only pause the programme, set `months_per_referral` to 0 instead.
- `supabase/undo/0003_accounts_undo.sql`: only if 0003 was run in the wrong project. Deletes all profiles, preferences, recent files and Drive links.
  Its first statement stops the script until you delete that one line. Keeps accounts, Drive files and maps (maps are never in Supabase).
- Neither undo is ever run by the assistant.

## Migration 0005 (small, optional but recommended)
`supabase/migrations/0005_referral_summary_extras.sql` replaces ONE function (`my_referral_summary`) so it also says whether THIS account was invited and has
not saved a first real map yet (`awaitingFirstMap`) and how many topics that map needs (`minTopics`). No table or data changes. Run it by hand after 0004,
then `supabase/tests/referrals_0005_test.sql` (ends with ROLLBACK; good result: `0005 TESTS PASSED`). Without it the app still works: an invited person is
then treated as waiting, and the database answer ends it. Undo: `supabase/undo/0005_referral_summary_extras_undo.sql`.

## How it works in the app
1. **Capture** (`src/core/referral/capture.ts`, called from `startAuth()` in `src/app/account.ts`): a link `https://maps.wishtaa.com/?ref=CODE` is checked (8 allowed
   characters), stored in local storage as `wishtaamaps:ref` for 30 days (it survives the trip to Google and the emailed confirmation link), and `ref` is removed from
   the address bar. A bad code changes nothing; the newest good link wins. Only when this site has accounts switched on.
2. **Claim** (`src/core/referral/claim.ts`): after every sign-in the remembered code is sent once to `claim_referral`. The DATABASE decides (new account, real code, not
   your own, not an alias of you, not already invited); every "no" is the silent answer `ignored`; the code is forgotten after any answer and kept only if the network failed.
3. **First real map** (`src/core/referral/firstMap.ts`, `src/editor/saveEvents.ts`): when an INVITED person has changed something in a map in this session (a template
   opened and saved without typing does not count) and the save finishes, the app sends ONE number (how many topics) to `record_first_map`, at most once a minute, only
   while the account is waiting, and stops for good when the database answers "qualified" or "none". Read mode and edits that arrive from another device never count.
4. **Reward** (database, lazy): when the referrer opens the panel or signs in (`my_plan()` / `my_referral_summary()`), referrals past the 7 day wait add their month.
5. **Panel** (`src/app/referral/ReferFriend.tsx`): account menu, "Refer a friend" (gift icon) and a section on the Account page. My link with Copy and Share icons (Share only
   where the device has a share sheet), Invited / Joined / Successful counts, months earned (+ "n on the way"), the free period line, the cap line, and the one note.
   Invited people are never shown: counts only. A database without the referral functions shows "Referrals are not available yet." (no error screen).
6. **Quiet line:** the sign-in box shows "Invited by a friend" only when a remembered link is waiting. No banners anywhere.

## Wording
Every word the person sees about the programme is in ONE file: `src/app/referral/wording.ts` (title, the note, "Free for founding members", "Free until <date>",
"Maximum free period reached", "Invited by a friend"). Change the text there; the numbers are settings in the database (table above).

## Terms and Privacy drafts
`public/terms/index.html` has a new clause 6 "Free access and referrals" (later clauses renumbered 7 to 11) and `public/privacy/index.html` a new section "Free access, referrals
and administrators" plus a bullet in "What we store" and an addition to "How long we keep it". Placeholders are marked `[ ... ]` for the owner: the numbers (6, 1, 7, 24),
the launch date, what happens when free access ends, how long the log is kept. They are drafts, not legal advice, and the DRAFT box stays until the owner removes it.
The Privacy draft states that an administrator never sees map content or pictures (they are not in Supabase), that the inviter sees only counts, and that the hashed email exists only to stop double counting.

## Tests
- Unit: `src/core/plan.test.ts` (month maths, cap, hasPro), `src/core/referral/claim.test.ts` and `firstMap.test.ts`, `src/app/referralCapture.test.ts`,
  `src/editor/saveEvents.test.ts` (the editor announces a save only after the person typed), `src/app/referral/referral.ui.test.tsx` (panel, copy, share, cap, errors, the whole chain with
  the stand-in sign-in service), `src/app/legalPages.test.ts`.
- Real browser (Chrome, pretend Supabase): `e2e/referral.spec.ts` (`node e2e/build-auth.mjs`, then `npx playwright test e2e/referral.spec.ts`). Pictures: `docs/screenshots/referral/`.
- Database: `supabase/tests/referrals_rls_test.sql` and `referrals_0005_test.sql` (run by the owner on Supabase: 0004 passed).
- NOT tested: real Google sign-in, real email delivery, the real native share sheet on a phone or tablet, Safari, Firefox, a screen reader.

## Before you announce the programme (dashboards, your part, in this order)
1. **Custom email sender (SMTP)** first, because a friend only counts after confirming their email, and Supabase's built-in mailer sends very few emails per hour.
   Steps: `docs/auth-setup.md` Part A step 7 (create the sender `no-reply@wishtaa.com` with Resend/Postmark/Brevo/SES, publish its SPF, DKIM and DMARC records, wait for "Verified", then Supabase Authentication, Emails, SMTP Settings, Enable Custom SMTP, Save, and test by signing in with a code).
2. **Turnstile** (stops bots farming sign-ups): `docs/auth-setup.md` Part A step 10, strictly in its order: Cloudflare Turnstile widget (hostnames `maps.wishtaa.com` and `localhost`), copy the Site key and Secret key,
   put the Site key in Vercel as `VITE_TURNSTILE_SITE_KEY`, redeploy, and ONLY THEN switch on CAPTCHA protection in Supabase (Authentication, Attack Protection) with the Secret key. Test sign-in on the live site; if it fails, switch protection off again.
3. **`VITE_SUPPORT_EMAIL` in Vercel** (Project, Settings, Environment Variables, all three environments): the address people should write to. Do it in the same redeploy as step 2. Use the same address for the contact placeholders in Terms and Privacy.
Google: the consent screen is already In production (External). Allowed origins are `http://localhost:5181` and `https://maps.wishtaa.com`; open the app at localhost, NOT 127.0.0.1, when testing Google or Drive locally.

## What migration 0005 adds (decide later, do not run now)
It replaces one database function so the referral summary also says whether this account is waiting for its first real map and how many topics that needs; the app works without it.

## Placeholders still for the owner (Terms and Privacy drafts)
Company or owner legal name (and address): Terms 1 and Privacy "Who we are"; contact email (Terms 11 and footer, Privacy "Who we are", "Your choices", footer); minimum age; country/state and court; the numbers shown as [6] [1] [7] [24] (match the settings); the launch date announcement; region of the Supabase project; name of the email service; backup retention days; grievance officer details; the age for children. The DRAFT box stays until a lawyer or the owner's CA has reviewed both pages.

## Known gap: the 24 month log retention is a promise, not yet enforced
The Privacy draft says the log is kept for up to 24 months, but the database log is append-only (a trigger refuses every delete, even for the owner), so nothing purges it. Before relying on that sentence a small owner-run purge function (older than 24 months, anonymous rows only) needs to be written and reviewed. Not built.
