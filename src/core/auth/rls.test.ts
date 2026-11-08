import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Runs the real migration (supabase/migrations/0003_accounts.sql) in an in-process Postgres with a stand-in for Supabase's `auth`
 * schema, then acts as different people (role `authenticated`, `request.jwt.claim.sub` = their id) and as a visitor (`anon`).
 */
const A = '00000000-0000-0000-0000-00000000000a'
const B = '00000000-0000-0000-0000-00000000000b'

let db: PGlite

async function as<T>(uid: string | null, run: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'}`)
  try {
    return await run()
  } finally {
    await db.exec('reset role')
  }
}
const rows = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role authenticated nologin; create role anon nologin;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    grant usage on schema public to authenticated, anon;
  `)
  await db.exec(readFileSync('supabase/migrations/0003_accounts.sql', 'utf8'))
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${A}', 'alice@example.com', '{"full_name":"Alice A","avatar_url":"https://x/a.png"}'),
      ('${B}', 'bob@example.com', '{}');
  `)
  await as(A, async () => {
    await db.exec(`
      update public.profiles set display_name = 'Alice' where id = '${A}';
      insert into public.user_preferences (user_id, data) values ('${A}', '{"theme":"dark"}');
      insert into public.recent_files (user_id, file_ref, title, storage_kind) values ('${A}', 'f1', 'Alice map', 'local');
      insert into public.drive_links (user_id, google_email) values ('${A}', 'alice@gmail.com');
    `)
  })
}, 60_000)

afterAll(async () => {
  await db.close()
})

describe('profile creation', () => {
  it('creates a profile the moment an account exists, from the sign-in details', async () => {
    const p = await rows(`select id, display_name from public.profiles order by id`)
    expect(p).toHaveLength(2)
    expect(p[1]).toMatchObject({ id: B, display_name: 'bob' }) // no name given: the part of the email before the @
  })
})

describe('owner-only access (a second person never sees the first person\'s rows)', () => {
  const tables = ['public.profiles', 'public.user_preferences', 'public.recent_files', 'public.drive_links']
  for (const t of tables) {
    it(`${t}: the owner sees their row, the other person sees none`, async () => {
      expect((await as(A, () => rows(`select * from ${t}`))).length).toBe(1)
      const seenByB = await as(B, () => rows(`select * from ${t}`))
      expect(seenByB.every((r) => r.id === B || r.user_id === B)).toBe(true)
      expect(seenByB.length).toBeLessThanOrEqual(1)
    })
    it(`${t}: a visitor who is not signed in is refused`, async () => {
      await expect(as(null, () => rows(`select * from ${t}`))).rejects.toThrow(/permission denied/)
    })
  }

  it('cannot read or change the first person\'s rows by naming them', async () => {
    await as(B, async () => {
      expect(await rows(`select * from public.recent_files where user_id = '${A}'`)).toHaveLength(0)
      expect(await rows(`update public.recent_files set title = 'hacked' where user_id = '${A}' returning id`)).toHaveLength(0)
      expect(await rows(`delete from public.recent_files where user_id = '${A}' returning id`)).toHaveLength(0)
      expect(await rows(`update public.user_preferences set data = '{"x":1}' where user_id = '${A}' returning user_id`)).toHaveLength(0)
      expect(await rows(`update public.profiles set display_name = 'hacked' where id = '${A}' returning id`)).toHaveLength(0)
      expect(await rows(`delete from public.drive_links where user_id = '${A}' returning user_id`)).toHaveLength(0)
    })
    expect(await rows(`select title from public.recent_files where user_id = '${A}'`)).toEqual([{ title: 'Alice map' }])
    expect(await rows(`select display_name from public.profiles where id = '${A}'`)).toEqual([{ display_name: 'Alice' }])
  })

  it('cannot write a row that belongs to someone else', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into public.recent_files (user_id, file_ref, storage_kind) values ('${A}', 'evil', 'local')`)).rejects.toThrow(/row-level security/)
      await expect(db.exec(`insert into public.user_preferences (user_id) values ('${A}')`)).rejects.toThrow(/row-level security/)
      await expect(db.exec(`insert into public.drive_links (user_id) values ('${A}')`)).rejects.toThrow(/row-level security/)
    })
  })

  it('cannot hand their own row to someone else', async () => {
    await as(B, async () => {
      await db.exec(`insert into public.recent_files (user_id, file_ref, storage_kind) values ('${B}', 'b1', 'local')`)
      await expect(db.exec(`update public.recent_files set user_id = '${A}' where file_ref = 'b1'`)).rejects.toThrow(/row-level security/)
      await expect(db.exec(`update public.profiles set id = '${A}' where id = '${B}'`)).rejects.toThrow()
    })
  })

  it('a profile cannot be created or deleted from the browser, only edited', async () => {
    await as(B, async () => {
      await expect(db.exec(`delete from public.profiles where id = '${B}'`)).rejects.toThrow(/permission denied/)
    })
  })
})

describe('data rules', () => {
  it('preferences must be a small JSON object', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into public.user_preferences (user_id, data) values ('${B}', '[1,2]')`)).rejects.toThrow(/check constraint/)
      await expect(db.exec(`insert into public.user_preferences (user_id, data) values ('${B}', '{"big":"${'x'.repeat(70_000)}"}')`)).rejects.toThrow(/check constraint/)
      await db.exec(`insert into public.user_preferences (user_id, version, data) values ('${B}', 2, '{"theme":"light"}')`)
    })
  })
  it('a Drive file needs its Drive id, and the same file is listed once', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into public.recent_files (user_id, file_ref, storage_kind) values ('${B}', 'd1', 'drive')`)).rejects.toThrow(/check constraint/)
      await db.exec(`insert into public.recent_files (user_id, file_ref, storage_kind, drive_file_id) values ('${B}', 'd1', 'drive', 'abc')`)
      await expect(db.exec(`insert into public.recent_files (user_id, file_ref, storage_kind, drive_file_id) values ('${B}', 'd1', 'drive', 'abc')`)).rejects.toThrow(/duplicate key/)
      await expect(db.exec(`insert into public.recent_files (user_id, file_ref, storage_kind) values ('${B}', 'x', 'cloud')`)).rejects.toThrow(/check constraint/)
    })
  })
  it('the Drive link status is one of the known values', async () => {
    await as(B, async () => {
      await expect(db.exec(`insert into public.drive_links (user_id, status) values ('${B}', 'whatever')`)).rejects.toThrow(/check constraint/)
      await db.exec(`insert into public.drive_links (user_id, google_email, status) values ('${B}', 'bob@gmail.com', 'needs_reconnect')`)
    })
  })
})

describe('delete account', () => {
  it('needs a signed-in person', async () => {
    await expect(as(null, () => rows(`select public.delete_my_account()`))).rejects.toThrow(/permission denied/)
  })
  it('removes the account and all of that person\'s rows, and nobody else\'s', async () => {
    await as(B, () => rows(`select public.delete_my_account()`))
    expect(await rows(`select id from auth.users`)).toEqual([{ id: A }])
    for (const t of ['public.profiles', 'public.user_preferences', 'public.recent_files', 'public.drive_links']) {
      const left = await rows(`select * from ${t}`)
      expect(left.every((r) => r.id === A || r.user_id === A)).toBe(true)
    }
  })
})
