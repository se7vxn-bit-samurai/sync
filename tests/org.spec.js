const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// People → Org (Org builder): dated reporting lines, lanes, moves, role changes, organogram
// import, data quality and the change log with undo. Dates are relative to today (T+n).
//
// Gina (GM) ← Mo (Operations Manager) ← Ada and Omar (TLs).
// Ada ← Zanele (YAT), Ben (follow Ada's rota, 09:00). Omar ← Kim, Pat (own rows), Pat Ncub, Lee
// (a leaver with future shifts); agents under Omar without rows follow his rota (08:00).
// Cal has no leader, Tia is a TL with no team, Rhea is on the roster but not in People.

const PROJECT = 'Project A';
const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function orgWorkspace() {
  const source = 'src-0';
  const person = (id, name, role, leaderId, leaderName, extra) => Object.assign({ person_id: id, full_name: name, role_type: role, job_title: role, home_department: PROJECT, source_id: source, authority_rank: 5, status: 'Active', reports_to_person_id: leaderId || '', manager_name: leaderName || '' }, extra);
  const rows = (id, name, start, end) => Array.from({ length: 28 }, (_, i) => ({
    schedule_id: `s-${id}-${i}`, person_id: id, person_name: name, department: PROJECT, source_id: source, date: iso(i - 7),
    uk_start: start, uk_end: end, is_off: false, off_type: '', imported_at: '2026-01-20T00:00:00.000Z',
  }));
  return {
    schema: 'sync.northstar.canonical', version: 1, updated_at: new Date().toISOString(),
    sources: [{ source_id: source, source_name: 'People Hub.xlsx', department_name: PROJECT, loaded_at: '2026-01-20T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 }],
    people: [
      person('p-gina', 'Gina Head', 'General Manager'),
      person('p-mo', 'Mo Manager', 'Operations Manager', 'p-gina', 'Gina Head'),
      person('p-ada', 'Ada Leader', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-omar', 'Omar Reyes', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-tia', 'Tia Newteam', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-zan', 'Zanele Dube', 'Agent', 'p-ada', 'Ada Leader', { labels: ['YAT'] }),
      person('p-ben', 'Ben Okafor', 'Agent', 'p-ada', 'Ada Leader'),
      person('p-kim', 'Kim Senior', 'Agent', 'p-omar', 'Omar Reyes', { labels: ['Senior Agent'] }),
      person('p-pat', 'Pat Ncube', 'Agent', 'p-omar', 'Omar Reyes'),
      person('p-pat2', 'Pat Ncub', 'Agent', 'p-omar', 'Omar Reyes'),
      person('p-lee', 'Lee Gone', 'Agent', 'p-omar', 'Omar Reyes', { status: 'Leaver' }),
      person('p-cal', 'Cal Loose', 'Agent'),
    ],
    schedule: [
      ...rows('p-ada', 'Ada Leader', '09:00', '17:30'),
      ...rows('p-omar', 'Omar Reyes', '08:00', '16:30'),
      ...rows('p-pat', 'Pat Ncube', '08:00', '16:30'),
      ...rows('p-lee', 'Lee Gone', '10:00', '18:30'),
      ...rows('p-rhea', 'Rhea Roster', '09:00', '17:30'),
    ],
  };
}

async function openOrg(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(orgWorkspace()) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Ben Okafor'] && S.people['Ben Okafor'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
  await page.evaluate(() => railNavPeople('org'));
  await expect(page.locator('#orgAsOf')).toBeVisible();
}
const chip = (page, team, name) => page.locator(`.org-team[data-leader="${team}"] .org-chip[data-name="${name}"]`);
async function setDate(page, value) {
  await page.locator('#orgAsOf').fill(value);
  await page.locator('#orgAsOf').dispatchEvent('change');
  await expect(page.locator('#orgAsOf')).toHaveValue(value);
}
async function moveSelected(page, target) {
  await page.locator('#orgTarget').selectOption(target);
  await page.locator('#orgMoveBtn').click();
}
const leaders = (page, names, day) => page.evaluate(([n, d]) => n.map((x) => baseLeaderOn(x, d)), [names, day]);

test.describe('Org builder', () => {
  test('a dated move keeps history with the old leader and switches on the effective day', async ({ page }) => {
    await openOrg(page);
    await setDate(page, iso(5));
    await chip(page, 'Ada Leader', 'Ben Okafor').click();
    await expect(page.locator('#orgSelCount')).toContainText('1 selected');
    await moveSelected(page, 'Omar Reyes');

    expect(await leaders(page, ['Ben Okafor'], iso(4))).toEqual(['Ada Leader']);
    expect(await leaders(page, ['Ben Okafor'], iso(5))).toEqual(['Omar Reyes']);
    // Today is before the move, so People still has Ada.
    expect(await page.evaluate(() => S.people['Ben Okafor'].teamLeader)).toBe('Ada Leader');
    await expect(chip(page, 'Omar Reyes', 'Ben Okafor')).toBeVisible();
    await setDate(page, iso(4));
    await expect(chip(page, 'Ada Leader', 'Ben Okafor')).toBeVisible();
    await expect(page.locator('#orgChanges tbody tr')).toHaveCount(1);
    await expect(page.locator('#orgChanges tbody tr')).toContainText('Moved Ben Okafor to Omar Reyes');

    // Ben has no rows of his own: he follows Ada's rota (09:00) until the move, then Omar's (08:00).
    await page.evaluate(([a, b]) => openScheduleWindow('Ben Okafor', { mode: 'custom', from: a, to: b, clock: 'uk' }), [iso(3), iso(6)]);
    await expect(page.locator(`#swinTable tr[data-iso="${iso(4)}"] td`).nth(2)).toHaveText('09:00');
    await expect(page.locator(`#swinTable tr[data-iso="${iso(5)}"] td`).nth(2)).toHaveText('08:00');
    await expect(page.locator('.swin-hd')).toContainText("shifts follow Ada Leader's rota, then Omar Reyes's from");
    expect(page.__jsErrors).toEqual([]);
  });

  test('a move from today updates People now, and a bulk move undoes as one', async ({ page }) => {
    await openOrg(page);
    await chip(page, 'Ada Leader', 'Zanele Dube').click();
    await chip(page, 'Ada Leader', 'Ben Okafor').click();
    await moveSelected(page, 'Omar Reyes');
    expect(await page.evaluate(() => ['Zanele Dube', 'Ben Okafor'].map((n) => S.people[n].teamLeader))).toEqual(['Omar Reyes', 'Omar Reyes']);
    expect(await page.evaluate(() => ['p-zan', 'p-ben'].map((id) => S.nsCanonical.people.find((p) => p.person_id === id).reports_to_person_id))).toEqual(['p-omar', 'p-omar']);
    await expect(page.locator('.org-team[data-leader="Ada Leader"]')).toHaveClass(/empty/);

    await page.locator('#orgChanges tbody tr').first().getByRole('button', { name: 'Undo' }).click();
    expect(await page.evaluate(() => ['Zanele Dube', 'Ben Okafor'].map((n) => S.people[n].teamLeader))).toEqual(['Ada Leader', 'Ada Leader']);
    expect(await leaders(page, ['Zanele Dube', 'Ben Okafor'], iso(-3))).toEqual(['Ada Leader', 'Ada Leader']);
    expect(await page.evaluate(() => nsOrgLines().length)).toBe(0);
    await expect(chip(page, 'Ada Leader', 'Zanele Dube')).toBeVisible();
    await expect(page.locator('#orgChanges .cov-state')).toHaveText('undone');
  });

  test('undo waits for newer changes to the same people', async ({ page }) => {
    await openOrg(page);
    await chip(page, 'Ada Leader', 'Ben Okafor').click();
    await moveSelected(page, 'Omar Reyes');
    await chip(page, 'Omar Reyes', 'Ben Okafor').click();
    await moveSelected(page, 'Tia Newteam');
    const rows = page.locator('#orgChanges tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1).getByRole('button', { name: 'Undo' })).toBeDisabled();
    await rows.nth(0).getByRole('button', { name: 'Undo' }).click();
    await expect(rows.nth(1).getByRole('button', { name: 'Undo' })).toBeEnabled();
    await rows.nth(1).getByRole('button', { name: 'Undo' }).click();
    expect(await page.evaluate(() => S.people['Ben Okafor'].teamLeader)).toBe('Ada Leader');
  });

  test('a role change moves someone between lanes; a move that would loop is refused', async ({ page }) => {
    await openOrg(page);
    await chip(page, 'Ada Leader', 'Zanele Dube').click();
    await page.locator('#orgRole').selectOption('Team Leader');
    await page.locator('#orgRoleBtn').click();
    await expect(page.locator('.org-team[data-leader="Zanele Dube"]')).toBeVisible();
    await expect(page.locator('#orgQuality .org-issue[data-kind="tlNoTeam"]')).toContainText('Zanele Dube');
    expect(await page.evaluate(() => S.people['Zanele Dube'].roleType)).toBe('Team Leader');

    // Ada reports to Mo, so Mo cannot report to Ada.
    await page.locator('.org-chip[data-name="Mo Manager"]').first().click();
    await moveSelected(page, 'Ada Leader');
    expect(await page.evaluate(() => S.people['Mo Manager'].teamLeader)).toBe('Gina Head');
    await expect(page.locator('#orgChanges tbody tr')).toHaveCount(1);
  });

  test('data quality finds the gaps, and Select feeds a fix', async ({ page }) => {
    await openOrg(page);
    const issue = (kind) => page.locator(`#orgQuality .org-issue[data-kind="${kind}"]`);
    await expect(issue('noLeader')).toContainText('Cal Loose');
    await expect(issue('notInOrg')).toContainText('Rhea Roster');
    await expect(issue('leaverShifts')).toContainText('Lee Gone');
    await expect(issue('tlNoTeam')).toContainText('Tia Newteam');
    await expect(issue('dupes')).toContainText('Pat Ncube / Pat Ncub');
    await expect(page.locator('.org-team.unassigned .org-chip[data-name="Cal Loose"]')).toBeVisible();

    await issue('noLeader').getByRole('button', { name: 'Select' }).click();
    await moveSelected(page, 'Ada Leader');
    await expect(issue('noLeader')).toHaveCount(0);
    await expect(chip(page, 'Ada Leader', 'Cal Loose')).toBeVisible();
  });

  test('an organogram import previews, applies as one change, and undoes fully', async ({ page }) => {
    await openOrg(page);
    const csv = 'Staff list,,\nName,Role,Reports To\nNia New,Agent,Omar Reyes\nBen Okafor,Agent,Omar Reyes\nKim Senior,Team Leader,Mo Manager\n';
    await page.locator('#orgImportFile').setInputFiles({ name: 'org.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.locator('#orgImport')).toBeVisible();
    await expect(page.locator('#orgImpNew')).toHaveText('1');
    await expect(page.locator('#orgImpMoves')).toHaveText('2');
    await expect(page.locator('#orgImpRoles')).toHaveText('1');
    await page.locator('#orgImportApply').click();

    expect(await page.evaluate(() => [S.people['Nia New'] && S.people['Nia New'].teamLeader, S.people['Ben Okafor'].teamLeader, S.people['Kim Senior'].teamLeader, S.people['Kim Senior'].roleType])).toEqual(['Omar Reyes', 'Omar Reyes', 'Mo Manager', 'Team Leader']);
    await expect(page.locator('#orgChanges tbody tr')).toHaveCount(1);
    await expect(page.locator('#orgChanges tbody tr')).toContainText('Organogram import: 1 added, 2 moved, 1 role changes');
    await expect(page.locator('.org-team[data-leader="Kim Senior"]')).toBeVisible();

    await page.locator('#orgChanges tbody tr').getByRole('button', { name: 'Undo' }).click();
    expect(await page.evaluate(() => [!!S.people['Nia New'], S.people['Ben Okafor'].teamLeader, S.people['Kim Senior'].teamLeader, S.people['Kim Senior'].roleType])).toEqual([false, 'Ada Leader', 'Omar Reyes', 'Agent']);
    expect(await page.evaluate(() => S.nsCanonical.people.some((p) => p.full_name === 'Nia New'))).toBe(false);
    expect(page.__jsErrors).toEqual([]);
  });

  test('a People-view leader edit on someone with dated lines is not reverted', async ({ page }) => {
    await openOrg(page);
    await setDate(page, iso(5));
    await chip(page, 'Ada Leader', 'Ben Okafor').click();
    await moveSelected(page, 'Omar Reyes');
    // The Team view's assign control writes S.people and then the canonical person.
    await page.evaluate(() => { S.people['Ben Okafor'].teamLeader = 'Tia Newteam'; nsApplyRuntimePersonEdit('Ben Okafor', { teamLeader: 'Tia Newteam' }); });
    // Any later NorthStar sync must keep Tia rather than putting a dated line's leader back.
    await page.evaluate(() => nsOrgSetRole(['Cal Loose'], 'Supervisor', '', 'test'));
    expect(await page.evaluate(() => S.people['Ben Okafor'].teamLeader)).toBe('Tia Newteam');
    expect(await leaders(page, ['Ben Okafor'], iso(6))).toEqual(['Tia Newteam']);
    expect(await leaders(page, ['Ben Okafor'], iso(-2))).toEqual(['Ada Leader']);
    expect(await page.evaluate(() => nsOrgChanges().some((c) => c.by === 'People view'))).toBe(true);
  });
});
