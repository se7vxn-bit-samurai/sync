const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// People → Leaders (Leaders board). Same org as tests/org.spec.js, except Ada is on leave T+2..T+4
// and Pat Ncube on T+5. Teams: Ada (Zanele, Ben: follow Ada's rota) and Omar (Kim, Pat Ncub:
// follow Omar's rota; Pat Ncube and Lee: own rows). Tia leads nobody, so she has no row.

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
      ...rows('p-ada', 'Ada Leader', '09:00', '17:30', [2, 3, 4]),
      ...rows('p-omar', 'Omar Reyes', '08:00', '16:30'),
      ...rows('p-pat', 'Pat Ncube', '08:00', '16:30', [5]),
      ...rows('p-lee', 'Lee Gone', '10:00', '18:30'),
      ...rows('p-rhea', 'Rhea Roster', '09:00', '17:30'),
    ],
  };
}

async function openBoard(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(orgWorkspace()) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Omar Reyes'] && S.people['Omar Reyes'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
  await page.evaluate(() => railNavPeople('leaders'));
  await expect(page.locator('#ldrTable')).toBeVisible();
}
const row = (page, leader) => page.locator(`#ldrTable tr[data-leader="${leader}"]`);
const cell = (page, leader, col) => row(page, leader).locator(`td[data-col="${col}"]`);
async function goTo(page, day) {
  await page.locator('#ldrDate').fill(day);
  await page.locator('#ldrDate').dispatchEvent('change');
  await expect(page.locator('#ldrDate')).toHaveValue(day);
}

test.describe('Leaders board', () => {
  test('one row per team with today\'s counts, from rota, People statuses and exceptions', async ({ page }) => {
    await openBoard(page);
    await expect(page.locator('#ldrTable tbody tr')).toHaveCount(2);
    await expect(row(page, 'Tia Newteam')).toHaveCount(0);
    // On a phone the board scrolls as one column; the table must keep its height.
    expect(await page.locator('#ldrTable').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(60);
    await expect(row(page, 'Ada Leader').locator('td').nth(2)).toHaveText('2');
    await expect(cell(page, 'Ada Leader', 'working')).toHaveText('2');
    await expect(cell(page, 'Omar Reyes', 'working')).toHaveText('4');

    // Kim reported sick and Pat marked present, in People.
    await page.evaluate(() => { setAgentStatusQuick('Kim Senior', 'sick'); setAgentStatusQuick('Pat Ncube', 'present'); rPeople($('ca')); });
    await expect(cell(page, 'Omar Reyes', 'sick')).toHaveText('1');
    await expect(cell(page, 'Omar Reyes', 'working')).toContainText('3');
    await expect(cell(page, 'Omar Reyes', 'working')).toContainText('(1 in)');
    await expect(page.locator('#ldrSummary [data-stat="Sick"] b')).toHaveText('1');
    // Leave in the next seven days: Ada from T+2, Pat Ncube on T+5.
    await expect(cell(page, 'Ada Leader', 'upcoming')).toHaveAttribute('title', 'Ada Leader');
    await expect(cell(page, 'Omar Reyes', 'upcoming')).toHaveAttribute('title', 'Pat Ncube');
    expect(page.__jsErrors).toEqual([]);
  });

  test('a leader away with no cover is flagged and sorts first; booking cover shows who is acting', async ({ page }) => {
    await openBoard(page);
    await goTo(page, iso(3));
    await expect(cell(page, 'Ada Leader', 'leader')).toContainText('Leave');
    await expect(cell(page, 'Ada Leader', 'leader')).toContainText('no cover');
    // Zanele and Ben follow Ada's rota, which has no shift while she is away: not leave, no shift.
    await expect(cell(page, 'Ada Leader', 'none')).toHaveText('2');
    await expect(cell(page, 'Ada Leader', 'leave')).toHaveText('0');
    await expect(cell(page, 'Ada Leader', 'working')).toContainText('thin');
    await expect(page.locator('#ldrTable tbody tr').first()).toHaveAttribute('data-leader', 'Ada Leader');
    await expect(page.locator('#ldrSummary [data-stat="No cover"] b')).toHaveText('1');

    await page.evaluate(([a, b]) => coverAssign('Zanele Dube', 'Ada Leader', a, b, 'Acting Team Lead'), [iso(2), iso(4)]);
    await page.evaluate(() => railNavPeople('leaders'));
    await expect(cell(page, 'Ada Leader', 'leader')).toContainText('Zanele Dube acting');
    await expect(cell(page, 'Ada Leader', 'leader')).not.toContainText('no cover');
    await expect(page.locator('#ldrSummary [data-stat="No cover"] b')).toHaveText('0');
  });

  test('follows the scope bar, and a row opens the team or its Day view', async ({ page }) => {
    await openBoard(page);
    await page.locator('#scopeLeader').selectOption('Omar Reyes');
    await expect(page.locator('#ldrTable tbody tr')).toHaveCount(1);
    await expect(row(page, 'Omar Reyes')).toBeVisible();
    await page.locator('#scopeChip').click();
    await expect(page.locator('#ldrTable tbody tr')).toHaveCount(2);

    await row(page, 'Ada Leader').locator('.ldr-name').click();
    expect(await page.evaluate(() => [S.peopleSubTab, S.selectedTL])).toEqual(['team', 'Ada Leader']);

    await page.evaluate(() => railNavPeople('leaders'));
    await row(page, 'Omar Reyes').getByRole('button', { name: 'Day' }).click();
    expect(await page.evaluate(() => [S.tab, S.calSubTab, scopeGet().leader, excKey(S.calDay)])).toEqual(['calendar', 'day', 'Omar Reyes', iso(0)]);
    await expect(page.locator('#scopeChip')).toBeVisible();
    await expect(page.locator('#ca')).not.toContainText('Rhea Roster');
  });

  test('says what it needs when there are no teams', async ({ page }) => {
    await openBoard(page);
    await page.evaluate(() => { Object.values(S.people).forEach((p) => { p.teamLeader = ''; }); nsOrgLines(); railNavPeople('leaders'); });
    await expect(page.locator('#ca')).toContainText('No teams on');
    await expect(page.locator('#ca')).toContainText('import an organogram');
  });
});
