-- Test for 0005_referral_summary_extras.sql. Run it AFTER 0005, the same way as referrals_rls_test.sql (paste, Run; it ends with ROLLBACK).
-- GOOD RESULT: the single line "0005 TESTS PASSED".
begin;
insert into auth.users (id, email, created_at, email_confirmed_at) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'a5@rls-test.invalid', now(), now()),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b5@rls-test.invalid', now(), now());
select set_config('t.codeA', (select code from public.referral_codes where user_id = 'bbbbbbbb-0000-0000-0000-000000000001'), false);

select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$ declare s jsonb; begin
  s := public.my_referral_summary();
  if (s ->> 'awaitingFirstMap')::boolean is not false or (s ->> 'minTopics')::int <> 3 then raise exception 'FAIL: before any code the person is not awaiting a first map: %', s; end if;
  if public.claim_referral(current_setting('t.codeA')) <> 'claimed' then raise exception 'FAIL: claim'; end if;
  s := public.my_referral_summary();
  if (s ->> 'awaitingFirstMap')::boolean is not true or (s ->> 'invitedByFriend')::boolean is not true then raise exception 'FAIL: an invited person who has not saved a map is awaiting: %', s; end if;
  if public.record_first_map(2) <> 'waiting' then raise exception 'FAIL: 2 topics is not enough'; end if;
  if (public.my_referral_summary() ->> 'awaitingFirstMap')::boolean is not true then raise exception 'FAIL: still awaiting after a too small map'; end if;
  if public.record_first_map(3) <> 'qualified' then raise exception 'FAIL: 3 topics qualify'; end if;
  if (public.my_referral_summary() ->> 'awaitingFirstMap')::boolean is not false then raise exception 'FAIL: not awaiting once qualified'; end if;
end $$;
reset role;

-- The referrer is never "awaiting", and a changed setting is passed on.
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
update public.app_settings set value = '5' where key = 'min_topics_first_map';
set local role authenticated;
do $$ declare s jsonb; begin
  s := public.my_referral_summary();
  if (s ->> 'awaitingFirstMap')::boolean is not false then raise exception 'FAIL: the referrer is not awaiting a first map: %', s; end if;
  if (s ->> 'minTopics')::int <> 5 then raise exception 'FAIL: minTopics must follow the setting: %', s; end if;
end $$;
reset role;
select '0005 TESTS PASSED' as result;
rollback;
