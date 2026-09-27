const { test, expect } = require('@playwright/test');
const crypto = require('crypto');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');
const { freshDb, addUser, as, rpc, rpcFromClient } = require('./fixtures/pg');

// Sync linked to a shared organisation, end to end: the app in the browser, its sb.rpc calls
// answered by the real migrations in PGlite (Postgres) as the signed-in user.
// Same org as tests/leaders.spec.js: Gina > Mo > Ada (Zanele YAT, Ben), Omar (Kim, Pat Ncube,
// Pat Ncub, Lee the leaver); Tia leads nobody; Cal has no leader.

const PROJECT = 'Project A';
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function orgWorkspace() {
  const source = 'src-0';
  const person = (id, name, role, leaderId, leaderName, extra) => Object.assign({ person_id: id, full_name: name, role_type: role, job_title: role, home_department: PROJECT, source_id: source, authority_rank: 5, status: 'Active', reports_to_person_id: leaderId || '', manager_name: leaderName || '' }, extra);
  const rows = (id, name, start, end, leave = []) => Array.from({ length: 28 }, (_, i) => {
    const off = leave.includes(i - 7);
    return { schedule_id: `s-${id}-${i}`, person_id: id, person_name: name, department: PROJECT, source_id: source, date: iso(i - 7),
      uk_start: off ? '' : start, uk_end: off ? '' : end, is_off: off, off_type: off ? 'LEAVE' : '', imported_at: '2026-01-20T00:00:00.000Z' };
  });
  return {
    schema: 'sync.northstar.canonical', version: 1, updated_at: new Date().toISOString(),
    sources: [{ source_id: source, source_name: 'People Hub.xlsx', department_name: PROJECT, loaded_at: '2026-01-20T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 }],
    people: [
      person('p-gina', 'Gina Head', 'General Manager'),
      person('p-mo', 'Mo Manager', 'Operations Manager', 'p-gina', 'Gina Head'),
      person('p-ada', 'Ada Leader', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-omar', 'Omar Reyes', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-zan', 'Zanele Dube', 'Agent', 'p-ada', 'Ada Leader', { labels: ['YAT'] }),
      person('p-ben', 'Ben Okafor', 'Agent', 'p-ada', 'Ada Leader'),
      person('p-kim', 'Kim Senior', 'Agent', 'p-omar', 'Omar Reyes', { labels: ['Senior Agent'] }),
      person('p-pat', 'Pat Ncube', 'Agent', 'p-omar', 'Omar Reyes'),
    ],
    schedule: [
      ...rows('p-ada', 'Ada Leader', '09:00', '17:30', [2, 3, 4]),
      ...rows('p-omar', 'Omar Reyes', '08:00', '16:30'),
      ...rows('p-pat', 'Pat Ncube', '08:00', '16:30'),
    ],
  };
}

async function openLinkedApp(page, { exposeOrg = true } = {}) {
  const db = await freshDb({ migrations: null });
  const uid = crypto.randomUUID();
  await addUser(db, 'tester@example.com', { id: uid });
  if (exposeOrg) await page.exposeFunction('__orgRpc', (fn, args, who) => rpcFromClient(db, who, fn, args));
  page.on('dialog', (d) => d.accept());
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(orgWorkspace()), user: { id: uid, email: 'tester@example.com' } });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Omar Reyes'] && S.people['Omar Reyes'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
  await page.waitForFunction(() => orgState.checked);
  return { db, uid };
}
const sql = async (db, uid, text, params) => (await as(db, uid, text, params)).rows;

async function createOrg(page) {
  await page.evaluate(() => openSettings('org'));
  await page.locator('#orgNewName').fill('Acme BPO');
  await page.locator('#orgNewMe').selectOption('Mo Manager');
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.locator('#orgLinkStatus')).toContainText('Linked to Acme BPO');
  await expect(page.locator('#orgLinkStatus')).toContainText('you are Admin');
}

test.describe('Organisation (shared org layer)', () => {
  test('a project becomes an organisation; the org is then the source of truth for moves and undo', async ({ page }) => {
    const { db, uid } = await openLinkedApp(page);
    await createOrg(page);
    expect((await sql(db, uid, 'select count(*)::int as n from core.people'))[0].n).toBe(8);
    expect((await sql(db, uid, 'select count(*)::int as n from core.reporting_lines'))[0].n).toBe(7);
    // The project's people now carry their org records, keeping their own ids.
    expect(await page.evaluate(() => nsScopedRows('people').filter((p) => p.org_person_id).length)).toBe(8);
    expect(await page.evaluate(() => (S.people['Ben Okafor'] || {}).personId)).toBe('p-ben');

    // A move in the Org builder is made in the org, then pulled back.
    await page.evaluate(() => { closeSettings(); railNavPeople('org'); });
    await expect(page.locator('#orgLinked')).toContainText('Linked to Acme BPO');
    await expect(page.locator('#orgImportBtn')).toBeDisabled();
    await page.locator('#orgAsOf').fill(iso(3));
    await page.locator('#orgAsOf').dispatchEvent('change');
    await page.locator('.org-chip[data-name="Ben Okafor"]').first().click();
    await page.locator('#orgTarget').selectOption('Omar Reyes');
    await page.locator('#orgMoveBtn').click();
    await expect.poll(() => page.evaluate((d) => baseLeaderOn('Ben Okafor', d), iso(3))).toBe('Omar Reyes');
    expect(await page.evaluate((d) => baseLeaderOn('Ben Okafor', d), iso(2))).toBe('Ada Leader');
    const lines = await sql(db, uid, "select l.effective_from::text as f, l.effective_to::text as t, b.full_name as leader from core.reporting_lines l join core.people p on p.id = l.person_id join core.people b on b.id = l.reports_to_id where p.full_name = 'Ben Okafor' order by l.effective_from");
    expect(lines.map((l) => [l.leader, l.t])).toEqual([['Ada Leader', iso(2)], ['Omar Reyes', null]]);

    // The change log is the org's, with who did it; undo happens there.
    const row = page.locator('#orgChanges tbody tr').first();
    await expect(row).toContainText('Moved 1 to Omar Reyes');
    await expect(row).toContainText('Mo Manager');
    await row.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(() => page.evaluate((d) => baseLeaderOn('Ben Okafor', d), iso(3))).toBe('Ada Leader');
    await expect(page.locator('#orgChanges tbody tr').first()).toContainText('Undo: Moved 1 to Omar Reyes');
    expect((await sql(db, uid, "select count(*)::int as n from core.reporting_lines l join core.people p on p.id = l.person_id where p.full_name = 'Ben Okafor'"))[0].n).toBe(1);
    expect(page.__jsErrors).toEqual([]);
  });

  test('acting cover, role and label edits in a linked project are saved in the org', async ({ page }) => {
    const { db, uid } = await openLinkedApp(page);
    await createOrg(page);
    await page.evaluate(() => closeSettings());
    await page.evaluate(([a, b]) => coverAssign('Zanele Dube', 'Ada Leader', a, b, 'Acting Team Lead'), [iso(2), iso(4)]);
    await expect.poll(async () => (await sql(db, uid, 'select count(*)::int as n from core.acting_assignments'))[0].n).toBe(1);
    await expect.poll(() => page.evaluate(() => coverRows().filter((r) => r.id.startsWith('org:')).length)).toBe(1);
    expect(await page.evaluate((d) => leaderOn('Ben Okafor', d).name, iso(3))).toBe('Zanele Dube');
    await page.evaluate(() => coverCancel(coverRows().find((r) => r.id.startsWith('org:')).id));
    await expect.poll(async () => (await sql(db, uid, 'select status from core.acting_assignments'))[0].status).toBe('cancelled');

    // Labels from the People view, and a role from the Org builder.
    await page.evaluate(() => nsApplyRuntimePersonEdit('Kim Senior', { labels: ['SME'] }));
    await expect.poll(async () => (await sql(db, uid, "select labels from core.people where full_name = 'Kim Senior'"))[0].labels).toEqual(['SME']);
    await expect.poll(() => page.evaluate(() => S.people['Kim Senior'].labels)).toEqual(['SME']);
    await page.evaluate(() => railNavPeople('org'));
    await page.locator('.org-chip[data-name="Pat Ncube"]').first().click();
    await page.locator('#orgRole').selectOption('Team Leader');
    await page.locator('#orgRoleBtn').click();
    await expect.poll(async () => (await sql(db, uid, "select role_title from core.people where full_name = 'Pat Ncube'"))[0].role_title).toBe('Team Leader');
    expect(page.__jsErrors).toEqual([]);
  });

  test('inviting from Settings gives a one-time code; the invitee joins with their role', async ({ page }) => {
    const { db } = await openLinkedApp(page);
    await createOrg(page);
    const row = page.locator('#orgPeople tr[data-person="Ada Leader"]');
    const adaId = await page.evaluate(() => orgState.snapshot.people.find((p) => p.full_name === 'Ada Leader').id);
    await page.locator(`#orgEmail_${adaId}`).fill('Ada@Claims.test');
    await page.locator(`#orgInvRole_${adaId}`).selectOption('tl');
    await row.getByRole('button', { name: 'Invite' }).click();
    await expect(page.locator('#orgInviteResult')).toContainText('Code for Ada Leader');
    const code = (await page.locator('#orgInviteResult .mono').innerText()).trim();
    expect(code).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    await expect(page.locator(`#orgEmail_${adaId}`)).toHaveValue('ada@claims.test');
    await expect(row).toContainText('Joins on sign-in');
    // Ada signs in with that email somewhere else: she's a team leader in the org.
    const ada = await addUser(db, 'ada@claims.test');
    expect(await rpc(db, ada, 'org_claim')).toEqual([expect.objectContaining({ org_name: 'Acme BPO', app_role: 'tl', person_name: 'Ada Leader' })]);
    await page.evaluate(() => orgReload());
    await expect(row).toContainText('Team leader');
    expect(page.__jsErrors).toEqual([]);
  });

  test('on a server without the org layer, Settings says so and nothing else changes', async ({ page }) => {
    await openLinkedApp(page, { exposeOrg: false });
    expect(await page.evaluate(() => [orgState.available, orgState.checkError])).toEqual([false, '']);
    await page.evaluate(() => openSettings('org'));
    await expect(page.locator('#setMain')).toContainText("Organisations aren't switched on for this server yet.");
    await page.evaluate(() => railNavPeople('org'));
    await expect(page.locator('#orgLinked')).toHaveCount(0);
    await expect(page.locator('#orgImportBtn')).toBeEnabled();
    expect(page.__jsErrors).toEqual([]);
  });
});
