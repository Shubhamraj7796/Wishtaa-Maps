-- Wishtaamaps core schema. RLS lives in 0002_rls.sql.
create extension if not exists pgcrypto;

create type public.collab_role as enum ('owner', 'editor', 'commenter', 'viewer');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.folders(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.maps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.folders(id) on delete set null,
  title text not null default 'Untitled map' check (char_length(title) <= 300),
  theme text not null default 'default',
  layout text not null default 'mindmap',
  is_public boolean not null default false,
  share_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  share_password_hash text,
  is_favourite boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maps_owner_idx on public.maps(owner_id) where deleted_at is null;
create trigger maps_updated before update on public.maps
  for each row execute function public.set_updated_at();

create table public.collaborators (
  map_id uuid not null references public.maps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.collab_role not null check (role <> 'owner'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

-- A map has pages (tabs). ydoc holds the Yjs snapshot for fast load.
create table public.pages (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  title text not null default 'Page 1',
  position integer not null default 0,
  ydoc bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pages_map_idx on public.pages(map_id);
create trigger pages_updated before update on public.pages
  for each row execute function public.set_updated_at();

-- Normalised topic rows power search, tasks (Kanban/Gantt) and gallery copies.
create table public.topics (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  parent_id uuid references public.topics(id) on delete cascade,
  position integer not null default 0,
  text text not null default '',
  collapsed boolean not null default false,
  style jsonb not null default '{}'::jsonb,
  marks jsonb not null default '[]'::jsonb,
  note text not null default '',
  tags text[] not null default '{}',
  task jsonb,
  link text,
  attachments jsonb not null default '[]'::jsonb,
  image text,
  "table" jsonb,
  latex text,
  floating_position jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index topics_map_idx on public.topics(map_id);
create index topics_page_idx on public.topics(page_id);
create index topics_parent_idx on public.topics(parent_id);
create trigger topics_updated before update on public.topics
  for each row execute function public.set_updated_at();

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  from_topic uuid not null references public.topics(id) on delete cascade,
  to_topic uuid not null references public.topics(id) on delete cascade,
  label text not null default '',
  style jsonb not null default '{}'::jsonb
);

create table public.boundaries (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  topic_ids uuid[] not null default '{}',
  shape text not null default 'rounded',
  style jsonb not null default '{}'::jsonb
);

create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  parent_topic_id uuid not null references public.topics(id) on delete cascade,
  from_position integer not null,
  to_position integer not null,
  text text not null default '',
  style jsonb not null default '{}'::jsonb
);

create table public.callouts (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  page_id uuid not null references public.pages(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  text text not null default '',
  style jsonb not null default '{}'::jsonb
);

create table public.map_versions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  label text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index map_versions_map_idx on public.map_versions(map_id, created_at desc);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  title text not null,
  category text not null default 'general',
  data jsonb not null,
  is_official boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_map_idx on public.comments(map_id);

create table public.gallery_items (
  map_id uuid primary key references public.maps(id) on delete cascade,
  published_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  published_at timestamptz not null default now()
);

create table public.gallery_likes (
  map_id uuid not null references public.gallery_items(map_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

-- Written by server functions only (service role). Used for AI rate limits.
create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index ai_usage_user_idx on public.ai_usage(user_id, created_at desc);
