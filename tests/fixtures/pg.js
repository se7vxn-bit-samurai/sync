/**
 * Real Postgres for database tests, with no server: PGlite (Postgres compiled to WebAssembly).
 *
 * A small shim stands in for what Supabase provides (the anon / authenticated roles, auth.users,
 * auth.uid()), then the repository's own migration files are applied unchanged. Calls made "as" a
 * user run in a transaction under the authenticated role with that user's id as the JWT subject,
 * exactly how PostgREST runs them, so row-level security and function grants are really enforced.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIGRATIONS = path.join(__dirname, '..', '..', 'supabase', 'migrations');

const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
`;

// The live project's workspaces table and the team-sharing scaffold it had before the org layer,
// as the retire migration finds them.
const LEGACY_TEAM_SHARING = `
create table public.teams (id uuid primary key default gen_random_uuid(), name text not null, created_by uuid not null, created_at timestamptz default now());
create table public.team_members (team_id uuid references public.teams(id), user_id uuid not null, role text not null default 'member', joined_at timestamptz default now(), primary key (team_id, user_id));
create table public.workspaces (id uuid primary key default gen_random_uuid(), owner_user_id uuid, team_id uuid references public.teams(id),
  department_key text not null default 'default', data jsonb not null default '{}', updated_at timestamptz not null default now(), version bigint not null default 1);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.workspaces enable row level security;
create function private.is_team_member(p_team_id uuid) returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from public.team_members m where m.team_id = p_team_id and m.user_id = auth.uid())
$$;
create function private.is_team_owner(p_team_id uuid) returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from public.team_members m where m.team_id = p_team_id and m.user_id = auth.uid() and m.role = 'owner')
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_team_member(uuid), private.is_team_owner(uuid) to authenticated;
create policy teams_select on public.teams for select using ((created_by = (select auth.uid())) or private.is_team_member(id));
create policy team_members_select on public.team_members for select using ((user_id = (select auth.uid())) or private.is_team_member(team_id));
create policy workspaces_select on public.workspaces for select using ((owner_user_id = (select auth.uid())) or private.is_team_member(team_id));
create policy workspaces_insert on public.workspaces for insert with check ((owner_user_id = (select auth.uid())) or private.is_team_member(team_id));
create policy workspaces_update on public.workspaces for update using ((owner_user_id = (select auth.uid())) or private.is_team_member(team_id));
create policy workspaces_delete on public.workspaces for delete using ((owner_user_id = (select auth.uid())) or private.is_team_owner(team_id));
grant select, insert, update, delete on public.workspaces, public.teams, public.team_members to authenticated;
`;

function migrationFiles(names) {
  const all = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  return names ? all.filter((f) => names.some((n) => f.includes(n))) : all;
}

/** A fresh database with the shim and the given migrations (by name fragment) applied in order. */
async function freshDb({ migrations = ['core_org'], legacy = false } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  if (legacy) await db.exec(LEGACY_TEAM_SHARING);
  for (const file of migrationFiles(migrations)) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

/** Adds a signed-up user. Google sign-in emails are verified; pass confirmed: false for one that is not. */
async function addUser(db, email, { confirmed = true } = {}) {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users (id, email, email_confirmed_at) values ($1, $2, $3)', [id, email, confirmed ? new Date().toISOString() : null]);
  return id;
}

/** Runs SQL as a signed-in user (or anonymously with uid null), under row-level security. */
async function as(db, uid, sql, params = []) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`, [uid ? 'authenticated' : 'anon', uid || '']);
    return tx.query(sql, params);
  });
}

/** Calls a public.org_* function as a user and returns its JSON result. Throws the raised message. */
async function rpc(db, uid, fn, args = {}) {
  const keys = Object.keys(args);
  const sql = `select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as out`;
  const res = await as(db, uid, sql, keys.map((k) => args[k]));
  return res.rows[0].out;
}

/** The message of the error a call raises, or null if it succeeded. */
async function errorOf(promise) {
  try {
    await promise;
    return null;
  } catch (err) {
    return String(err && err.message);
  }
}

const isoDay = (offset = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

module.exports = { freshDb, addUser, as, rpc, errorOf, isoDay, migrationFiles };
