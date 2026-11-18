-- UNDO for supabase/migrations/0003_accounts.sql.  Run by hand in the Supabase SQL editor. READ BEFORE USING.
-- Use it ONLY if 0003 was run in the wrong project or you really want to start the account tables from nothing.
-- WHAT IT REMOVES, FOR EVERY USER: profiles (names), saved preferences, the recent-files list and the Google Drive link status.
-- WHAT IT KEEPS: sign-in accounts (auth.users), their Google Drive files, and every map (maps are never stored in Supabase).
-- After it the app's account features (preferences sync, recent files in the account, Drive status) stop working until 0003 is run again.
-- If 0004 (referrals) is installed it is NOT touched.
-- SAFETY: the next statement stops the script. Delete that one line (and only that line) when you are sure.
select 'Remove this line to confirm that you want to delete all profiles, preferences, recent files and Drive links'::int;

begin;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.delete_my_account();
drop table if exists public.drive_links cascade;
drop table if exists public.recent_files cascade;
drop table if exists public.user_preferences cascade;
drop table if exists public.profiles cascade;
-- public.set_updated_at() is shared with 0004 and is deliberately NOT dropped.
commit;
