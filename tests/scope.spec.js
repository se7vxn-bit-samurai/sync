const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// The scope bar: department · leader (the whole tree below them) · person · period. Same org as
// tests/org.spec.js: Gina (GM) ← Mo ← Ada, Omar, Tia. Rows exist for Ada, Omar, Pat Ncube, Lee and
// Rhea (Rhea is on the roster but not in People). A second project, Project B, has its own scope.

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

function twoProjects() {
  const model = orgWorkspace();
  model.sources.push({ source_id: 'src-1', source_name: 'B.xlsx', department_name: 'Project B', loaded_at: '2026-01-19T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 });
  model.people.push({ person_id: 'p-bea', full_name: 'Bea Bee', role_type: 'Team Leader', job_title: 'Team Leader', home_department: 'Project B', source_id: 'src-1', authority_rank: 5, status: 'Active' });
  for (let i = 0; i < 5; i++) model.schedule.push({ schedule_id: `s-bea-${i}`, person_id: 'p-bea', person_name: 'Bea Bee', department: 'Project B', source_id: 'src-1', date: iso(i), uk_start: '09:00', uk_end: '17:00', is_off: false, imported_at: '2026-01-19T00:00:00.000Z' });
  return model;
}

async function openScoped(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(twoProjects()) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Omar Reyes'] && S.people['Omar Reyes'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
  await expect(page.locator('#scopeLeader')).toBeVisible();
}
const names = (page) => page.evaluate(() => gN());
const pickLeader = (page, name) => page.locator('#scopeLeader').selectOption(name);

test.describe('scope bar', () => {
  test('lists leaders as a tree, and a manager scopes to everyone below them', async ({ page }) => {
    await openScoped(page);
    expect(await names(page)).toContain('Rhea Roster');
    const options = await page.locator('#scopeLeader option').allTextContents();
    expect(options).toEqual(['All leaders', 'Gina Head (10)', '\u2003↳ Mo Manager (9)', '\u2003\u2003↳ Ada Leader (2)', '\u2003\u2003↳ Omar Reyes (4)']);

    await pickLeader(page, 'Mo Manager');
    await expect.poll(() => names(page)).toEqual(['Ada Leader', 'Lee Gone', 'Omar Reyes', 'Pat Ncube']);
    await expect(page.locator('#scopeChip')).toHaveText('10 in scope ✕');
    // Every view built on the shared filters follows: the Day view no longer lists Rhea.
    await page.evaluate((d) => { const day = new Date(d + 'T00:00:00'); S.calSubTab = 'day'; S.calDay = day; S.month = day.getFullYear() + '-' + String(day.getMonth()).padStart(2, '0'); setTab('calendar'); ren(); }, iso(1));
    await expect(page.locator('#ca')).toContainText('Omar Reyes');
    await expect(page.locator('#ca')).not.toContainText('Rhea Roster');
    expect(page.__jsErrors).toEqual([]);
  });

  test('a team leader scopes to their team; the person pill narrows inside it; clearing restores all', async ({ page }) => {
    await openScoped(page);
    await pickLeader(page, 'Omar Reyes');
    await expect.poll(() => names(page)).toEqual(['Lee Gone', 'Omar Reyes', 'Pat Ncube']);
    await page.evaluate(() => { S.peopleSubTab = 'agents'; railNavPeople('agents'); });
    await expect(page.locator('#ca')).toContainText('Kim Senior');
    await expect(page.locator('#ca')).not.toContainText('Zanele Dube');

    await page.evaluate(() => setLeader('Pat Ncube'));
    await expect.poll(() => names(page)).toEqual(['Pat Ncube']);
    await page.evaluate(() => clearLeaderFilter());
    await expect.poll(() => names(page)).toEqual(['Lee Gone', 'Omar Reyes', 'Pat Ncube']);

    await page.locator('#scopeChip').click();
    await expect.poll(() => names(page)).toContain('Rhea Roster');
    await expect(page.locator('#scopeChip')).toHaveCount(0);
  });

  test('acting cover widens the acting person\'s scope to the team they cover', async ({ page }) => {
    await openScoped(page);
    await page.evaluate(([a, b]) => coverAssign('Kim Senior', 'Ada Leader', a, b, 'Acting Team Lead'), [iso(0), iso(2)]);
    await page.evaluate(() => rerenderChromeOnly());
    await expect(page.locator('#scopeLeader option', { hasText: 'Kim Senior' })).toContainText('acting');
    await pickLeader(page, 'Kim Senior');
    await expect.poll(() => names(page)).toEqual(['Ada Leader']);
  });

  test('the tree is read on the month on screen, so a dated move shows up in the month it starts', async ({ page }) => {
    await openScoped(page);
    const next = await page.evaluate(() => { const d = new Date(); return excKey(new Date(d.getFullYear(), d.getMonth() + 1, 1)); });
    await page.evaluate((d) => nsOrgMove(['Pat Ncube'], 'Ada Leader', d, 'test'), next);
    await pickLeader(page, 'Ada Leader');
    await expect.poll(() => names(page)).toEqual(['Ada Leader']);
    await page.evaluate(() => { const d = new Date(); S.month = d.getFullYear() + '-' + String(d.getMonth() + 1 > 11 ? 0 : d.getMonth() + 1).padStart(2, '0'); if (d.getMonth() === 11) S.month = (d.getFullYear() + 1) + '-00'; invalidateDerivedCache(); });
    await expect.poll(() => names(page)).toEqual(['Ada Leader', 'Pat Ncube']);
  });

  test('each project keeps its own scope, and it syncs with the workspace', async ({ page }) => {
    await openScoped(page);
    await pickLeader(page, 'Omar Reyes');
    await expect.poll(() => page.evaluate(() => scopeGet().leader)).toBe('Omar Reyes');
    await page.evaluate(() => _syncOpenProject('Project B'));
    await page.waitForFunction(() => S.activeDept === 'Project B');
    expect(await page.evaluate(() => [scopeGet().leader, gN()])).toEqual(['', ['Bea Bee']]);
    await page.evaluate(() => _syncOpenProject('Project A'));
    await page.waitForFunction(() => S.activeDept === 'Project A');
    await expect.poll(() => names(page)).toEqual(['Lee Gone', 'Omar Reyes', 'Pat Ncube']);

    const pushed = await page.evaluate(async () => {
      _flushPersistQueue();
      await window._syncPushWorkspaceNow();
      const data = window.__fakeSupabase.lastPush().data;
      return data.sc_scope;
    });
    expect(JSON.parse(typeof pushed === 'string' ? pushed : JSON.stringify(pushed))).toEqual({ 'Project A': { leader: 'Omar Reyes', dept: '' } });
  });
});
