const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, waitForPicker, picker } = require('./helpers');

// Escaping and export regressions, run against the artifact that ships.

// Values a spreadsheet cell, a team member's cloud row or a pasted roster can carry into a name.
const HOSTILE_NAMES = [
  'Amara" onpointerover="window.__pwned=1" x="', // breaks out of a double-quoted attribute
  "Amara&#39;);window.__pwned=1;//", // HTML entity decodes to ' before the JS runs
  "O'Brien", // legitimate — must round-trip untouched
  'Back\\slash',
  'Line\nBreak', // must not turn the handler into a syntax error
];

test.describe('inline handler escaping', () => {
  test('XJ output is safe inside a double-quoted onclick attribute', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: null });
    const results = await page.evaluate((names) => names.map((name) => {
      window.__pwned = 0;
      window.__got = undefined;
      const host = document.createElement('div');
      // Same shape as the calendar roster row: onclick="fn('${XJ(name)}')".
      host.innerHTML = `<button onclick="window.__got='${XJ(name)}'">x</button>`;
      document.body.appendChild(host);
      const btn = host.firstElementChild;
      const attrs = [...btn.attributes].map((a) => a.name);
      btn.click();
      host.remove();
      return { name, attrs, got: window.__got, pwned: window.__pwned };
    }), HOSTILE_NAMES);

    for (const r of results) {
      expect(r.attrs, `extra attributes injected by ${JSON.stringify(r.name)}`).toEqual(['onclick']);
      expect(r.pwned, `script ran for ${JSON.stringify(r.name)}`).toBe(0);
      expect(r.got, `value did not round-trip for ${JSON.stringify(r.name)}`).toBe(r.name);
    }
  });

  test('XJS (the attribute-safe variant) blocks attribute breakout', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: null });
    const results = await page.evaluate((names) => names.map((name) => {
      window.__pwned = 0;
      const host = document.createElement('div');
      host.innerHTML = `<button onclick="window.__got='${XJS(name)}'">x</button>`;
      document.body.appendChild(host);
      const btn = host.firstElementChild;
      const attrs = [...btn.attributes].map((a) => a.name);
      try { btn.click(); } catch (e) { /* newline case is covered by the XJ test above */ }
      host.remove();
      return { attrs, pwned: window.__pwned };
    }), HOSTILE_NAMES.slice(0, 2));
    for (const r of results) {
      expect(r.attrs).toEqual(['onclick']);
      expect(r.pwned).toBe(0);
    }
  });
});

test.describe('export sanitisation', () => {
  test('CSV export neutralises spreadsheet formulas in cell values', async ({ page }) => {
    // Person names are already filtered by the identity allowlist (nsClassifyIdentityLabel rejects
    // "="), so the payload rides in a free-text field that is exported verbatim.
    const payloads = ['=HYPERLINK("https://example.invalid","x")', '+SUM(1,1)', '-2+3', '@SUM(1)'];
    const model = buildWorkspace(1, { peoplePer: 1, scheduleRowsPer: 1 });
    const src = model.sources[0];
    model.people = ['Amara Okafor', 'Ben Sorensen', 'Chloe Duarte', 'Esi Mensah'].map((full_name, i) => ({
      person_id: `p-${i}`, full_name, home_department: src.department_name, source_id: src.source_id, role_type: payloads[i],
    }));
    await openApp(page, { profile: PROFILE, signedIn: true, workspaceRow: workspaceRow(model) });
    await waitForPicker(page);
    await page.locator(`${picker.root} ${picker.rows}`).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => window.nsExportCsv('people'))]);
    const csv = require('fs').readFileSync(await download.path(), 'utf8');
    expect(csv).toContain('Amara Okafor'); // the export itself worked
    for (const p of payloads) {
      // A quoted cell starting with = + - @ is still evaluated by Excel/Sheets, so it is prefixed with
      // an apostrophe and opens as text.
      expect(csv).toContain(`"'${p.replace(/"/g, '""')}"`);
    }
  });
});

test.describe('names with apostrophes', () => {
  test("the calendar day's + Flag button opens the exception form for O'Brien", async ({ page }) => {
    // The form's open/closed key used to be built from the escaped name (O\\'Brien) but compared with
    // the value the click handler stored (O'Brien), so the form never opened for these names.
    const model = buildWorkspace(1, { peoplePer: 1, scheduleRowsPer: 0, peopleOnly: true });
    const src = model.sources[0];
    model.people = ["Ciara O'Brien", 'Amara Okafor'].map((full_name, i) => ({ person_id: `p-${i}`, full_name, home_department: src.department_name, source_id: src.source_id }));
    model.schedule = model.people.map((p, i) => ({
      schedule_id: `s-${i}`, person_name: p.full_name, department: src.department_name, source_id: src.source_id,
      date: '2026-03-03', uk_start: '09:00', uk_end: '17:00', imported_at: src.loaded_at,
    }));
    await openApp(page, { profile: PROFILE, signedIn: true, workspaceRow: workspaceRow(model) });
    await waitForPicker(page);
    await page.locator(`${picker.root} ${picker.rows}`).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    await page.evaluate(() => {
      S.tab = 'calendar'; S.calSubTab = 'day'; setMonth('2026-02'); S.calDay = new Date(2026, 2, 3);
      invalidateDerivedCache(); ren();
    });
    const row = page.locator('.roster-item', { hasText: "Ciara O'Brien" });
    await expect(row).toBeVisible();
    await row.locator('button.exc-flag').click();
    await expect.poll(() => page.evaluate(() => S._excFormOpen)).toMatch(/^Ciara O'Brien\|/);
    await expect(row.getByRole('button', { name: /Sick/ })).toBeVisible();
  });
});
