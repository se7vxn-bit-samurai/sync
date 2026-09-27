const { test, expect } = require('@playwright/test');
const { freshDb, addUser, as, rpc, errorOf, isoDay, reapply } = require('./fixtures/pg');

// MirrorFlow Core (supabase/migrations/*_core_org.sql) against real Postgres (PGlite), with
// row-level security and grants enforced as PostgREST would. No browser: one project is enough.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-chromium', 'database tests run once'));

// Claims department: Gina (GM, creates the org) > Mo (manager) > Ada, Omar (TLs).
// Ada: Zanele (YAT), Ben. Omar: Kim, Pat.
const FROM = '2026-01-01';
const PEOPLE = [
  ['gina', 'Gina Head', 'General Manager'], ['mo', 'Mo Manager', 'Operations Manager'],
  ['ada', 'Ada Leader', 'Team Leader'], ['omar', 'Omar Reyes', 'Team Leader'],
  ['zan', 'Zanele Dube', 'Agent', ['YAT']], ['ben', 'Ben Okafor', 'Agent'], ['kim', 'Kim Senior', 'Agent'], ['pat', 'Pat Ncube', 'Agent'],
];
const LINES = [['mo', 'gina'], ['ada', 'mo'], ['omar', 'mo'], ['zan', 'ada'], ['ben', 'ada'], ['kim', 'omar'], ['pat', 'omar']];

async function seed() {
  const db = await freshDb();
  const gina = await addUser(db, 'gina@claims.test');
  const org = await rpc(db, gina, 'org_create_from_project', {
    p_payload: JSON.stringify({
      org_name: 'Acme BPO', dept_name: 'Claims', me_ref: 'gina',
      people: PEOPLE.map(([ref, full_name, role_title, labels]) => ({ ref, full_name, role_title, labels: labels || [] })),
      lines: LINES.map(([p, l]) => ({ person_ref: p, leader_ref: l, from: FROM })),
    }),
  });
  const id = org.map;
  const orgId = org.org_id;
  // Ada and Omar are invited as TLs by email; Zanele's email is on her record; Kim gets a code.
  await rpc(db, gina, 'org_invite', { p_org: orgId, p_person: id.ada, p_email: 'ada@claims.test', p_role: 'tl' });
  await rpc(db, gina, 'org_invite', { p_org: orgId, p_person: id.omar, p_email: 'omar@claims.test', p_role: 'tl' });
  await rpc(db, gina, 'org_save_person', { p_org: orgId, p_person: id.zan, p_patch: JSON.stringify({ email: 'Zanele@Claims.test' }) });
  const users = { gina };
  for (const who of ['ada', 'omar', 'zan']) {
    users[who] = await addUser(db, `${who === 'zan' ? 'zanele' : who}@claims.test`);
    await rpc(db, users[who], 'org_claim');
  }
  return { db, org, orgId, id, users };
}
const names = (rows) => rows.map((r) => r.full_name).sort();
const readPeople = async (db, uid) => names((await as(db, uid, 'select full_name from core.people')).rows);
const visible = async (db, uid, orgId, day) => (await as(db, uid, 'select core.visible_people($1, $2, $3::date) as p', [uid, orgId, day])).rows.map((r) => r.p);

test.describe('MirrorFlow Core: the shared org', () => {
  test('a project becomes an org in one audited batch, and its creator is the admin', async () => {
    const { db, org, orgId, users } = await seed();
    expect([org.people, org.lines, org.skipped]).toEqual([8, 7, 0]);
    const me = await rpc(db, users.gina, 'org_me');
    expect(me).toEqual([expect.objectContaining({ org_id: orgId, org_name: 'Acme BPO', app_role: 'admin', person_name: 'Gina Head' })]);
    const audit = await rpc(db, users.gina, 'org_audit', { p_org: orgId });
    const created = audit.find((b) => b.batch_id === org.batch_id);
    expect(created.summary).toBe('Organisation created from Claims');
    // Department, 8 people, 7 lines and the admin membership.
    expect(created.n).toBe(17);
  });

  test('sign-in links by verified email; invites carry their role; codes work once', async () => {
    const { db, orgId, id, users } = await seed();
    const role = async (uid) => ((await rpc(db, uid, 'org_me'))[0] || {}).app_role || null;
    expect(await role(users.ada)).toBe('tl');
    expect(await role(users.zan)).toBe('agent'); // email on her record, no invite: agent
    // An unverified email links nothing, and someone unknown sees nothing.
    const unverified = await addUser(db, 'omar2@claims.test', { confirmed: false });
    await rpc(db, users.gina, 'org_invite', { p_org: orgId, p_person: null, p_email: 'omar2@claims.test', p_role: 'agent' });
    expect(await rpc(db, unverified, 'org_claim')).toEqual([]);
    const stranger = await addUser(db, 'stranger@else.test');
    expect(await rpc(db, stranger, 'org_claim')).toEqual([]);
    expect(await readPeople(db, stranger)).toEqual([]);
    // Kim has no email: a single-use code.
    const inv = await rpc(db, users.ada, 'org_invite', { p_org: orgId, p_person: id.kim, p_email: null, p_role: 'agent' });
    expect(inv.code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const kim = await addUser(db, 'kim.personal@gmail.test');
    expect(await rpc(db, kim, 'org_redeem_code', { p_code: inv.code.toLowerCase().replace(/-/g, ' ') })).toEqual([expect.objectContaining({ app_role: 'agent', person_name: 'Kim Senior' })]);
    expect(await errorOf(rpc(db, stranger, 'org_redeem_code', { p_code: inv.code }))).toBe('invalid_code');
    // Nobody invites above their own role, and a linked person can't be invited again.
    expect(await errorOf(rpc(db, users.ada, 'org_invite', { p_org: orgId, p_person: id.pat, p_email: null, p_role: 'admin' }))).toBe('forbidden');
    expect(await errorOf(rpc(db, users.ada, 'org_invite', { p_org: orgId, p_person: id.kim, p_email: null, p_role: 'agent' }))).toBe('already_member');
    expect(await errorOf(rpc(db, users.zan, 'org_invite', { p_org: orgId, p_person: id.pat, p_email: null, p_role: 'agent' }))).toBe('forbidden');
  });

  test('scope: an agent sees themselves and their leaders; a TL their department chart but only their team\'s data', async () => {
    const { db, orgId, id, users } = await seed();
    expect(await readPeople(db, users.zan)).toEqual(['Ada Leader', 'Gina Head', 'Mo Manager', 'Zanele Dube']);
    expect(await visible(db, users.zan, orgId, isoDay())).toEqual([id.zan]);
    const snap = await rpc(db, users.zan, 'org_snapshot', { p_org: orgId });
    expect(names(snap.people)).toEqual(['Ada Leader', 'Gina Head', 'Mo Manager', 'Zanele Dube']);
    expect(snap.lines.every((l) => [id.zan, id.ada, id.mo].includes(l.person_id))).toBe(true);
    expect(snap.members).toHaveLength(1);

    expect(await readPeople(db, users.ada)).toHaveLength(8);
    expect((await visible(db, users.ada, orgId, isoDay())).sort()).toEqual([id.ada, id.zan, id.ben].sort());
    // The audit log and members list are admin-level reads.
    expect((await as(db, users.ada, 'select count(*)::int as n from core.audit_log')).rows[0].n).toBe(0);
    expect((await as(db, users.gina, 'select count(*)::int as n from core.audit_log')).rows[0].n).toBeGreaterThan(0);
    // No direct writes, no anonymous reads, nothing from another org.
    expect(await errorOf(as(db, users.ada, "update core.people set full_name = 'X' where id = $1", [id.ben]))).toMatch(/permission denied/);
    expect(await errorOf(as(db, null, 'select * from core.people'))).toMatch(/permission denied/);
    const other = await addUser(db, 'boss@other.test');
    const otherOrg = await rpc(db, other, 'org_create_from_project', { p_payload: JSON.stringify({ org_name: 'Other', people: [{ ref: 'x', full_name: 'Xan Other' }], me_ref: 'x' }) });
    expect(await readPeople(db, users.ada)).not.toContain('Xan Other');
    expect(await errorOf(rpc(db, users.ada, 'org_snapshot', { p_org: otherOrg.org_id }))).toBe('not_member');
    expect(await errorOf(rpc(db, users.ada, 'org_move', { p_org: otherOrg.org_id, p_people: `{${otherOrg.map.x}}`, p_leader: null, p_effective: isoDay() }))).toBe('not_member');
  });

  test('acting cover widens scope only on its dates, and shows in the agents\' leader chain', async () => {
    const { db, orgId, id, users } = await seed();
    await rpc(db, users.ada, 'org_save_acting', { p_org: orgId, p_id: null, p_person: id.zan, p_for: id.ada, p_starts: isoDay(-1), p_ends: isoDay(1), p_label: 'YAT' });
    expect((await visible(db, users.zan, orgId, isoDay())).sort()).toEqual([id.zan, id.ada, id.ben].sort());
    expect(await visible(db, users.zan, orgId, isoDay(5))).toEqual([id.zan]);
    // Agents can't book cover.
    expect(await errorOf(rpc(db, users.zan, 'org_save_acting', { p_org: orgId, p_id: null, p_person: id.zan, p_for: id.omar, p_starts: isoDay(), p_ends: isoDay() }))).toBe('forbidden');
  });

  test('moves are dated and keep history; loops are skipped; other departments are off limits', async () => {
    const { db, orgId, id, users } = await seed();
    const res = await rpc(db, users.ada, 'org_move', { p_org: orgId, p_people: `{${id.ben}}`, p_leader: id.omar, p_effective: isoDay(7) });
    expect([res.moved, res.unchanged]).toEqual([1, 0]);
    const lines = (await as(db, users.ada, 'select reports_to_id, effective_from::text as f, effective_to::text as t from core.reporting_lines where person_id = $1 order by effective_from', [id.ben])).rows;
    expect(lines).toEqual([{ reports_to_id: id.ada, f: FROM, t: isoDay(6) }, { reports_to_id: id.omar, f: isoDay(7), t: null }]);
    expect(await visible(db, users.ada, orgId, isoDay())).toContain(id.ben);
    expect(await visible(db, users.ada, orgId, isoDay(7))).not.toContain(id.ben);
    expect(await visible(db, users.omar, orgId, isoDay(7))).toContain(id.ben);
    // Mo under Zanele would put Mo below himself.
    const loop = await rpc(db, users.gina, 'org_move', { p_org: orgId, p_people: `{${id.mo}}`, p_leader: id.zan, p_effective: isoDay() });
    expect([loop.moved, loop.skipped]).toEqual([0, [id.mo]]);
    expect(await errorOf(rpc(db, users.zan, 'org_move', { p_org: orgId, p_people: `{${id.ben}}`, p_leader: id.omar, p_effective: isoDay() }))).toBe('forbidden');
    // A second department: a TL in Claims can neither read nor move its people.
    const sales = await rpc(db, users.gina, 'org_save_department', { p_org: orgId, p_id: null, p_name: 'Sales' });
    const sam = await rpc(db, users.gina, 'org_save_person', { p_org: orgId, p_person: null, p_patch: JSON.stringify({ full_name: 'Sam Sales', dept_id: sales.id }) });
    expect(await readPeople(db, users.ada)).not.toContain('Sam Sales');
    expect(await errorOf(rpc(db, users.ada, 'org_move', { p_org: orgId, p_people: `{${sam.id}}`, p_leader: id.ada, p_effective: isoDay() }))).toBe('forbidden');
    expect(await errorOf(rpc(db, users.ada, 'org_save_department', { p_org: orgId, p_id: sales.id, p_name: 'Sales 2' }))).toBe('forbidden');
  });

  test('edits need the version last seen; a stale save changes nothing', async () => {
    const { db, orgId, id, users } = await seed();
    const ben = (await rpc(db, users.ada, 'org_snapshot', { p_org: orgId })).people.find((p) => p.id === id.ben);
    const saved = await rpc(db, users.ada, 'org_save_person', { p_org: orgId, p_person: id.ben, p_patch: JSON.stringify({ role_title: 'Senior Agent', labels: ['SME'] }), p_version: ben.version });
    expect([saved.role_title, saved.labels, saved.version]).toEqual(['Senior Agent', ['SME'], ben.version + 1]);
    expect(await errorOf(rpc(db, users.omar, 'org_save_person', { p_org: orgId, p_person: id.ben, p_patch: JSON.stringify({ role_title: 'Agent' }), p_version: ben.version }))).toBe('version_conflict');
    expect(await errorOf(rpc(db, users.ada, 'org_save_person', { p_org: orgId, p_person: id.ben, p_patch: JSON.stringify({ email: 'zanele@claims.test' }) }))).toBe('email_taken');
  });

  test('undo writes the old values back as a new batch; blocked while a newer change sits on top', async () => {
    const { db, orgId, id, users } = await seed();
    const b1 = await rpc(db, users.ada, 'org_move', { p_org: orgId, p_people: `{${id.ben}}`, p_leader: id.omar, p_effective: isoDay(7) });
    const b2 = await rpc(db, users.omar, 'org_move', { p_org: orgId, p_people: `{${id.ben}}`, p_leader: id.ada, p_effective: isoDay(10) });
    expect(await errorOf(rpc(db, users.ada, 'org_revert', { p_batch: b1.batch_id }))).toBe('newer_change');
    await rpc(db, users.omar, 'org_revert', { p_batch: b2.batch_id });
    const undo = await rpc(db, users.ada, 'org_revert', { p_batch: b1.batch_id });
    expect(undo.reverted).toBe(2);
    const lines = (await as(db, users.ada, 'select reports_to_id, effective_from::text as f, effective_to from core.reporting_lines where person_id = $1', [id.ben])).rows;
    expect(lines).toEqual([{ reports_to_id: id.ada, f: FROM, effective_to: null }]);
    expect(await errorOf(rpc(db, users.ada, 'org_revert', { p_batch: b1.batch_id }))).toBe('already_reverted');
    const audit = await rpc(db, users.ada, 'org_audit', { p_org: orgId });
    expect(audit[0].summary).toBe('Undo: Moved 1 to Omar Reyes');
    expect(audit.find((b) => b.batch_id === b1.batch_id).reverted).toBe(true);
    // The org's creation can't be undone from here.
    expect(await errorOf(rpc(db, users.gina, 'org_revert', { p_batch: (await rpc(db, users.gina, 'org_audit', { p_org: orgId })).slice(-1)[0].batch_id }))).toBe('forbidden');
  });

  test('only admins change roles, and the last admin stays an admin', async () => {
    const { db, orgId, users } = await seed();
    await rpc(db, users.gina, 'org_set_member', { p_org: orgId, p_user: users.ada, p_role: 'manager' });
    expect((await rpc(db, users.ada, 'org_me'))[0].app_role).toBe('manager');
    expect(await errorOf(rpc(db, users.ada, 'org_set_member', { p_org: orgId, p_user: users.zan, p_role: 'tl' }))).toBe('forbidden');
    expect(await errorOf(rpc(db, users.gina, 'org_set_member', { p_org: orgId, p_user: users.gina, p_role: 'ops' }))).toBe('last_admin');
    await rpc(db, users.gina, 'org_set_member', { p_org: orgId, p_user: users.zan, p_role: 'agent', p_status: 'suspended' });
    expect(await rpc(db, users.zan, 'org_me')).toEqual([]);
    expect(await readPeople(db, users.zan)).toEqual([]);
  });

  test('every migration applies in order to an empty database; the baseline is a no-op afterwards', async () => {
    const db = await freshDb({ migrations: null });
    const tables = async () => (await db.query("select schemaname || '.' || tablename as t from pg_tables where schemaname in ('public', 'core', 'private') order by 1")).rows.map((r) => r.t);
    const before = await tables();
    expect(before).toEqual(expect.arrayContaining(['public.profiles', 'public.workspaces', 'core.people', 'core.reporting_lines', 'private.workspaces_legacy_archive']));
    expect(before).not.toContain('public.teams');
    await reapply(db, 'baseline');
    expect(await tables()).toEqual(before);
    // Signing up creates the profile.
    const u = await addUser(db, 'new@x.test');
    expect((await as(db, u, 'select email from public.profiles')).rows).toEqual([{ email: 'new@x.test' }]);
    // The org API is for signed-in users only, despite public's default grants.
    expect(await errorOf(as(db, null, 'select public.org_me()'))).toMatch(/permission denied/);
  });

  test('retiring team sharing keeps every workspace readable and writable by its owner only', async () => {
    const db = await freshDb({ migrations: null });
    const a = await addUser(db, 'a@x.test');
    const b = await addUser(db, 'b@x.test');
    await as(db, a, "insert into public.workspaces (owner_user_id, team_id, department_key, data) values ($1, null, '__personal__', '{}')", [a]);
    expect((await as(db, a, 'select count(*)::int as n from public.workspaces')).rows[0].n).toBe(1);
    expect((await as(db, b, 'select count(*)::int as n from public.workspaces')).rows[0].n).toBe(0);
    expect(await errorOf(as(db, b, "insert into public.workspaces (owner_user_id, department_key) values ($1, 'x')", [a]))).toMatch(/row-level security/);
    expect((await db.query("select count(*)::int as n from pg_tables where schemaname = 'public' and tablename in ('teams', 'team_members')")).rows[0].n).toBe(0);
    expect((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname like 'is_team_%'")).rows[0].n).toBe(0);
  });
});
