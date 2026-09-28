const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, PROFILE } = require('./helpers');

// Save+ is the file people keep, share and re-import, so its shape is a contract: a few sheets
// grouped by what they are read for, plus the hidden state the app restores from.
const ROSTERS = path.join(__dirname, 'fixtures', 'rosters');
const TPA = path.join(ROSTERS, 'tpa_team_blocks_clean.xlsx');
const HOME = path.join(ROSTERS, 'home_claims_4wk.xlsx');
const LEGACY = path.join(__dirname, 'fixtures', 'workbooks', 'legacy_saveplus_tpa.xlsx');

async function ready(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: null });
  await page.waitForFunction(() => { try { return requireExcelParserReady(); } catch (e) { return false; } }, null, { timeout: 30_000 });
}
async function importRoster(page, file) {
  await page.setInputFiles('#fi', file);
  const overlay = page.locator('#parsePreviewOverlay');
  await overlay.waitFor({ timeout: 40_000 });
  await overlay.getByRole('button', { name: /^Load \d+ entries/ }).click();
  await page.waitForFunction(() => S.entries && S.entries.length > 0, null, { timeout: 30_000 });
}
async function saveTo(page, dest) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.evaluate(() => expSavePlus('all'))]);
  await dl.saveAs(dest);
  return dest;
}
// Sheet names, visibility and row counts of a downloaded workbook, read with the app's own SheetJS.
function inspect(page, file) {
  const bytes = Array.from(fs.readFileSync(file));
  return page.evaluate((bytes) => {
    const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' });
    const hidden = new Set((wb.Workbook && wb.Workbook.Sheets || []).filter((s) => s.Hidden).map((s) => s.name));
    const rows = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: '' });
    return {
      visible: wb.SheetNames.filter((n) => !hidden.has(n)),
      hidden: wb.SheetNames.filter((n) => hidden.has(n)),
      scheduleRows: rows('Schedule_Data').length,
      roster: wb.Sheets['Weekly_Roster'] ? rows('Weekly_Roster') : [],
      summaryHead: wb.Sheets['Summary'] ? XLSX.utils.sheet_to_json(wb.Sheets['Summary'], { header: 1, defval: '' })[0][0] : '',
    };
  }, bytes);
}

test.describe('Save+ workbook', () => {
  // East of Greenwich is where the date-shift bug in anchor dates showed up; run there.
  test.use({ timezoneId: 'Africa/Johannesburg' });
  test.skip(({ isMobile }) => isMobile, 'export is viewport-independent');

  test('groups the workbook into a few sheets and drops the empty and internal tabs', async ({ page }, info) => {
    await ready(page);
    await importRoster(page, TPA);
    const out = await saveTo(page, info.outputPath('tpa-saveplus.xlsx'));
    const got = await inspect(page, out);
    // No per-leader tabs, no QoL_State, and no Overview/Analytics/Blueprint/Positions/Notes/Exceptions/
    // Coaching/Change_Log tabs. Nothing was logged, so there is no Activity tab either.
    expect(got.visible).toEqual(['Summary', 'Weekly_Roster', 'Rotation', 'People', 'Schedule_Data', 'Sources']);
    expect(got.hidden).toEqual(['_app_state', '_app_state_json']);
    expect(got.scheduleRows).toBe(238);
    // One row per leader per week, leader named on every row: 17 weeks x 2 leaders.
    expect(got.roster).toHaveLength(34);
    expect(new Set(got.roster.map((r) => r['Leader']))).toEqual(new Set(['Pontsho', 'Bontle']));
  });

  test('anchors each leader to a Monday, in local time', async ({ page }) => {
    await ready(page);
    await importRoster(page, TPA);
    const days = await page.evaluate(() => {
      const pos = S.plPositions[S.activeDept] || {};
      return Object.values(pos).map((p) => { const [y, m, d] = p.anchorMonday.split('-').map(Number); return new Date(y, m - 1, d).getDay(); });
    });
    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d === 1)).toBe(true);
  });

  test('a Save+ file restores completely, and so does one written by the previous format', async ({ page }, info) => {
    await ready(page);
    await importRoster(page, TPA);
    const out = await saveTo(page, info.outputPath('roundtrip.xlsx'));
    for (const file of [out, LEGACY]) {
      await ready(page);
      await page.setInputFiles('#fi', file);
      await page.waitForFunction(() => S.entries && S.entries.length === 238, null, { timeout: 40_000 });
      const got = await page.evaluate(() => ({
        names: [...new Set(S.entries.map((e) => e.name))].sort(),
        teams: [...new Set(S.entries.map((e) => e.team))],
        weeks: [...new Set(S.entries.map((e) => e.week))].sort(),
        shs: S.shs,
      }));
      expect(got).toEqual({ names: ['Bontle', 'Pontsho'], teams: ['Interventions'], weeks: ['W1', 'W2'], shs: [] });
    }
  });

  test('logged activity lands in one Activity sheet and exceptions restore from it', async ({ page }, info) => {
    await ready(page);
    await importRoster(page, TPA);
    await page.evaluate(() => {
      S.exceptions = [{ id: 'e1', dept: S.activeDept, person: 'Pontsho', agentName: '', leaderId: 'Pontsho', date: '2026-10-06', type: 'sick', severity: 'full-day', hoursLost: 8, hoursWorked: 0, scheduledHrs: 8, notes: '', loggedAt: '2026-10-06T08:00:00Z', source: 'manual', authorName: 'me' }];
      S.notes = { '2026-10-07': 'Cover agreed with Bontle' };
    });
    const out = await saveTo(page, info.outputPath('activity.xlsx'));
    const got = await page.evaluate((bytes) => {
      const wb = XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: true });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets['Activity'], { defval: '' });
      S.activeDept = 'restore-check';
      const back = readExceptionsFromWorkbook(wb);
      return { kinds: rows.map((r) => r.kind).sort(), back: back.map((x) => [x.person, x.type, x.date, x.hoursLost]) };
    }, Array.from(fs.readFileSync(out)));
    expect(got.kinds).toEqual(expect.arrayContaining(['exception', 'note']));
    expect(got.back).toEqual([['Pontsho', 'sick', '2026-10-06', 8]]);
  });

  test("keeps the source's own week numbers next to the rotation week", async ({ page }, info) => {
    await ready(page);
    await importRoster(page, HOME);
    const got = await page.evaluate(() => {
      const by = {};
      S.entries.forEach((e) => { const k = e.name; (by[k] = by[k] || new Set()).add(e._fileWeek + '>' + e.week); });
      return { fileWeeks: [...new Set(S.entries.map((e) => e._fileWeek))].sort(), people: Object.keys(by).length };
    });
    expect(got).toEqual({ fileWeeks: ['W1', 'W2', 'W3', 'W4'], people: 2 });
    const out = await saveTo(page, info.outputPath('home.xlsx'));
    const sheet = await inspect(page, out);
    expect(sheet.roster.length).toBeGreaterThan(0);
    expect(Object.keys(sheet.roster[0])).toContain('File wk');
  });
});
