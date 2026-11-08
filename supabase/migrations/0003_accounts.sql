-- Wishtaa Maps accounts. Supabase keeps ONLY: the profile, preferences, the recent-files list and the Google Drive link status.
-- Map content and pictures are never stored here (they stay in the person's Google Drive or browser).
-- This file does not depend on 0001/0002 and can be run on its own. Every table is owner-only (row-level security, default deny).

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ preferences
-- One row per person. `version` is the shape of `data` (so an old app can ignore a newer shape); `data` is small, capped at 64 KB.
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1 check (version >= 1),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 65536),
  updated_at timestamptz not null default now()
);
create trigger user_preferences_updated before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------ recent files
-- A pointer to a file, never its content. `file_ref` is the app's own id for the file on the device that opened it.
create table public.recent_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_ref text not null check (char_length(file_ref) between 1 and 200),
  title text not null default '' check (char_length(title) <= 300),
  storage_kind text not null check (storage_kind in ('local', 'drive')),
  drive_file_id text check (drive_file_id is null or char_length(drive_file_id) <= 200),
  last_opened timestamptz not null default now(),
  unique (user_id, file_ref),
  check (storage_kind <> 'drive' or drive_file_id is not null)
);
create index recent_files_user_idx on public.recent_files(user_id, last_opened desc);

-- ------------------------------------------------------------- drive link
-- Which Google account is linked for Drive. No tokens are kept here (the access token lives only in the browser's memory).
create table public.drive_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_email text check (google_email is null or char_length(google_email) <= 320),
  app_folder_id text check (app_folder_id is null or char_length(app_folder_id) <= 200),
  connected_at timestamptz not null default now(),
  status text not null default 'connected' check (status in ('connected', 'needs_reconnect', 'disconnected'))
);

-- ---------------------------------------------------------------- RLS
alter table public.profiles         enable row level security;
alter table public.user_preferences enable row level security;
alter table public.recent_files     enable row level security;
alter table public.drive_links      enable row level security;

-- Nothing is open to signed-out visitors, and the client role gets only what the policies below allow.
revoke all on public.profiles, public.user_preferences, public.recent_files, public.drive_links from anon, public;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences, public.recent_files, public.drive_links to authenticated;

create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy prefs_select on public.user_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy prefs_insert on public.user_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy prefs_update on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy prefs_delete on public.user_preferences for delete to authenticated using (user_id = (select auth.uid()));

create policy recent_select on public.recent_files for select to authenticated using (user_id = (select auth.uid()));
create policy recent_insert on public.recent_files for insert to authenticated with check (user_id = (select auth.uid()));
create policy recent_update on public.recent_files for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recent_delete on public.recent_files for delete to authenticated using (user_id = (select auth.uid()));

create policy drive_select on public.drive_links for select to authenticated using (user_id = (select auth.uid()));
create policy drive_insert on public.drive_links for insert to authenticated with check (user_id = (select auth.uid()));
create policy drive_update on public.drive_links for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy drive_delete on public.drive_links for delete to authenticated using (user_id = (select auth.uid()));

-- ------------------------------------------------ profile on first sign-in
-- Runs as the table owner so the profile exists the moment the account does, whatever the sign-in method was.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)), 100),
    left(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), 2000)
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- delete account
-- Removes the sign-in and, by cascade, every row above. Files in the person's Google Drive are never touched (this app cannot reach them).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- --------------------------------------------- optional: restrict by domain
-- Any valid email may sign up. To allow only some domains later, add them here and uncomment the trigger. Runs before the account is created.
-- create table public.allowed_email_domains (domain text primary key check (domain = lower(domain)));
-- create or replace function public.check_email_domain() returns trigger language plpgsql security definer set search_path = public as $$
-- begin
--   if exists (select 1 from public.allowed_email_domains)
--      and not exists (select 1 from public.allowed_email_domains where domain = lower(split_part(new.email, '@', 2))) then
--     raise exception 'Sign-ups from this email domain are not allowed';
--   end if;
--   return new;
-- end $$;
-- create trigger before_auth_user_created before insert on auth.users for each row execute function public.check_email_domain();
