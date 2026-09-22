const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp } = require('./helpers');

// Each of these used to report success while handing the user nothing: an Absence view that read
// "0 events" over a roster full of sick days, a CSV download with zero bytes, and localStorage
// writes that failed without a word.
const ROSTER = path.join(__dirname, 'fixtures', 'rosters', 'r_80x31.csv');

async function importRoster(page) {
  await openApp(page, { workspaceRow: null });
  await page.waitForFunction(() => { try { return requireExcelParserReady(); } catch (e) { return false; } });
  await page.setInputFiles('#fi', ROSTER);
  await page.getByRole('button', { name: /^Load \d+ entries/ }).click();
  await page.waitForFunction(() => S.entries && S.entries.length === 2480);
}

const notifications = (page) => page.evaluate(() => _notifs.map((n) => n.msg));

test.describe('reporting surfaces', () => {
  test('Absence counts the sick, leave and training days already in the roster', async ({ page }) => {
    await importRoster(page);
    const got = await page.evaluate(() => {
      const monthEnt = S.entries.filter((e) => { const d = new Date(e.date); return d.getFullYear() === 2026 && d.getMonth() === 8; });
      const expected = monthEnt.filter((e) => e.isOff && /^(SICK|LEAVE|TRAINING)$/i.test(String(e.offL || ''))).length;
      const div = document.createElement('div');
      div.innerHTML = rAbsenceBreakdown(2026, 8, monthEnt);
      const m = div.textContent.match(/(\d+) events/);
      return { expected, events: m ? Number(m[1]) : -1, text: div.textContent };
    });
    expect(got.expected).toBeGreaterThan(0);
    expect(got.events).toBe(got.expected);
    expect(got.text).toContain('read from the schedule');
  });

  test('a hand-logged exception wins over the same derived absence instead of double counting', async ({ page }) => {
    await importRoster(page);
    const got = await page.evaluate(() => {
      const monthEnt = S.entries.filter((e) => { const d = new Date(e.date); return d.getFullYear() === 2026 && d.getMonth() === 8; });
      const sick = monthEnt.find((e) => e.isOff && /^SICK$/i.test(String(e.offL || '')));
      const d = new Date(sick.date);
      const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const render = () => { const div = document.createElement('div'); div.innerHTML = rAbsenceBreakdown(2026, 8, monthEnt); return div.textContent; };
      const count = (t) => Number(t.match(/(\d+) events/)[1]);
      const before = render();
      const realEffExc = effExc;
      effExc = () => realEffExc().concat([{ date, type: 'sick', person: sick.name, hoursLost: 4 }]);
      try { const after = render(); return { before: count(before), after: count(after), afterText: after }; } finally { effExc = realEffExc; }
    });
    expect(got.afterText).toContain('1 logged by hand');
    expect(got.after).toBe(got.before);
  });

  test('exporting a person CSV with nobody selected explains instead of downloading an empty file', async ({ page }) => {
    await importRoster(page);
    let downloads = 0;
    page.on('download', () => { downloads++; });
    await page.evaluate(() => { S.nsSchedulePerson = null; nsExportCsv('person'); });
    await page.waitForTimeout(500);
    expect(downloads).toBe(0);
    expect(await notifications(page)).toContain('Choose a person on the Schedule Window first — nothing to export yet.');
  });

  test('a full storage quota is reported once, not swallowed', async ({ page }) => {
    await openApp(page, { workspaceRow: null });
    const msgs = await page.evaluate(() => {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
      try {
        _persistSet('sc_probe_a', 'x', { critical: true });
        _persistSet('sc_probe_b', 'y', { critical: true });
      } finally { Storage.prototype.setItem = real; }
      return _notifs.map((n) => n.msg).filter((m) => /storage is full/i.test(m));
    });
    expect(msgs).toHaveLength(1);
  });
});
