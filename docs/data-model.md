# Data model

Source of truth: `supabase/migrations/0001_schema.sql`. TypeScript mirror: `src/core/model/types.ts`.

## Tables

| Table | Purpose |
|---|---|
| `maps` | One row per file. Owner, title, theme, layout, sharing (`is_public`, `share_token`, optional password hash), trash (`deleted_at`). |
| `pages` | Tabs inside a map. Holds the Yjs snapshot (`ydoc`). |
| `topics` | Normalised topic rows (search, Kanban, Gantt, gallery copy). `position` = sibling order. |
| `relationships`, `boundaries`, `summaries`, `callouts` | Extra diagram objects, per page. |
| `map_versions` | Snapshots for version history. |
| `collaborators` | `(map, user, role)`. The owner is `maps.owner_id`, never a row here. |
| `comments` | Threaded, optionally anchored to a topic, with `resolved`. |
| `folders`, `templates`, `gallery_items`, `gallery_likes` | Dashboard organisation and public gallery. |
| `ai_usage` | Server-written token log for rate limits. |

## Access model (0002_rls.sql)

Roles: owner, editor, commenter, viewer. Helper functions `map_role`, `can_read_map`, `can_edit_map`, `can_comment_map`.

- Read: any role, or the map is public **and has no share password**.
- Write content: owner or editor.
- Comment: owner, editor, commenter.
- Ownership, sharing, trash and folder changes: owner only (enforced by trigger `maps_guard`).
- Password-protected links are verified by a server function (Phase 4), never by the client.
- `ai_usage` can only be written with the service-role key.
