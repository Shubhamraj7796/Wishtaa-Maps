-- Row-level security for every table. Default deny; policies grant access.

-- Role of the current user on a map (null = no access). SECURITY DEFINER so
-- policies on maps/collaborators can call it without recursing into themselves.
create or replace function public.map_role(p_map uuid) returns public.collab_role
language sql stable security definer set search_path = public as $$
  select case
    when m.owner_id = auth.uid() then 'owner'::public.collab_role
    else (select c.role from public.collaborators c
          where c.map_id = m.id and c.user_id = auth.uid())
  end
  from public.maps m where m.id = p_map
$$;

create or replace function public.can_read_map(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.map_role(p_map) is not null
      or exists (select 1 from public.maps m
                 where m.id = p_map and m.is_public
                   and m.share_password_hash is null and m.deleted_at is null)
$$;

create or replace function public.can_edit_map(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.map_role(p_map) in ('owner', 'editor')
$$;

create or replace function public.can_comment_map(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.map_role(p_map) in ('owner', 'editor', 'commenter')
$$;

alter table public.folders        enable row level security;
alter table public.maps           enable row level security;
alter table public.collaborators  enable row level security;
alter table public.pages          enable row level security;
alter table public.topics         enable row level security;
alter table public.relationships  enable row level security;
alter table public.boundaries     enable row level security;
alter table public.summaries      enable row level security;
alter table public.callouts       enable row level security;
alter table public.map_versions   enable row level security;
alter table public.templates      enable row level security;
alter table public.comments       enable row level security;
alter table public.gallery_items  enable row level security;
alter table public.gallery_likes  enable row level security;
alter table public.ai_usage       enable row level security;

-- folders: owner only
create policy folders_all on public.folders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- maps
create policy maps_select on public.maps for select
  using (public.can_read_map(id));
create policy maps_insert on public.maps for insert
  with check (owner_id = auth.uid());
create policy maps_update on public.maps for update
  using (public.can_edit_map(id)) with check (public.can_edit_map(id));
create policy maps_delete on public.maps for delete
  using (owner_id = auth.uid());

-- Editors may change content but not ownership or sharing settings.
create or replace function public.guard_map_owner_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is distinct from old.owner_id and (
       new.owner_id is distinct from old.owner_id
    or new.is_public is distinct from old.is_public
    or new.share_token is distinct from old.share_token
    or new.share_password_hash is distinct from old.share_password_hash
    or new.deleted_at is distinct from old.deleted_at
    or new.folder_id is distinct from old.folder_id) then
    raise exception 'only the owner can change ownership, sharing, trash or folder';
  end if;
  return new;
end $$;
create trigger maps_guard before update on public.maps
  for each row execute function public.guard_map_owner_fields();

-- collaborators: members can see the list; only the owner manages; anyone can leave.
create policy collab_select on public.collaborators for select
  using (public.map_role(map_id) is not null);
create policy collab_insert on public.collaborators for insert
  with check (public.map_role(map_id) = 'owner');
create policy collab_update on public.collaborators for update
  using (public.map_role(map_id) = 'owner') with check (public.map_role(map_id) = 'owner');
create policy collab_delete on public.collaborators for delete
  using (public.map_role(map_id) = 'owner' or user_id = auth.uid());

-- content tables: read if you can read the map, write if you can edit it.
do $$
declare t text;
begin
  foreach t in array array['pages','topics','relationships','boundaries','summaries','callouts']
  loop
    execute format('create policy %I on public.%I for select using (public.can_read_map(map_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert with check (public.can_edit_map(map_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update using (public.can_edit_map(map_id)) with check (public.can_edit_map(map_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete using (public.can_edit_map(map_id))', t || '_delete', t);
  end loop;
end $$;

-- version history
create policy versions_select on public.map_versions for select
  using (public.can_read_map(map_id));
create policy versions_insert on public.map_versions for insert
  with check (public.can_edit_map(map_id));
create policy versions_delete on public.map_versions for delete
  using (public.map_role(map_id) = 'owner');

-- comments
create policy comments_select on public.comments for select
  using (public.can_read_map(map_id));
create policy comments_insert on public.comments for insert
  with check (public.can_comment_map(map_id) and author_id = auth.uid());
create policy comments_update on public.comments for update
  using (author_id = auth.uid() or public.can_edit_map(map_id))
  with check (author_id = auth.uid() or public.can_edit_map(map_id));
create policy comments_delete on public.comments for delete
  using (author_id = auth.uid() or public.map_role(map_id) = 'owner');

-- templates: official ones are public, user ones are private to the owner.
create policy templates_select on public.templates for select
  using (is_official or owner_id = auth.uid());
create policy templates_write on public.templates for all
  using (owner_id = auth.uid() and not is_official)
  with check (owner_id = auth.uid() and not is_official);

-- gallery: public to read; publish only maps you own.
create policy gallery_select on public.gallery_items for select using (true);
create policy gallery_insert on public.gallery_items for insert
  with check (published_by = auth.uid() and public.map_role(map_id) = 'owner');
create policy gallery_update on public.gallery_items for update
  using (published_by = auth.uid()) with check (published_by = auth.uid());
create policy gallery_delete on public.gallery_items for delete
  using (published_by = auth.uid());

create policy likes_select on public.gallery_likes for select using (true);
create policy likes_insert on public.gallery_likes for insert with check (user_id = auth.uid());
create policy likes_delete on public.gallery_likes for delete using (user_id = auth.uid());

-- ai_usage: users read their own; writes come from the service role only.
create policy ai_usage_select on public.ai_usage for select using (user_id = auth.uid());
