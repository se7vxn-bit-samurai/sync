const { test, expect } = require('@playwright/test');
const { as, addUser, rpcFromClient } = require('./fixtures/pg');
const { seedClaims } = require('./fixtures/org-seed');

// Phase 2: published schedules (supabase/migrations/*_sync_schedule.sql) and the invite-code
// limit, against real Postgres (PGlite) with every migration applied.
test.beforeEach(({}, info) => test.skip(info.project.name !== 'desktop-chromium', 'database tests run once'));

/** Calls a public function the way the app does; returns the data or throws the raised message. */
async function call(db, uid, fn, args) {
  const out = await rpcFromClient(db, uid, fn, args);
  if (out.error) throw new Error(out.error.message);
  return out.data;
}
const errorOf = async (p) => { try { await p; return null; } catch (err) { return err.message; } };
const shift = (person_id, date, start, end, extra) => Object.assign({ person_id, date, status: 'shift', start_local: start, end_local: end }, extra);
const off = (person_id, date, extra) => Object.assign({ person_id, date, status: 'off' }, extra);

// Ada's team, 23–27 Oct 2026: the UK clocks go back on Sunday 25 Oct (SA stays UTC+2).
const FROM = '2026-10-23';
const TO = '2026-10-27';
function adaRota(id) {
  return [
    shift(id.zan, '2026-10-23', '09:00', '17:30', { code: 'Early' }),
    shift(id.zan, '2026-10-24', '09:00', '17:30', { code: 'Early' }),
    off(id.zan, '2026-10-25'),
    shift(id.zan, '2026-10-26', '09:00', '17:30', { code: 'Early' }),
    { person_id: id.zan, date: '2026-10-27', status: 'leave', leave_type: 'annual' },
    shift(id.ben, '2026-10-23', '14:00', '22:30', { code: 'Late' }),
    shift(id.ben, '2026-10-24', '22:00', '06:00', { code: 'Night' }),
    off(id.ben, '2026-10-25'),
  ];
}

test.describe('Sync: published schedules', () => {
  test('a TL previews then publishes their team; the agent reads their own month with the right UTC times', async () => {
    const { db, orgId, id, users } = await seedClaims();
    const people = [id.zan, id.ben];
    const args = { p_org: orgId, p_from: FROM, p_to: TO, p_people: people, p_rows: adaRota(id) };

    // The preview writes nothing.
    const preview = await call(db, users.ada, 'sync_publish_schedule', args);
    expect(preview).toMatchObject({ dry_run: true, people: 2, people_changed: 2, added: 8, removed: 0, changed: 0, unchanged: 0 });
    expect(preview.changes).toHaveLength(8);
    expect((await db.query('select count(*)::int as n from sync.schedule_rows')).rows[0].n).toBe(0);

    const done = await call(db, users.ada, 'sync_publish_schedule', { ...args, p_dry_run: false, p_note: 'Late Oct' });
    expect(done).toMatchObject({ dry_run: false, added: 8 });
    expect(done.publish_id).toMatch(/^[0-9a-f-]{36}$/);

    // Zanele sees her own rows only, and who she reports to.
    const me = await call(db, users.zan, 'sync_me', { p_from: '2026-10-01', p_to: '2026-10-31', p_today: '2026-10-23' });
    expect(me).toMatchObject({ member: true, org: { name: 'Acme BPO' }, me: { full_name: 'Zanele Dube', app_role: 'agent' }, leader: { name: 'Ada Leader', acting: false } });
    expect(me.rows.map((r) => [r.date, r.status, r.start, r.end])).toEqual([
      ['2026-10-23', 'shift', '09:00', '17:30'], ['2026-10-24', 'shift', '09:00', '17:30'], ['2026-10-25', 'off', null, null],
      ['2026-10-26', 'shift', '09:00', '17:30'], ['2026-10-27', 'leave', null, null],
    ]);
    // 09:00 in London is 08:00Z in summer time and 09:00Z after the clocks go back.
    expect(new Date(me.rows[1].start_utc).toISOString()).toBe('2026-10-24T08:00:00.000Z');
    expect(new Date(me.rows[3].start_utc).toISOString()).toBe('2026-10-26T09:00:00.000Z');
    expect(me.rows[4].leave_type).toBe('annual');
    expect(me.publishes).toEqual([expect.objectContaining({ by: 'Ada Leader', period_from: FROM, period_to: TO, added: 8 })]);
    // A night shift ends the next morning.
    const ben = await call(db, users.ben, 'sync_me', { p_from: FROM, p_to: TO });
    const night = ben.rows.find((r) => r.date === '2026-10-24');
    expect([new Date(night.start_utc).toISOString(), new Date(night.end_utc).toISOString()]).toEqual(['2026-10-24T21:00:00.000Z', '2026-10-25T06:00:00.000Z']);
    // Through sync_schedule an agent still gets only themselves.
    const zanSchedule = await call(db, users.zan, 'sync_schedule', { p_org: orgId, p_from: FROM, p_to: TO });
    expect(new Set(zanSchedule.rows.map((r) => r.person_id))).toEqual(new Set([id.zan]));
    expect(zanSchedule.latest).toMatchObject({ by: 'Ada Leader' });
    // Nobody reads the tables directly.
    expect(await errorOf(as(db, users.zan, 'select * from sync.schedule_rows'))).toMatch(/permission denied/);
  });

  test('republishing reports what changed, removes what was taken out, and keeps unchanged rows as they were', async () => {
    const { db, orgId, id, users } = await seedClaims();
    const base = { p_org: orgId, p_from: FROM, p_to: TO, p_people: [id.zan, id.ben], p_dry_run: false };
    const first = await call(db, users.ada, 'sync_publish_schedule', { ...base, p_rows: adaRota(id) });
    // Zanele's Monday moves to a late; Ben's night is taken out; everything else is the same.
    const rota = adaRota(id).filter((r) => !(r.person_id === id.ben && r.date === '2026-10-24'))
      .map((r) => (r.person_id === id.zan && r.date === '2026-10-26' ? shift(id.zan, r.date, '14:00', '22:30', { code: 'Late' }) : r));
    const preview = await call(db, users.ada, 'sync_publish_schedule', { ...base, p_rows: rota, p_dry_run: true });
    expect(preview).toMatchObject({ people_changed: 2, added: 0, removed: 1, changed: 1, unchanged: 6 });
    expect(preview.changes.map((c) => [c.date, c.kind, c.before && c.before.start, c.after && c.after.start]).sort()).toEqual(
      [['2026-10-24', 'removed', '22:00', null], ['2026-10-26', 'changed', '09:00', '14:00']]);
    const second = await call(db, users.ada, 'sync_publish_schedule', { ...base, p_rows: rota });
    const rows = (await call(db, users.ada, 'sync_schedule', { p_org: orgId, p_from: FROM, p_to: TO })).rows;
    expect(rows).toHaveLength(7);
    const monday = rows.find((r) => r.person_id === id.zan && r.date === '2026-10-26');
    expect([monday.start, monday.publish_id, monday.version]).toEqual(['14:00', second.publish_id, 2]);
    // Untouched rows still point at the first publish.
    expect(rows.find((r) => r.person_id === id.zan && r.date === '2026-10-23').publish_id).toBe(first.publish_id);
    // A person in the publish with no rows has their period cleared.
    const cleared = await call(db, users.ada, 'sync_publish_schedule', { ...base, p_people: [id.ben], p_rows: [] });
    expect(cleared).toMatchObject({ removed: 2, people_changed: 1 });
    expect((await call(db, users.ben, 'sync_me', { p_from: FROM, p_to: TO })).rows).toEqual([]);
  });

  test('scope: a TL publishes only their own tree, agents never publish, and managers read their whole tree', async () => {
    const { db, orgId, id, users } = await seedClaims();
    const pub = (uid, people, rows, extra) => call(db, uid, 'sync_publish_schedule', { p_org: orgId, p_from: FROM, p_to: TO, p_people: people, p_rows: rows, ...extra });
    expect(await errorOf(pub(users.ada, [id.kim], [shift(id.kim, FROM, '09:00', '17:00')]))).toBe('forbidden_person');
    expect(await errorOf(pub(users.zan, [id.zan], [shift(id.zan, FROM, '09:00', '17:00')]))).toBe('forbidden');
    expect(await errorOf(pub(users.ada, [id.zan], [shift(id.zan, '2026-11-01', '09:00', '17:00')]))).toBe('bad_rows');
    expect(await errorOf(pub(users.ada, [id.zan], [{ person_id: id.zan, date: FROM, status: 'shift' }]))).toBe('bad_rows');
    expect(await errorOf(pub(users.ada, [id.zan], [off(id.zan, FROM), off(id.zan, FROM)]))).toBe('bad_rows');
    expect(await errorOf(pub(users.ada, [id.zan], [], { p_to: '2027-01-31' }))).toBe('bad_period');

    await pub(users.ada, [id.zan, id.ben], adaRota(id), { p_dry_run: false });
    await pub(users.omar, [id.kim, id.pat], [shift(id.kim, FROM, '08:00', '16:30'), shift(id.pat, FROM, '08:00', '16:30')], { p_dry_run: false });
    const who = async (uid) => {
      const out = await call(db, uid, 'sync_schedule', { p_org: orgId, p_from: FROM, p_to: TO });
      return [...new Set(out.rows.map((r) => r.person_id))].sort();
    };
    expect(await who(users.omar)).toEqual([id.kim, id.pat].sort());
    expect(await who(users.mo)).toEqual([id.zan, id.ben, id.kim, id.pat].sort());
    expect(await who(users.gina)).toEqual([id.zan, id.ben, id.kim, id.pat].sort());
    // The manager may publish for anyone in his tree.
    expect(await pub(users.mo, [id.kim], [shift(id.kim, FROM, '10:00', '18:30')])).toMatchObject({ changed: 1 });
    // Someone outside the org gets nothing at all.
    const stranger = await addUser(db, 'stranger@else.test');
    expect(await call(db, stranger, 'sync_me', { p_from: FROM, p_to: TO })).toEqual({ member: false });
    expect(await errorOf(call(db, stranger, 'sync_schedule', { p_org: orgId, p_from: FROM, p_to: TO }))).toBe('not_member');
  });

  test('Sync Me names the acting leader while cover is on', async () => {
    const { db, orgId, id, users } = await seedClaims();
    await call(db, users.ada, 'org_save_acting', { p_org: orgId, p_id: null, p_person: id.zan, p_for: id.ada, p_starts: '2026-10-20', p_ends: '2026-10-30', p_role: 'Acting Team Lead', p_label: null, p_status: 'active', p_version: null });
    const during = await call(db, users.ben, 'sync_me', { p_from: FROM, p_to: TO, p_today: '2026-10-23' });
    expect(during.leader).toEqual({ name: 'Zanele Dube', acting: true, acting_role: 'Acting Team Lead', for: 'Ada Leader', until: '2026-10-30' });
    const after = await call(db, users.ben, 'sync_me', { p_from: FROM, p_to: TO, p_today: '2026-11-02' });
    expect(after.leader).toMatchObject({ name: 'Ada Leader', acting: false });
  });

  test('invite codes: ten wrong tries in 15 minutes, then no more', async () => {
    const { db, orgId, id, users } = await seedClaims();
    const inv = await call(db, users.gina, 'org_invite', { p_org: orgId, p_person: id.kim, p_email: null, p_role: 'agent' });
    const guesser = await addUser(db, 'guesser@else.test');
    for (let i = 0; i < 10; i++) expect(await call(db, guesser, 'org_redeem_code', { p_code: `AAAA-BBBB-${String(1000 + i)}` })).toEqual({ error: 'invalid_code' });
    expect(await errorOf(call(db, guesser, 'org_redeem_code', { p_code: inv.code }))).toBe('too_many_attempts');
    // Someone else is not held back by it.
    const kim = await addUser(db, 'kim@home.test');
    expect(await call(db, kim, 'org_redeem_code', { p_code: inv.code })).toEqual([expect.objectContaining({ person_name: 'Kim Senior' })]);
  });
});
