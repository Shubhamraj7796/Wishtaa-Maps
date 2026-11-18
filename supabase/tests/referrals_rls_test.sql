-- Wishtaa Maps: row-level-security and referral-rules test for 0004_referrals.sql.
-- HOW TO RUN: Supabase dashboard, SQL editor, new query, paste ALL of this, Run. It runs inside one transaction and ends with ROLLBACK,
-- so it leaves NOTHING behind (the test people it makes are removed again). Run it ONLY after 0004 has been run.
-- GOOD RESULT: the last result shows the single line "ALL REFERRAL AND RLS TESTS PASSED". Any problem stops with "FAIL: ..." and a reason.
-- It creates test accounts in auth.users with addresses ending in @rls-test.invalid (inside the transaction only).
-- If your SQL editor cannot run a whole script as one transaction, run it in the Supabase CLI instead (psql -f); do NOT run it half-way.
begin;

-- ---------------------------------------------------------------- people (as the owner)
-- A referrer, B invited by A, C a stranger, D and E (E uses an alias of D's address), F (an alias of B), G/H/I extra friends of A, J/K (freeze test)
insert into auth.users (id, email, created_at, email_confirmed_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'b@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'c@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000004', 'Dot.Ted+1@gmail.com', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'dotted@gmail.com', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000006', 'b+second@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000007', 'g@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000008', 'h@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-000000000009', 'i@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'j@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-00000000000b', 'k@rls-test.invalid', now(), now()),
  ('aaaaaaaa-0000-0000-0000-00000000000c', 'unconfirmed@rls-test.invalid', now(), null);

-- Each person got a plan row and a code the moment the account was created (the trigger).
do $$ begin
  if (select count(*) from public.entitlements where user_id::text like 'aaaaaaaa-0000-%') <> 12 then raise exception 'FAIL: not every new account got a plan row'; end if;
  if (select count(*) from public.referral_codes where user_id::text like 'aaaaaaaa-0000-%') <> 12 then raise exception 'FAIL: not every new account got a code'; end if;
  if (select count(*) from public.entitlements where clock_start is not null and user_id::text like 'aaaaaaaa-0000-%') <> 0 then raise exception 'FAIL: with no launch date everybody must be a founding member'; end if;
end $$;

select set_config('t.codeA', (select code from public.referral_codes where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'), false);
select set_config('t.codeD', (select code from public.referral_codes where user_id = 'aaaaaaaa-0000-0000-0000-000000000004'), false);
select set_config('t.codeJ', (select code from public.referral_codes where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a'), false);

-- ================================================================ 1. person A: sees only their own rows, can write nothing
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$ declare p jsonb; begin
  p := public.my_plan();
  if p ->> 'plan' <> 'pro' or (p ->> 'founding')::boolean is not true or p -> 'freeUntil' <> 'null'::jsonb then raise exception 'FAIL: new person should be a founding Pro member with no end date yet: %', p; end if;
  if (p ->> 'monthsTotal')::int <> 6 then raise exception 'FAIL: standard offer is 6 months: %', p; end if;
  if (select count(*) from public.entitlements) <> 1 then raise exception 'FAIL: A must see exactly their own plan row'; end if;
  if (select count(*) from public.referral_codes) <> 1 then raise exception 'FAIL: A must see exactly their own code'; end if;
  if (select count(*) from public.app_settings) < 7 then raise exception 'FAIL: settings should be readable'; end if;
  if (select user_id from public.entitlements) <> 'aaaaaaaa-0000-0000-0000-000000000001' then raise exception 'FAIL: A saw another person plan row'; end if;
end $$;

-- Things that must be REFUSED for a signed-in person (each one must raise "permission denied").
do $$ begin begin perform frozen from public.entitlements; raise exception 'FAIL: the frozen column must stay hidden'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform * from public.referrals; raise exception 'FAIL: referrals must not be readable'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform * from public.entitlement_log; raise exception 'FAIL: the log must not be readable'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform * from public.admin_users; raise exception 'FAIL: admin_users must not be readable'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin update public.entitlements set bonus_months = 99; raise exception 'FAIL: a person must not change their plan'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into public.entitlements (user_id) values ('aaaaaaaa-0000-0000-0000-000000000003'); raise exception 'FAIL: a person must not insert a plan'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin delete from public.entitlements; raise exception 'FAIL: a person must not delete a plan'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin update public.app_settings set value = '999' where key = 'max_total_months'; raise exception 'FAIL: a person must not change settings'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into public.referral_codes (user_id, code) values ('aaaaaaaa-0000-0000-0000-000000000001', 'ABCDEFGH'); raise exception 'FAIL: a person must not write codes'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into public.referrals (referrer_id, invited_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003'); raise exception 'FAIL: a person must not write referrals'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into public.entitlement_log (kind) values ('manual'); raise exception 'FAIL: a person must not write the log'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin insert into public.admin_users (user_id) values ('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'FAIL: a person must not make themselves admin'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.grant_due_rewards('aaaaaaaa-0000-0000-0000-000000000001'); raise exception 'FAIL: internal reward function must be closed'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.ensure_entitlement('aaaaaaaa-0000-0000-0000-000000000003'); raise exception 'FAIL: internal plan function must be closed'; exception when insufficient_privilege then null; end; end $$;
do $$ begin if public.is_admin() then raise exception 'FAIL: A is not an admin'; end if; end $$;

-- ================================================================ 2. signed out / anonymous: nothing
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$ begin begin perform public.my_plan(); raise exception 'FAIL: visitors must not call my_plan'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform * from public.app_settings; raise exception 'FAIL: visitors must not read settings'; exception when insufficient_privilege then null; end; end $$;
do $$ begin begin perform public.claim_referral('ABCDEFGH'); raise exception 'FAIL: visitors must not claim'; exception when insufficient_privilege then null; end; end $$;
reset role;

-- ================================================================ 3. claim rules (B uses A's code)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.claim_referral('NOTACODE') <> 'ignored' then raise exception 'FAIL: a bad code must be ignored'; end if;
  if public.claim_referral('ZZZZZZZZ') <> 'ignored' then raise exception 'FAIL: an unknown code must be ignored'; end if;
  if public.claim_referral(null) <> 'ignored' then raise exception 'FAIL: null must be ignored'; end if;
  if public.claim_referral((select code from public.referral_codes)) <> 'ignored' then raise exception 'FAIL: own code must be ignored (self-referral)'; end if;
  if public.claim_referral(lower(current_setting('t.codeA'))) <> 'claimed' then raise exception 'FAIL: a good code (any case) must be claimed'; end if;
  if public.claim_referral(current_setting('t.codeA')) <> 'ignored' then raise exception 'FAIL: a second claim must be ignored (one referral per account)'; end if;
end $$;

-- F is an alias of B (b+second@ = b@): one person, one reward.
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000006","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if public.claim_referral(current_setting('t.codeA')) <> 'ignored' then raise exception 'FAIL: an alias of an already invited person must be ignored'; end if; end $$;

-- E is an alias of D (dotted@gmail = Dot.Ted+1@gmail) and tries D's code: the same person inviting themselves.
reset role;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000005","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if public.claim_referral(current_setting('t.codeD')) <> 'ignored' then raise exception 'FAIL: self-referral through an alias must be ignored'; end if; end $$;
reset role;
do $$ begin
  if (select status from public.referrals where invited_id = 'aaaaaaaa-0000-0000-0000-000000000005') <> 'rejected' then raise exception 'FAIL: the alias self-referral must be recorded as rejected'; end if;
  if (select count(*) from public.referrals where referrer_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'FAIL: A should have exactly one referral so far'; end if;
end $$;

-- An old account cannot attach a code afterwards (claim window).
update auth.users set created_at = now() - interval '3 days' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if public.claim_referral(current_setting('t.codeA')) <> 'ignored' then raise exception 'FAIL: an old account must not claim a code'; end if; end $$;
reset role;

-- ================================================================ 4. qualification (B saves a first map)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if public.record_first_map(2) <> 'waiting' then raise exception 'FAIL: 2 topics is not enough (setting is 3)'; end if;
  if public.record_first_map(null) <> 'waiting' then raise exception 'FAIL: no number is not enough'; end if;
  if public.record_first_map(3) <> 'qualified' then raise exception 'FAIL: 3 topics must qualify'; end if;
  if public.record_first_map(30) <> 'none' then raise exception 'FAIL: qualifying twice must do nothing'; end if;
end $$;
reset role;

-- A person whose email is not confirmed cannot qualify.
insert into public.referrals (referrer_id, invited_id, status, invited_email_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000c', 'invited', public.email_hash('unconfirmed@rls-test.invalid'));
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000c', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000c","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if public.record_first_map(50) <> 'waiting' then raise exception 'FAIL: an unconfirmed email must not qualify'; end if; end $$;
reset role;
delete from public.referrals where invited_id = 'aaaaaaaa-0000-0000-0000-00000000000c';

-- ================================================================ 5. the delay, and a reward that is given once
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ declare s jsonb; begin
  s := public.my_referral_summary();
  if (s ->> 'monthsEarned')::int <> 0 or (s ->> 'waiting')::int <> 1 or (s ->> 'successful')::int <> 1 or (s ->> 'invited')::int <> 1 then raise exception 'FAIL: within the 7 day delay no month is added yet: %', s; end if;
  if s ->> 'code' <> current_setting('t.codeA') then raise exception 'FAIL: summary shows the wrong code'; end if;
  if s::text like '%b@rls-test%' or s::text like '%aaaaaaaa-0000-0000-0000-000000000002%' then raise exception 'FAIL: the summary must never show the invited person'; end if;
end $$;
reset role;
update public.referrals set qualified_at = now() - interval '8 days' where invited_id = 'aaaaaaaa-0000-0000-0000-000000000002';
set local role authenticated;
do $$ declare s jsonb; begin
  s := public.my_referral_summary();
  if (s ->> 'monthsEarned')::int <> 1 or (s ->> 'monthsTotal')::int <> 7 then raise exception 'FAIL: after the delay exactly 1 month is added: %', s; end if;
  s := public.my_referral_summary(); s := public.my_plan();
  if (s ->> 'bonusMonths')::int <> 1 then raise exception 'FAIL: asking again must not add the month again: %', s; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.entitlement_log where kind = 'referral' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'FAIL: exactly one referral grant in the log'; end if;
  if (select status from public.referrals where invited_id = 'aaaaaaaa-0000-0000-0000-000000000002') <> 'rewarded' then raise exception 'FAIL: referral should be rewarded'; end if;
end $$;
-- The invited person sees only the quiet "invited by a friend" flag.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ begin
  if (public.my_referral_summary() ->> 'invitedByFriend')::boolean is not true then raise exception 'FAIL: B should see invitedByFriend'; end if;
  if (public.my_plan() ->> 'bonusMonths')::int <> 0 then raise exception 'FAIL: the invited friend gets the standard 6 months only'; end if;
end $$;
reset role;

-- ================================================================ 6. the cap (24 months = 6 + at most 18)
-- A is given 16 bonus months by hand (logged as the owner), then two more friends qualify long ago: one fits (17), one fills (18)... and a third is "cap".
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true); -- the owner in the SQL editor is not a signed-in person
update public.entitlements set bonus_months = 16 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from public.entitlement_log where kind = 'manual' and actor_kind = 'owner_sql') <> 1 then raise exception 'FAIL: a manual change by the owner must be logged'; end if;
end $$;
insert into public.referrals (referrer_id, invited_id, status, qualified_at, invited_email_hash) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000007', 'qualified', now() - interval '9 days', public.email_hash('g@rls-test.invalid')),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000008', 'qualified', now() - interval '8 days', public.email_hash('h@rls-test.invalid')),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000009', 'qualified', now() - interval '7 days 1 hour', public.email_hash('i@rls-test.invalid'));
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ declare s jsonb; begin
  s := public.my_referral_summary();
  if (s ->> 'bonusMonths')::int <> 18 or (s ->> 'monthsTotal')::int <> 24 or (s ->> 'capReached')::boolean is not true then raise exception 'FAIL: the cap is 24 months in total: %', s; end if;
  if (s ->> 'successful')::int <> 4 then raise exception 'FAIL: all four successful referrals still count: %', s; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.entitlement_log where kind = 'cap' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then raise exception 'FAIL: the referral past the cap must be logged as cap (0 months)'; end if;
end $$;

-- ================================================================ 7. a frozen account earns nothing; unfrozen it gets its month
insert into public.referrals (referrer_id, invited_id, status, qualified_at, invited_email_hash) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-00000000000b', 'qualified', now() - interval '30 days', public.email_hash('k@rls-test.invalid'));
update public.entitlements set frozen = true where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
do $$ begin if not exists (select 1 from public.entitlement_log where kind = 'freeze' and user_id = 'aaaaaaaa-0000-0000-0000-00000000000a') then raise exception 'FAIL: a freeze must be logged'; end if; end $$;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000a', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if (public.my_referral_summary() ->> 'monthsEarned')::int <> 0 then raise exception 'FAIL: a frozen account must earn nothing'; end if; end $$;
reset role;
update public.entitlements set frozen = false where user_id = 'aaaaaaaa-0000-0000-0000-00000000000a';
set local role authenticated;
do $$ begin if (public.my_referral_summary() ->> 'monthsEarned')::int <> 1 then raise exception 'FAIL: after unfreezing the waiting month is added'; end if; end $$;
reset role;

-- ================================================================ 8. founding members and the launch date (month-end rule)
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if public.my_plan() -> 'freeUntil' <> 'null'::jsonb then raise exception 'FAIL: founding member with no launch date has no end date'; end if; end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true); -- the owner in the SQL editor is not a signed-in person
update public.app_settings set value = '2027-08-31T00:00:00Z' where key = 'launch_date';
do $$ begin if not exists (select 1 from public.entitlement_log where kind = 'setting' and details ->> 'key' = 'launch_date' and actor_kind = 'owner_sql') then raise exception 'FAIL: a settings change must be logged'; end if; end $$;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$ declare p jsonb; begin
  p := public.my_plan();
  if (p ->> 'freeUntil')::timestamptz <> '2028-02-29T00:00:00Z'::timestamptz then raise exception 'FAIL: 31 Aug + 6 months must be 29 Feb 2028 (month end rule): %', p; end if;
end $$;
reset role;
-- A is a founding member with 18 bonus months: 31 Aug 2027 + 24 months.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if (public.my_plan() ->> 'freeUntil')::timestamptz <> '2029-08-31T00:00:00Z'::timestamptz then raise exception 'FAIL: 24 months from launch'; end if; end $$;
reset role;
-- Someone who joins AFTER the launch date counts from their own sign-up day.
insert into auth.users (id, email, created_at, email_confirmed_at) values ('aaaaaaaa-0000-0000-0000-00000000000d', 'late@rls-test.invalid', '2027-10-31T12:00:00Z', now());
do $$ begin
  if (select clock_start from public.entitlements where user_id = 'aaaaaaaa-0000-0000-0000-00000000000d') is distinct from '2027-10-31T12:00:00Z'::timestamptz then raise exception 'FAIL: a later member counts from the sign-up day'; end if;
end $$;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-00000000000d', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-00000000000d","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if (public.my_plan() ->> 'freeUntil')::timestamptz <> '2028-04-30T12:00:00Z'::timestamptz then raise exception 'FAIL: 31 Oct + 6 months must be 30 Apr'; end if; end $$;
reset role;

-- ================================================================ 9. the log is append-only, even for the owner
do $$ begin begin update public.entitlement_log set months = 99; raise exception 'FAIL: the log must not be updatable'; exception when others then if sqlerrm not like '%append-only%' then raise; end if; end; end $$;
do $$ begin begin delete from public.entitlement_log; raise exception 'FAIL: the log must not be deletable'; exception when others then if sqlerrm not like '%append-only%' then raise; end if; end; end $$;
do $$ begin begin truncate public.entitlement_log; raise exception 'FAIL: the log must not be truncatable'; exception when others then if sqlerrm not like '%append-only%' then raise; end if; end; end $$;

-- ================================================================ 10. an admin is only a row the owner adds; it gives the person no table rights
insert into public.admin_users (user_id, note) values ('aaaaaaaa-0000-0000-0000-000000000001', 'test');
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$ begin if not public.is_admin() then raise exception 'FAIL: a row in admin_users makes is_admin() true'; end if; end $$;
do $$ begin begin perform * from public.admin_users; raise exception 'FAIL: even an admin cannot read the table directly'; exception when insufficient_privilege then null; end; end $$;
reset role;

-- ================================================================ 11. deleting an account: the rows go, the log stays as anonymous numbers
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$ begin
  if exists (select 1 from public.referrals where invited_id = 'aaaaaaaa-0000-0000-0000-000000000002') then raise exception 'FAIL: the deleted person referral row must go'; end if;
  if exists (select 1 from public.entitlements where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') then raise exception 'FAIL: the deleted person plan must go'; end if;
  if exists (select 1 from public.entitlement_log where user_id = 'aaaaaaaa-0000-0000-0000-000000000002') then raise exception 'FAIL: the log must not keep the deleted person id'; end if;
  if (select count(*) from public.entitlement_log where kind = 'referral' and user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 3 then raise exception 'FAIL: the referrer keeps every month that was earned (B, G and H)'; end if;
end $$;
delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'; -- the referrer: also fine, the log is blanked
do $$ begin if exists (select 1 from public.entitlement_log where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' or actor_id = 'aaaaaaaa-0000-0000-0000-000000000001') then raise exception 'FAIL: log still names the deleted referrer'; end if; end $$;

select 'ALL REFERRAL AND RLS TESTS PASSED' as result;
rollback;
