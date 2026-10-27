-- PROPOSED, NOT APPLIED. Kept outside supabase/migrations so nothing runs it until it is reviewed.
-- Lets the cloud store everything the app shell needs: knowledge bases, thumbnails, starred/trashed folders,
-- and links between files. See docs/files-model.md.

create type public.file_kind as enum ('map', 'kb');
create type public.storage_kind as enum ('cloud', 'drive');

alter table public.maps
  add column kind public.file_kind not null default 'map',
  add column storage public.storage_kind not null default 'cloud',
  add column thumbnail text,                                   -- small SVG data URL, or a Storage path
  add column trashed_root uuid;                                -- the folder/map that was deleted together with this one

alter table public.folders
  add column is_favourite boolean not null default false,
  add column deleted_at timestamptz,
  add column trashed_root uuid,
  add column updated_at timestamptz not null default now();

create trigger folders_updated before update on public.folders
  for each row execute function public.set_updated_at();

create index maps_kind_idx on public.maps(owner_id, kind) where deleted_at is null;

-- A topic that links to another map or knowledge base (and optionally to one of its topics).
create table public.topic_links (
  source_map_id uuid not null references public.maps(id) on delete cascade,
  source_topic_id text not null,                               -- topic ids live in the Yjs document
  target_map_id uuid not null references public.maps(id) on delete cascade,
  target_topic_id text
);
create unique index topic_links_unique on public.topic_links(source_map_id, source_topic_id, target_map_id, coalesce(target_topic_id, ''));
create index topic_links_target_idx on public.topic_links(target_map_id);

alter table public.topic_links enable row level security;

-- Visible to anyone who can read the source map; written by the source map's editors (same helpers as 0002_rls.sql).
create policy topic_links_read on public.topic_links for select
  using (public.can_read_map(source_map_id));
create policy topic_links_write on public.topic_links for all
  using (public.can_edit_map(source_map_id))
  with check (public.can_edit_map(source_map_id));
