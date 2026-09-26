const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// The universal workspace (the dept strip's "Universal" tab) combines every open project into one
// read-only view, with people renamed "Name · Project". Projects opened from the picker live in
// the canonical model and keep no in-session snapshot, so Universal has to read them from there,
// must never write its renamed copies back to storage, and switching back has to reopen the project.

const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Both projects have a team led by "Ada Leader" (same name, different people). Project B's Ada is
// on leave today; her agents follow her rota.
function project(name, pre) {
  const src = `src-${pre}`;
  const person = (id, full, role, leader) => ({ person_id: pre + id, full_name: full, role_type: role, job_title: role, home_department: name, source_id: src, authority_rank: 5, status: 'Active', reports_to_person_id: leader ? pre + leader : '', manager_name: leader ? 'Ada Leader' : '' });
  const rows = Array.from({ length: 21 }, (_, i) => {
    const off = pre === 'b-' && i === 7;
    return { schedule_id: `s-${pre}${i}`, person_id: `${pre}tl`, person_name: 'Ada Leader', department: name, source_id: src, date: iso(i - 7),
      uk_start: off ? '' : '09:00', uk_end: off ? '' : '17:30', is_off: off, off_type: off ? 'LEAVE' : '', imported_at: '2026-01-20T00:00:00.000Z' };
  });
  return {
    source: { source_id: src, source_name: `${name} Hub.xlsx`, department_name: name, loaded_at: '2026-01-20T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 },
    people: [person('tl', 'Ada Leader', 'Team Leader'), person('a1', `${pre}Zed One`, 'Agent', 'tl'), person('a2', `${pre}Yan Two`, 'Agent', 'tl')],
    schedule: rows,
  };
}

async function openBoth(page) {
  const A = project('Project A', 'a-'), B = project('Project B', 'b-');
  const model = { schema: 'sync.northstar.canonical', version: 1, updated_at: new Date().toISOString(), sources: [A.source, B.source], people: [...A.people, ...B.people], schedule: [...A.schedule, ...B.schedule] };
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(model) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate(() => _syncOpenProject('Project A'));
  await page.waitForFunction(() => S.entries.length > 0);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
  await page.evaluate(() => _syncOpenProject('Project B'));
  await page.waitForFunction(() => S.activeDept === 'Project B' && S.entries.length > 0);
}
const stored = (page) => page.evaluate(() => {
  _flushAllPendingPersist();
  const read = (k) => { const v = _persistPendingSet.has(k) ? _persistPendingSet.get(k) : localStorage.getItem(k); return v ? JSON.parse(v) : null; };
  return { people: Object.keys(read('sc_people') || {}).sort(), exceptions: (read('sc_exceptions') || []).map((x) => [x.person, x.type]) };
});

test.describe('Universal workspace', () => {
  test('combines picker-opened projects on the Leaders board, one team per project', async ({ page }) => {
    await openBoth(page);
    await page.evaluate(() => activateUniversalWorkspace());
    await page.evaluate(() => railNavPeople('leaders'));
    const rows = page.locator('#ldrTable tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#ldrTable thead')).toContainText('Dept');
    const a = page.locator('#ldrTable tr[data-leader="Ada Leader · Project A"]');
    const b = page.locator('#ldrTable tr[data-leader="Ada Leader · Project B"]');
    await expect(a.locator('td').nth(1)).toHaveText('Project A');
    await expect(a.locator('td[data-col="working"]')).toHaveText('2');
    await expect(b.locator('td[data-col="leader"]')).toContainText('Leave');
    await expect(b.locator('td[data-col="leader"]')).toContainText('no cover');
    await expect(b.locator('td[data-col="none"]')).toHaveText('2');
    expect(page.__jsErrors).toEqual([]);
  });

  test('never writes its renamed copies to storage, and switching back reopens the project', async ({ page }) => {
    await openBoth(page);
    await page.evaluate(() => { addException(new Date(), 'Ada Leader', 'sick', 'medium', 8, 0, 'flu', 'b-Zed One'); });
    const before = await stored(page);
    expect(before.exceptions).toEqual([['Ada Leader', 'sick']]);
    expect(before.people.some((n) => n.includes(' · '))).toBe(false);

    await page.evaluate(() => activateUniversalWorkspace());
    await page.evaluate(() => { S.covMin = 2; schedulePersist(true); ren(); });
    const during = await stored(page);
    expect(during.people).toEqual(before.people);
    expect(during.exceptions).toEqual(before.exceptions);
    // Preferences still save.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_settings')).covMin)).toBe(2);

    await page.evaluate(() => activateDept('Project A'));
    expect(await page.evaluate(() => [S.activeDept, isUniversalWorkspace(), [...new Set(S.entries.map((e) => e.name))], Object.keys(S.people).some((n) => n.includes(' · ')), S.exceptions.length]))
      .toEqual(['Project A', false, ['Ada Leader'], false, 1]);
    expect(await stored(page)).toEqual(before);
    // And between two picker-opened projects, the other project's rows come up (not the last one's).
    await page.evaluate(() => activateDept('Project B'));
    expect(await page.evaluate(() => [S.activeDept, S.entries.filter((e) => e.isOff).length])).toEqual(['Project B', 1]);
    expect(page.__jsErrors).toEqual([]);
  });
});
