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
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
-- As on Supabase: whatever is created in public is granted to the API roles by default, and row-level
-- security (plus explicit revokes) is what restricts it.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

function migrationFiles(names) {
  const all = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  return names ? all.filter((f) => names.some((n) => f.includes(n))) : all;
}

/**
 * A fresh database with the shim and migrations applied in order: those whose names contain one of
 * the given fragments, or every migration in the folder when `migrations` is null.
 */
async function freshDb({ migrations = ['core_org'] } = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const file of migrationFiles(migrations)) {
    await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  return db;
}

/** Adds a signed-up user. Google sign-in emails are verified; pass confirmed: false for one that is not. */
async function addUser(db, email, { confirmed = true, id = crypto.randomUUID() } = {}) {
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

/**
 * What the in-page Supabase double sends for sb.rpc(fn, args) (tests/fixtures/fake-supabase.js),
 * answered by the real function. Arrays become Postgres array literals and objects JSON, as
 * PostgREST would convert them. Returns { data } or { error: { message } }.
 */
async function rpcFromClient(db, uid, fn, args = {}) {
  const toParam = (v) => (Array.isArray(v) ? `{${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(',')}}` : v && typeof v === 'object' ? JSON.stringify(v) : v);
  const clean = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === undefined ? null : toParam(v)]));
  try {
    return { data: await rpc(db, uid, fn, clean) };
  } catch (err) {
    return { error: { message: String(err && err.message) } };
  }
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

/** Applies one migration file again (to check it is idempotent). */
async function reapply(db, fragment) {
  for (const file of migrationFiles([fragment])) await db.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
}

module.exports = { freshDb, addUser, as, rpc, rpcFromClient, errorOf, isoDay, migrationFiles, reapply };
