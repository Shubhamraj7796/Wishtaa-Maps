-- UNDO for supabase/migrations/0005_referral_summary_extras.sql. Run by hand in the SQL editor.
-- Puts back the 0004 version of my_referral_summary() (without awaitingFirstMap and minTopics). Nothing else changes, no data is touched.
-- The app copes with the older answer: it then treats an invited person as waiting and asks the database after saves (at most once a minute) until the database answers.
create or replace function public.my_referral_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); plan jsonb; c record; v_code text; by_friend boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_entitlement(uid);
  perform public.grant_due_rewards(uid);
  perform public.refresh_entitlement(uid);
  plan := public.plan_json(uid);
  select rc.code into v_code from public.referral_codes rc where rc.user_id = uid;
  select count(*) filter (where status <> 'rejected') as invited,
         count(*) filter (where status in ('joined', 'qualified', 'rewarded')) as joined,
         count(*) filter (where status in ('qualified', 'rewarded')) as successful,
         count(*) filter (where status = 'qualified') as waiting
    into c from public.referrals where referrer_id = uid;
  select exists (select 1 from public.referrals where invited_id = uid and status <> 'rejected') into by_friend;
  return plan || jsonb_build_object('code', v_code, 'invited', c.invited, 'joined', c.joined, 'successful', c.successful, 'waiting', c.waiting,
    'monthsEarned', (plan ->> 'bonusMonths')::int, 'invitedByFriend', by_friend);
end $$;
