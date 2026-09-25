const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// People → Absence (leave and absence register) and UK bank holidays.
// Everyone below works Mon–Fri with weekends off, from M-7 to M+56, where M is the Monday about ten
// weeks ago (so weekday rules are the same whatever day the suite runs).
//   Sam: SICK on the roster Mon–Wed of week 1, a logged sick day (Fri M+18) and a People sick status
//        (Mon M+28): three occasions in eight weeks, one of them three days long, all on Mon/Fri edges.
//        (A Friday and the next Monday would be one occasion: the weekend off between joins them.)
//   Bo:  SICK Fri M+4, then Mon M+7 and Tue M+8, with the weekend off between: one 3-day occasion.
//   Fay: four logged family responsibility days (Wednesdays).
//   Ann: annual leave all of week 3, and one day with roster code RL.
//   Ola: reports to Oz, not to Lea, and has one sick day.

const PROJECT = 'Project A';
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function anchorMonday() { const d = new Date(); d.setDate(d.getDate() - 70); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d; }
const M = anchorMonday();
const at = (n) => { const d = new Date(M); d.setDate(d.getDate() + n); return isoOf(d); };

function absenceWorkspace() {
  const source = 'src-0';
  const person = (id, name, role, leaderId, leaderName) => ({ person_id: id, full_name: name, role_type: role, job_title: role, home_department: PROJECT, source_id: source, authority_rank: 5, status: 'Active', reports_to_person_id: leaderId || '', manager_name: leaderName || '' });
  const rows = (id, name, marks) => Array.from({ length: 64 }, (_, i) => {
    const n = i - 7, date = at(n), dow = new Date(date + 'T00:00:00').getDay(), mark = marks[n] || ((dow === 0 || dow === 6) ? 'OFF' : '');
    return { schedule_id: `s-${id}-${i}`, person_id: id, person_name: name, department: PROJECT, source_id: source, date,
      uk_start: mark ? '' : '09:00', uk_end: mark ? '' : '17:00', is_off: !!mark, off_type: mark, imported_at: '2026-01-20T00:00:00.000Z' };
  });
  return {
    schema: 'sync.northstar.canonical', version: 1, updated_at: new Date().toISOString(),
    sources: [{ source_id: source, source_name: 'People Hub.xlsx', department_name: PROJECT, loaded_at: '2026-01-20T00:00:00.000Z', sheets: 1, source_kind: 'peoplehub', authority_rank: 5 }],
    people: [
      person('p-lea', 'Lea Lead', 'Team Leader'), person('p-oz', 'Oz Other', 'Team Leader'),
      person('p-sam', 'Sam Sick', 'Agent', 'p-lea', 'Lea Lead'), person('p-bo', 'Bo Bridge', 'Agent', 'p-lea', 'Lea Lead'),
      person('p-fay', 'Fay Family', 'Agent', 'p-lea', 'Lea Lead'), person('p-ann', 'Ann Annual', 'Agent', 'p-lea', 'Lea Lead'),
      person('p-ola', 'Ola Other', 'Agent', 'p-oz', 'Oz Other'),
    ],
    schedule: [
      ...rows('p-lea', 'Lea Lead', {}), ...rows('p-oz', 'Oz Other', {}),
      ...rows('p-sam', 'Sam Sick', { 0: 'SICK', 1: 'SICK', 2: 'SICK' }),
      ...rows('p-bo', 'Bo Bridge', { 4: 'SICK', 7: 'SICK', 8: 'SICK' }),
      ...rows('p-fay', 'Fay Family', {}),
      ...rows('p-ann', 'Ann Annual', { 14: 'AL', 15: 'AL', 16: 'AL', 17: 'AL', 18: 'AL', 25: 'RL' }),
      ...rows('p-ola', 'Ola Other', { 10: 'SICK' }),
    ],
  };
}

async function openAbsence(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(absenceWorkspace()) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Sam Sick'] && S.people['Sam Sick'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
  await page.evaluate(([fri, mon, fam]) => {
    const ex = (date, agentName, type, notes) => ({ id: 'x-' + agentName + date + type, date, person: 'Lea Lead', agentName, type, notes, hoursLost: 8, severity: 'high' });
    S.exceptions = [ex(fri, 'Sam Sick', 'sick', 'Flu'), ...fam.map((d) => ex(d, 'Fay Family', 'family_responsibility', 'Child ill'))];
    S.exceptionsVer = (S.exceptionsVer || 0) + 1;
    S.agentStatuses['Sam Sick|' + mon] = 'sick';
    invalidateDerivedCache();
    railNavPeople('absence');
  }, [at(18), at(28), [at(9), at(16), at(23), at(30)]]);
  await expect(page.locator('#absTable')).toBeVisible();
}
const row = (page, name) => page.locator(`#absTable tr[data-name="${name}"]`);
const days = (page, name, type) => row(page, name).locator(`td[data-type="${type}"]`);

test.describe('Absence register', () => {
  test('counts days by leave type from roster, logged events and People statuses; sensitive detail starts hidden', async ({ page }) => {
    await openAbsence(page);
    await expect(days(page, 'Sam Sick', 'sick')).toHaveText('5');
    await expect(days(page, 'Bo Bridge', 'sick')).toHaveText('3');
    await expect(days(page, 'Fay Family', 'family')).toHaveText('4');
    await expect(days(page, 'Ann Annual', 'annual')).toHaveText('5');
    await expect(row(page, 'Sam Sick').locator('td[data-col="flags"]')).toHaveText('hidden');
    await expect(page.locator('#absFlags')).toHaveCount(0);
    await expect(page.locator('#absSummary [data-stat="Flagged"] b')).toHaveText('hidden');
    // Expanded detail lists the days but not the reasons.
    await row(page, 'Sam Sick').locator('.ldr-name').click();
    await expect(page.locator('tr.abs-detail')).toContainText('(logged)');
    await expect(page.locator('tr.abs-detail')).not.toContainText('Flu');
    expect(page.__jsErrors).toEqual([]);
  });

  test('with sensitive detail on: BCEA sick-note flags, family days and patterns', async ({ page }) => {
    await openAbsence(page);
    await page.locator('#absShow').check();
    const flag = (name, kind) => page.locator(`#absFlags .abs-flag[data-name="${name}"][data-kind="${kind}"]`);
    await expect(flag('Sam Sick', 'sickLong')).toContainText('3 consecutive sick days from');
    await expect(flag('Sam Sick', 'sickThird')).toContainText('3rd sick occasion within 8 weeks');
    await expect(flag('Sam Sick', 'monfri')).toContainText('3 of 5 unplanned days fall on a Monday or Friday');
    await expect(flag('Sam Sick', 'bridge')).toContainText('3 of 3 unplanned absences');
    // Friday + the following Monday and Tuesday, over a weekend off, is one occasion of three days.
    await expect(flag('Bo Bridge', 'sickLong')).toContainText('3 consecutive sick days from Fri');
    await expect(flag('Fay Family', 'family')).toContainText('4 family responsibility days in 12 months');
    // One bridged occasion is not a pattern, even though two of its three days are a Friday and a Monday.
    await expect(flag('Bo Bridge', 'monfri')).toHaveCount(0);
    await expect(page.locator('#absFlags .abs-flag[data-name="Ann Annual"]')).toHaveCount(0);
    await row(page, 'Sam Sick').locator('.ldr-name').click();
    await expect(page.locator('tr.abs-detail')).toContainText('Flu');

    // The choice is this device's own: it is not in the synced stores; leave types are.
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_absence_privacy') || '{}').show || (_persistPendingSet.has('sc_absence_privacy') && JSON.parse(_persistPendingSet.get('sc_absence_privacy')).show))).toBe(true);
    const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'northstar', 'northstar.js.html'), 'utf8');
    const synced = core.match(/const SYNC_LOCAL_KEYS=\[([^\]]*)\]/)[1];
    expect(synced).toContain('"sc_leave_types"');
    expect(synced).not.toContain('sc_absence_privacy');
  });

  test('exports leave health reasons out unless they are included', async ({ page }) => {
    await openAbsence(page);
    expect(await page.evaluate(() => [absenceExportNote({ type: 'sick', notes: 'Flu' }), absenceExportNote({ type: 'annual_leave', notes: 'Holiday' })])).toEqual(['(hidden: sensitive)', 'Holiday']);
    const csv = async () => {
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#absExport').click()]);
      return fs.readFileSync(await download.path(), 'utf8');
    };
    const plain = await csv();
    expect(plain.split('\n')[0]).not.toContain('flags');
    expect(plain).not.toContain('Flu');
    await page.locator('#absExportNotes').check();
    expect(await page.evaluate(() => absenceExportNote({ type: 'sick', notes: 'Flu' }))).toBe('Flu');
    const full = await csv();
    expect(full.split('\n')[0]).toContain('flags');
    expect(full).toContain('Flu');
  });

  test('leave types can be renamed and extended with roster codes', async ({ page }) => {
    await openAbsence(page);
    await expect(row(page, 'Ann Annual').locator('td[data-type="custom_religious_leave"]')).toHaveCount(0);
    await page.locator('#absTypes summary').click();
    await page.locator('#absNewLabel').fill('Religious leave');
    await page.locator('#absNewCodes').fill('RL');
    await page.locator('#absAddType').click();
    await expect(row(page, 'Ann Annual').locator('td[data-type="custom_religious_leave"]')).toHaveText('1');
    await page.locator('#absTypes summary').click();
    const label = page.locator('#absTypes tr[data-type="sick"] input').first();
    await label.fill('Sick');
    await label.dispatchEvent('change');
    await expect(page.locator('#absTable thead')).toContainText('Sick');
    await expect(page.locator('#absTable thead')).not.toContainText('Sick leave');
  });

  test('follows the scope bar', async ({ page }) => {
    await openAbsence(page);
    await expect(row(page, 'Ola Other')).toHaveCount(1);
    await page.locator('#scopeLeader').selectOption('Lea Lead');
    await expect(row(page, 'Ola Other')).toHaveCount(0);
    await expect(row(page, 'Sam Sick')).toHaveCount(1);
  });
});

test.describe('UK bank holidays', () => {
  test('England and Wales rules, substitute days and one-offs', async ({ page }) => {
    await openApp(page, { workspaceRow: null });
    const got = await page.evaluate(() => ['2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-26', '2026-12-28', '2027-01-01', '2027-12-27', '2027-12-28', '2023-05-08', '2022-06-02', '2022-06-03', '2020-05-04', '2020-05-08']
      .map((d) => [d, (ukBankHoliday(d) || {}).name || null]));
    expect(got).toEqual([
      ['2026-04-03', 'Good Friday'], ['2026-04-06', 'Easter Monday'], ['2026-05-04', 'Early May bank holiday'],
      ['2026-05-25', 'Spring bank holiday'], ['2026-08-31', 'Summer bank holiday'], ['2026-12-25', 'Christmas Day'],
      ['2026-12-26', null], ['2026-12-28', 'Boxing Day (substitute day)'], ['2027-01-01', "New Year's Day"],
      ['2027-12-27', 'Christmas Day (substitute day)'], ['2027-12-28', 'Boxing Day (substitute day)'],
      ['2023-05-08', 'Coronation bank holiday'], ['2022-06-02', 'Spring bank holiday'], ['2022-06-03', 'Platinum Jubilee bank holiday'],
      ['2020-05-04', null], ['2020-05-08', 'Early May bank holiday (VE Day)'],
    ]);
    // Listed next to SA public holidays.
    expect(await page.evaluate(() => holidaysBetween('2026-12-24', '2026-12-28'))).toEqual([
      { iso: '2026-12-25', sa: 'Christmas Day', uk: 'Christmas Day' },
      { iso: '2026-12-26', sa: 'Day of Goodwill', uk: '' },
      { iso: '2026-12-28', sa: '', uk: 'Boxing Day (substitute day)' },
    ]);
  });

  test('shown in the Schedule Window and the calendar', async ({ page }) => {
    await openAbsence(page);
    await page.evaluate(() => openScheduleWindow('Sam Sick', { mode: 'custom', from: '2026-12-24', to: '2026-12-29' }));
    await expect(page.locator('#swinTable tr[data-iso="2026-12-28"] .swin-tag.t-uk')).toHaveAttribute('title', 'UK bank holiday: Boxing Day (substitute day)');
    await expect(page.locator('#swinTable tr[data-iso="2026-12-25"] .swin-tag.t-ph')).toBeVisible();
    await page.evaluate(() => { closeScheduleWindow(); S.calSubTab = 'day'; S.month = '2026-11'; S.calDay = new Date(2026, 11, 1); setTab('calendar'); ren(); });
    await expect(page.locator('.cal-d.uk-badge')).toHaveCount(2);
  });
});
