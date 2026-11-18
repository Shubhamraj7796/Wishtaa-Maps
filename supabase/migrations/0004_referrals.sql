-- Wishtaa Maps referral programme and free access.  FOR REVIEW: this file has NOT been run anywhere by the assistant.
-- Run it by hand in the Supabase SQL editor (see docs/referrals.md). It needs only Supabase Auth (auth.users); it does not touch the
-- 0003 tables. Undo: supabase/undo/0004_referrals_undo.sql.
--
-- What it stores: who may use "Pro" and until when, a referral code per person, who invited whom (ids and dates only, never an email),
-- the months given, and an append-only log of every grant/freeze/manual change/setting change. Never map content or pictures.
-- Writes happen ONLY inside the functions below (SECURITY DEFINER) or by the owner in the dashboard; the browser can write nothing.
-- The numbers are SETTINGS in public.app_settings (change them in the Table editor; no code change needed):
--   free_months_standard 6 | months_per_referral 1 | max_total_months 24 | reward_delay_days 7 | min_topics_first_map 3
--   referral_claim_hours 24 | launch_date '' (empty = not set; then 2027-03-01T00:00:00Z style, UTC)

-- ================================================================== helpers
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ================================================================== settings
create table public.app_settings (
  key text primary key check (key ~ '^[a-z_]{1,60}$'),
  value text not null default '' check (char_length(value) <= 100),
  description text not null default '',
  updated_at timestamptz not null default now()
);
create trigger app_settings_updated before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('free_months_standard', '6',  'Free months every new account gets (referred or not).'),
  ('months_per_referral',  '1',  'Months added to the REFERRER for each successful referral.'),
  ('max_total_months',     '24', 'The most free months in total (standard + referral months).'),
  ('reward_delay_days',    '7',  'Days between "the friend saved a first real map" and the month being added.'),
  ('min_topics_first_map', '3',  'A first map counts only with at least this many topics.'),
  ('referral_claim_hours', '24', 'A referral code can be attached to an account only this many hours after it was created.'),
  ('launch_date',          '',   'Empty until you decide. Founding members'' free months count from this moment (UTC, e.g. 2027-03-01T00:00:00Z).')
on conflict (key) do nothing;

create or replace function public.setting_int(k text, fallback int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when value ~ '^[0-9]{1,6}$' then value::int end from public.app_settings where key = k), fallback)
$$;

create or replace function public.setting_launch() returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  select value into v from public.app_settings where key = 'launch_date';
  if v is null or btrim(v) = '' then return null; end if;
  return v::timestamptz;
exception when others then
  return null; -- a value that cannot be read counts as "not set"
end $$;

-- Whole calendar months in UTC, added to the START date in one step; a shorter month cuts the day (31 Jan + 1 = 28/29 Feb).
create or replace function public.add_months_utc(ts timestamptz, n int) returns timestamptz
language sql immutable as $$
  select ((ts at time zone 'UTC') + make_interval(months => n)) at time zone 'UTC'
$$;

-- ================================================================== admin role (nothing in the app uses it yet)
-- A TABLE, not a flag on the profile or in user_metadata: a person can edit their own profile and their own user_metadata from the
-- browser, so a flag stored there could be set by anyone. This table has row-level security ON, no policy and no grant: only the
-- owner (SQL editor / service role) can add a row, and only the functions below can look at it.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
$$;

-- ================================================================== plan / entitlement
-- plan 'pro' + a free period = free access to FUTURE premium features. Today it unlocks nothing that exists.
-- clock_start NULL = founding member: the free months count from app_settings.launch_date.
create table public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'pro' check (plan in ('free', 'pro')),
  source text not null default 'signup' check (source in ('signup', 'referral', 'manual')),
  standard_months int not null default 6 check (standard_months between 0 and 120),
  bonus_months int not null default 0 check (bonus_months between 0 and 120),
  clock_start timestamptz,
  pro_until timestamptz,
  frozen boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger entitlements_updated before update on public.entitlements
  for each row execute function public.set_updated_at();

-- ================================================================== referral codes and referrals
-- 8 characters from 31 (no 0 O 1 I L), random, no personal data.
create table public.referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{8}$'),
  created_at timestamptz not null default now()
);

-- Ids and dates only. invited_email_hash = sha256 of the normalised address (lower case, +tag cut, Gmail dots removed): it lets the
-- same person not be rewarded twice with aliases. It is personal data and is described in the Privacy page.
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  invited_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'joined' check (status in ('invited', 'joined', 'qualified', 'rewarded', 'rejected')),
  invited_email_hash text,
  rejected_reason text,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  qualified_at timestamptz,
  rewarded_at timestamptz
);
create index referrals_referrer_idx on public.referrals(referrer_id, status);
create unique index referrals_one_person_idx on public.referrals(invited_email_hash)
  where invited_email_hash is not null and status <> 'rejected';

-- ================================================================== append-only log
-- user_id / actor_id are NOT foreign keys: deleting an account must not be blocked and the log stays as anonymous numbers
-- (the delete trigger below blanks the ids). Nobody can update or delete a row; truncate is blocked too.
create table public.entitlement_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  kind text not null check (kind in ('standard', 'referral', 'cap', 'manual', 'freeze', 'unfreeze', 'setting')),
  months int not null default 0,
  referral_id uuid,
  actor_id uuid,
  actor_kind text not null default 'system' check (actor_kind in ('system', 'user', 'admin', 'owner_sql')),
  note text not null default '' check (char_length(note) <= 300),
  details jsonb,
  created_at timestamptz not null default now()
);
create index entitlement_log_user_idx on public.entitlement_log(user_id, created_at);
-- One reward (or one "cap reached" note) per referral, whatever happens.
create unique index entitlement_log_one_reward_idx on public.entitlement_log(referral_id) where kind in ('referral', 'cap');

create or replace function public.entitlement_log_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and current_setting('wishtaa.anonymize', true) = 'on'
     and new.id = old.id and new.kind = old.kind and new.months = old.months and new.created_at = old.created_at
     and new.referral_id is not distinct from old.referral_id and new.note = old.note and new.details is not distinct from old.details
     and new.actor_kind = old.actor_kind
     and (new.user_id is null or new.user_id = old.user_id) and (new.actor_id is null or new.actor_id = old.actor_id) then
    return new; -- the only change ever allowed: blanking the ids of a deleted account
  end if;
  raise exception 'entitlement_log is append-only';
end $$;
create trigger entitlement_log_no_change before update or delete on public.entitlement_log
  for each row execute function public.entitlement_log_guard();
create trigger entitlement_log_no_truncate before truncate on public.entitlement_log
  for each statement execute function public.entitlement_log_guard();

-- Who did it: a signed-in person (their id), an admin, or the owner in the SQL editor (no id).
create or replace function public.log_actor_kind() returns text
language sql stable security definer set search_path = public as $$
  select case
    when current_setting('wishtaa.system', true) = 'on' then 'system'
    when (select auth.uid()) is null then 'owner_sql'
    when public.is_admin() then 'admin'
    else 'user' end
$$;

-- Every change made outside the functions below (the owner freezing an account, a manual grant in the table editor) is logged here.
create or replace function public.entitlements_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if tg_op = 'INSERT' then
    insert into public.entitlement_log (user_id, kind, months, actor_id, actor_kind, note, details)
    values (new.user_id, 'standard', new.standard_months, (select auth.uid()), public.log_actor_kind(), '',
            jsonb_build_object('clock_start', new.clock_start, 'founding', new.clock_start is null));
    return new;
  end if;
  if current_setting('wishtaa.system', true) = 'on' then return new; end if; -- the functions log their own steps
  if new.frozen is distinct from old.frozen then
    k := case when new.frozen then 'freeze' else 'unfreeze' end;
    insert into public.entitlement_log (user_id, kind, actor_id, actor_kind) values (new.user_id, k, (select auth.uid()), public.log_actor_kind());
  end if;
  if new.plan is distinct from old.plan or new.source is distinct from old.source or new.standard_months is distinct from old.standard_months
     or new.bonus_months is distinct from old.bonus_months or new.clock_start is distinct from old.clock_start then
    insert into public.entitlement_log (user_id, kind, months, actor_id, actor_kind, details)
    values (new.user_id, 'manual', (new.standard_months - old.standard_months) + (new.bonus_months - old.bonus_months), (select auth.uid()), public.log_actor_kind(),
            jsonb_build_object('old', jsonb_build_object('plan', old.plan, 'source', old.source, 'standard', old.standard_months, 'bonus', old.bonus_months, 'clock_start', old.clock_start),
                               'new', jsonb_build_object('plan', new.plan, 'source', new.source, 'standard', new.standard_months, 'bonus', new.bonus_months, 'clock_start', new.clock_start)));
  end if;
  return new;
end $$;
create trigger entitlements_audit_trg after insert or update on public.entitlements
  for each row execute function public.entitlements_audit();

create or replace function public.settings_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then return new; end if;
  insert into public.entitlement_log (user_id, kind, actor_id, actor_kind, details)
  values (null, 'setting', (select auth.uid()), public.log_actor_kind(),
          jsonb_build_object('key', new.key, 'old', case when tg_op = 'UPDATE' then old.value end, 'new', new.value));
  return new;
end $$;
create trigger app_settings_audit_trg after insert or update on public.app_settings
  for each row execute function public.settings_audit();

-- ================================================================== internal functions (never callable from the browser)
create or replace function public.norm_email(e text) returns text
language plpgsql immutable as $$
declare l text := lower(btrim(coalesce(e, ''))); loc text; dom text;
begin
  if position('@' in l) = 0 then return null; end if;
  loc := split_part(split_part(l, '@', 1), '+', 1);
  dom := split_part(l, '@', 2);
  if dom in ('gmail.com', 'googlemail.com') then loc := replace(loc, '.', ''); dom := 'gmail.com'; end if;
  return loc || '@' || dom;
end $$;

create or replace function public.email_hash(e text) returns text
language sql immutable as $$
  select case when public.norm_email(e) is null then null else encode(sha256(convert_to(public.norm_email(e), 'UTF8')), 'hex') end
$$;

create or replace function public.make_referral_code() returns text
language plpgsql volatile as $$
declare alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := uuid_send(gen_random_uuid()); out text := ''; i int;
begin
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function public.ensure_referral_code(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare tries int := 0;
begin
  if exists (select 1 from public.referral_codes where user_id = uid) then return; end if;
  loop
    begin
      insert into public.referral_codes (user_id, code) values (uid, public.make_referral_code());
      return;
    exception when unique_violation then
      if exists (select 1 from public.referral_codes where user_id = uid) then return; end if;
      tries := tries + 1;
      if tries > 10 then raise; end if;
    end;
  end loop;
end $$;

-- Gives an account its standard free period the first time it is needed (new accounts, and every existing one: "founding members").
-- Joined after the launch date: counts from the sign-up day. Joined before it (or no launch date yet): counts from the launch date.
create or replace function public.ensure_entitlement(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare created timestamptz; launch timestamptz;
begin
  select created_at into created from auth.users where id = uid;
  if created is null then return; end if;
  if not exists (select 1 from public.entitlements where user_id = uid) then
    launch := public.setting_launch();
    perform set_config('wishtaa.system', 'on', true);
    insert into public.entitlements (user_id, plan, source, standard_months, clock_start)
    values (uid, 'pro', 'signup', public.setting_int('free_months_standard', 6), case when launch is not null and created >= launch then created end)
    on conflict (user_id) do nothing;
    perform set_config('wishtaa.system', 'off', true);
  end if;
  perform public.ensure_referral_code(uid);
end $$;

create or replace function public.refresh_entitlement(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.entitlements; start timestamptz; want timestamptz;
begin
  select * into e from public.entitlements where user_id = uid;
  if not found then return; end if;
  start := coalesce(e.clock_start, public.setting_launch());
  want := case when start is null then null else public.add_months_utc(start, e.standard_months + e.bonus_months) end;
  if e.pro_until is distinct from want then
    perform set_config('wishtaa.system', 'on', true);
    update public.entitlements set pro_until = want where user_id = uid;
    perform set_config('wishtaa.system', 'off', true);
  end if;
end $$;

-- Adds the months of every referral whose waiting time is over. Lazy: it runs when the referrer opens the panel or signs in.
-- The cap is applied HERE, at grant time (lowering the setting later never takes granted months away).
create or replace function public.grant_due_rewards(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e public.entitlements; r record; per int; cap int; delay int; room int; add int; bonus int; changed boolean := false;
begin
  select * into e from public.entitlements where user_id = uid for update;
  if not found or e.frozen then return; end if;
  per := public.setting_int('months_per_referral', 1);
  cap := public.setting_int('max_total_months', 24);
  delay := public.setting_int('reward_delay_days', 7);
  bonus := e.bonus_months;
  perform set_config('wishtaa.system', 'on', true);
  for r in
    select rf.id from public.referrals rf
    where rf.referrer_id = uid and rf.status = 'qualified' and rf.qualified_at + make_interval(days => delay) <= now()
      and not exists (select 1 from public.entitlements i where i.user_id = rf.invited_id and i.frozen)
    order by rf.qualified_at for update
  loop
    room := greatest(0, cap - e.standard_months - bonus);
    add := least(per, room);
    update public.referrals set status = 'rewarded', rewarded_at = now() where id = r.id and status = 'qualified';
    if found then
      insert into public.entitlement_log (user_id, kind, months, referral_id, actor_kind, note)
      values (uid, case when add > 0 then 'referral' else 'cap' end, add, r.id, 'system', case when add > 0 then '' else 'maximum free period reached' end)
      on conflict do nothing;
      bonus := bonus + add;
      changed := true;
    end if;
  end loop;
  if changed then
    update public.entitlements set bonus_months = bonus, source = case when bonus > e.bonus_months then 'referral' else e.source end where user_id = uid;
  end if;
  perform set_config('wishtaa.system', 'off', true);
end $$;

create or replace function public.plan_json(uid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.entitlements; cap int := public.setting_int('max_total_months', 24);
begin
  select * into e from public.entitlements where user_id = uid;
  if not found then return null; end if;
  return jsonb_build_object('plan', e.plan, 'source', e.source, 'freeUntil', e.pro_until, 'founding', e.clock_start is null,
    'monthsTotal', e.standard_months + e.bonus_months, 'bonusMonths', e.bonus_months,
    'capReached', e.standard_months + e.bonus_months >= cap);
end $$;

-- ================================================================== functions the signed-in person can call
create or replace function public.my_plan() returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'not signed in'; end if;
  perform public.ensure_entitlement(uid);
  perform public.grant_due_rewards(uid);
  perform public.refresh_entitlement(uid);
  return public.plan_json(uid);
end $$;

-- Counts only. Never who the invited people are.
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

-- Attach a code to the NEW account of the caller. Anything wrong (bad shape, unknown, own, too late, already referred) = 'ignored', no error.
create or replace function public.claim_referral(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); c text := upper(btrim(coalesce(p_code, ''))); me record; ref uuid; ref_email text; h text; hours int;
begin
  if uid is null or c !~ '^[A-HJKMNP-Z2-9]{8}$' then return 'ignored'; end if;
  select id, email, created_at, email_confirmed_at into me from auth.users where id = uid;
  hours := public.setting_int('referral_claim_hours', 24);
  if me.id is null or me.created_at < now() - make_interval(hours => hours) then return 'ignored'; end if;
  if exists (select 1 from public.referrals where invited_id = uid) then return 'ignored'; end if;
  select user_id into ref from public.referral_codes where code = c;
  if ref is null or ref = uid then return 'ignored'; end if;
  select email into ref_email from auth.users where id = ref;
  h := public.email_hash(me.email);
  perform public.ensure_entitlement(uid);
  if h is not null and h = public.email_hash(ref_email) then
    insert into public.referrals (referrer_id, invited_id, status, rejected_reason) values (ref, uid, 'rejected', 'same person (address alias)');
    return 'ignored';
  end if;
  if h is not null and exists (select 1 from public.referrals where invited_email_hash = h and status <> 'rejected') then return 'ignored'; end if;
  insert into public.referrals (referrer_id, invited_id, status, invited_email_hash, joined_at)
  values (ref, uid, case when me.email_confirmed_at is not null then 'joined' else 'invited' end, h, case when me.email_confirmed_at is not null then now() end);
  return 'claimed';
end $$;

-- "The first saved map": the app sends ONE number (how many topics the map has), nothing else. Qualifies the caller's referral when the
-- email is confirmed and the map has enough topics (app_settings.min_topics_first_map). Safe to call again and again.
create or replace function public.record_first_map(p_topics int) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid := (select auth.uid()); r public.referrals; confirmed boolean;
begin
  if uid is null then return 'none'; end if;
  select * into r from public.referrals where invited_id = uid and status in ('invited', 'joined') for update;
  if not found then return 'none'; end if;
  select email_confirmed_at is not null into confirmed from auth.users where id = uid;
  if not coalesce(confirmed, false) or coalesce(p_topics, 0) < public.setting_int('min_topics_first_map', 3) then return 'waiting'; end if;
  update public.referrals set status = 'qualified', qualified_at = now(), joined_at = coalesce(joined_at, now()) where id = r.id;
  return 'qualified';
end $$;

-- ================================================================== new accounts, and deleting an account
-- A failure here must NEVER block a sign-up: the plan is also created on first use (my_plan), so errors are only a warning.
create or replace function public.handle_new_user_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.ensure_entitlement(new.id);
  exception when others then
    raise warning 'wishtaa: plan not created at sign-up (%), it will be created on first use', sqlerrm;
  end;
  return new;
end $$;
create trigger on_auth_user_created_plan after insert on auth.users
  for each row execute function public.handle_new_user_plan();

-- Before the account goes: blank its id in the append-only log (the log stays as anonymous numbers).
create or replace function public.anonymize_log_on_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('wishtaa.anonymize', 'on', true);
  update public.entitlement_log
     set user_id = case when user_id = old.id then null else user_id end,
         actor_id = case when actor_id = old.id then null else actor_id end
   where user_id = old.id or actor_id = old.id;
  perform set_config('wishtaa.anonymize', 'off', true);
  return old;
end $$;
create trigger before_auth_user_deleted_log before delete on auth.users
  for each row execute function public.anonymize_log_on_delete();

-- ================================================================== RLS (default deny) and grants
alter table public.app_settings    enable row level security;
alter table public.admin_users     enable row level security;
alter table public.entitlements    enable row level security;
alter table public.referral_codes  enable row level security;
alter table public.referrals       enable row level security;
alter table public.entitlement_log enable row level security;

revoke all on public.app_settings, public.admin_users, public.entitlements, public.referral_codes, public.referrals, public.entitlement_log from anon, authenticated, public;
-- The signed-in person may READ: the settings, their own plan row (without the "frozen" column) and their own code. Nothing else, and no writes at all.
grant select on public.app_settings to authenticated;
grant select (user_id, plan, source, standard_months, bonus_months, clock_start, pro_until, created_at, updated_at) on public.entitlements to authenticated;
grant select on public.referral_codes to authenticated;

create policy settings_read on public.app_settings for select to authenticated using (true);
create policy entitlements_own on public.entitlements for select to authenticated using (user_id = (select auth.uid()));
create policy codes_own on public.referral_codes for select to authenticated using (user_id = (select auth.uid()));
-- referrals, entitlement_log and admin_users have NO policy: invisible to the browser (counts come from my_referral_summary()).

-- Functions: nothing is callable by default; only the five below are open to a signed-in person.
revoke all on function public.setting_int(text, int), public.setting_launch(), public.add_months_utc(timestamptz, int), public.is_admin(),
  public.log_actor_kind(), public.norm_email(text), public.email_hash(text), public.make_referral_code(), public.ensure_referral_code(uuid),
  public.ensure_entitlement(uuid), public.refresh_entitlement(uuid), public.grant_due_rewards(uuid), public.plan_json(uuid),
  public.my_plan(), public.my_referral_summary(), public.claim_referral(text), public.record_first_map(int),
  public.entitlement_log_guard(), public.entitlements_audit(), public.settings_audit(), public.handle_new_user_plan(), public.anonymize_log_on_delete()
  from public, anon, authenticated;
grant execute on function public.my_plan(), public.my_referral_summary(), public.claim_referral(text), public.record_first_map(int), public.is_admin() to authenticated;

-- ================================================================== OPTIONAL backfill (commented, for your review)
-- Not needed: every existing account gets the same founding-member offer the first time it signs in (my_plan() creates the row).
-- Run this only if you want the rows (and the owner counts) to exist for all accounts right now. Safe to run twice.
-- insert into public.entitlements (user_id, plan, source, standard_months, clock_start)
-- select u.id, 'pro', 'signup', public.setting_int('free_months_standard', 6),
--        case when public.setting_launch() is not null and u.created_at >= public.setting_launch() then u.created_at end
--   from auth.users u
-- on conflict (user_id) do nothing;
-- select public.ensure_referral_code(id) from auth.users;
