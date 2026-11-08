# Wishtaa Maps

Web mind-mapping tool: no topic cap, no export watermark. Original product; EdrawMind is a feature reference only.

## Setup

```bash
npm install
cp .env.example .env     # fill in Supabase values; never commit .env
npm run dev
```

## Scripts

`npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run build`

## Database

Migrations are in `supabase/migrations`. Apply with the Supabase CLI
(`supabase link --project-ref <ref>` then `supabase db push`) or paste each file into the SQL editor in order.

## Accounts

Optional sign-in (emailed code, password, Google) via Supabase Auth. Off until `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set; the app works as a guest without them. Dashboard steps: `docs/auth-setup.md`. Run `supabase/migrations/0003_accounts.sql` for the account tables.

## Docs

`docs/data-model.md`. Layout engine docs arrive in Phase 2. See `CHANGELOG.md` for progress.
