-- UNDO for supabase/migrations/0004_referrals.sql.  Run by hand in the Supabase SQL editor.
-- WHAT IT REMOVES: the referral/free-access tables (settings, plans, codes, referrals, the log, admin_users), their functions and the
-- two triggers on auth.users. WHAT IT KEEPS: every account, sign-in, and everything from 0003 (profiles, preferences, recent files, Drive link).
-- WARNING: referral history and the log are deleted for good. If you only want to pause the programme, do NOT run this: change the
-- settings instead (months_per_referral = 0). After this the app's "Refer a friend" panel just shows nothing (it must handle a missing function).
begin;

drop trigger if exists on_auth_user_created_plan on auth.users;
drop trigger if exists before_auth_user_deleted_log on auth.users;

drop function if exists public.my_plan();
drop function if exists public.my_referral_summary();
drop function if exists public.claim_referral(text);
drop function if exists public.record_first_map(int);
drop function if exists public.is_admin();
drop function if exists public.plan_json(uuid);
drop function if exists public.grant_due_rewards(uuid);
drop function if exists public.refresh_entitlement(uuid);
drop function if exists public.ensure_entitlement(uuid);
drop function if exists public.ensure_referral_code(uuid);
drop function if exists public.make_referral_code();
drop function if exists public.email_hash(text);
drop function if exists public.norm_email(text);
drop function if exists public.handle_new_user_plan();
drop function if exists public.anonymize_log_on_delete();

drop table if exists public.entitlement_log cascade;   -- its guard functions are dropped just below
drop table if exists public.referrals cascade;
drop table if exists public.referral_codes cascade;
drop table if exists public.entitlements cascade;
drop table if exists public.admin_users cascade;
drop table if exists public.app_settings cascade;

drop function if exists public.entitlement_log_guard();
drop function if exists public.entitlements_audit();
drop function if exists public.settings_audit();
drop function if exists public.log_actor_kind();
drop function if exists public.setting_int(text, int);
drop function if exists public.setting_launch();
drop function if exists public.add_months_utc(timestamptz, int);
-- public.set_updated_at() is shared with 0003 (and 0001) and is deliberately NOT dropped.

commit;
