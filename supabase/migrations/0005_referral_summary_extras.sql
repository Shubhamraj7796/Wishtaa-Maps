-- Wishtaa Maps referral programme, small follow-up to 0004. FOR REVIEW: not run by the assistant. Run it by hand AFTER 0004.
-- WHAT IT DOES: replaces ONE function (my_referral_summary) so it also says (a) whether THIS account was invited and has not yet saved a first
-- real map, and (b) how many topics that first map needs (the app_settings value). The app uses these two answers so it only reports a saved map
-- while it matters, instead of on every save. No table changes, no data changes, grants unchanged (create or replace keeps them).
-- Undo: supabase/undo/0005_referral_summary_extras_undo.sql puts the 0004 version back.
create or replace function public.my_referral_summary() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); plan jsonb; c record; v_code text; by_friend boolean; awaiting boolean;
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
  select exists (select 1 from public.referrals where invited_id = uid and status in ('invited', 'joined')) into awaiting;
  return plan || jsonb_build_object('code', v_code, 'invited', c.invited, 'joined', c.joined, 'successful', c.successful, 'waiting', c.waiting,
    'monthsEarned', (plan ->> 'bonusMonths')::int, 'invitedByFriend', by_friend,
    'awaitingFirstMap', awaiting, 'minTopics', public.setting_int('min_topics_first_map', 3));
end $$;
