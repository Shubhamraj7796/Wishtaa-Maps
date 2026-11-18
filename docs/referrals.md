# Referral programme and free access

Status: **steps 1 and 2 done** (settings + month maths in code, the database migration as a FILE). The migration has **not been run** on any real
Supabase project. Steps 3 to 6 (capture and claim, first-map hook, "Refer a friend" panel, Terms/Privacy drafts) wait for the owner's "continue".

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
4. Run the test: `supabase/tests/referrals_rls_test.sql` (see below). Do NOT run `0001_schema.sql` or `0002_rls.sql` (an old unused plan).

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

## Code (so far)
- `src/core/plan.ts` (+ `plan.test.ts`): settings defaults mirroring the seed, `addMonthsUtc`, `totalMonths`, `bonusRoom`, `freeUntil`, `hasPro`,
  `cleanReferralCode`.
