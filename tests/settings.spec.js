const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, workspaceRow, waitForPicker } = require('./helpers');

// Settings drawer: every section renders, and each preference changes what the engine does.
// Same org as tests/leaders.spec.js: Ada (Zanele YAT, Ben) on leave T+2..T+4; Omar (Kim Senior
// Agent, Pat Ncube, Pat Ncub, Lee Gone the leaver).

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
      person('p-mo', 'Mo Manager', 'Operations Manager'),
      person('p-ada', 'Ada Leader', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-omar', 'Omar Reyes', 'Team Leader', 'p-mo', 'Mo Manager'),
      person('p-zan', 'Zanele Dube', 'Agent', 'p-ada', 'Ada Leader', { labels: ['YAT'] }),
      person('p-ben', 'Ben Okafor', 'Agent', 'p-ada', 'Ada Leader'),
      person('p-kim', 'Kim Senior', 'Agent', 'p-omar', 'Omar Reyes', { labels: ['Senior Agent'] }),
      person('p-pat', 'Pat Ncube', 'Agent', 'p-omar', 'Omar Reyes'),
      person('p-pat2', 'Pat Ncub', 'Agent', 'p-omar', 'Omar Reyes'),
      person('p-lee', 'Lee Gone', 'Agent', 'p-omar', 'Omar Reyes', { status: 'Leaver' }),
    ],
    schedule: [
      ...rows('p-ada', 'Ada Leader', '09:00', '17:30', [2, 3, 4]),
      ...rows('p-omar', 'Omar Reyes', '08:00', '16:30'),
      ...rows('p-pat', 'Pat Ncube', '08:00', '16:30'),
      ...rows('p-lee', 'Lee Gone', '10:00', '18:30'),
    ],
  };
}

async function openProject(page) {
  page.on('dialog', (d) => d.accept());
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(orgWorkspace()) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
  await page.evaluate((name) => _syncOpenProject(name), PROJECT);
  await page.waitForFunction(() => S.entries.length > 0 && S.people['Omar Reyes'] && S.people['Omar Reyes'].personId);
  await expect(page.locator('#syncBoot')).toHaveCount(0);
}
const setPref = (page, key, value) => page.evaluate(([k, v]) => prefSet(k, v), [key, value]);
async function fill(page, sel, value) {
  await page.locator(sel).fill(String(value));
  await page.locator(sel).dispatchEvent('change');
}

test.describe('Settings drawer', () => {
  test('every section renders its own groups, on a phone too, with no errors', async ({ page }) => {
    await openProject(page);
    await page.evaluate(() => openSettings('workspace'));
    const sections = await page.evaluate(() => SETTINGS_SECTIONS.map((s) => [s.id, s.l]));
    expect(sections.length).toBeGreaterThanOrEqual(10);
    for (const [id, label] of sections) {
      await page.locator(`#settingsPanel .set-tab[data-section="${id}"]`).click();
      await expect(page.locator('#setMain .set-title h2')).toHaveText(label);
      await expect(page.locator(`#settingsPanel .set-tab[data-section="${id}"]`)).toHaveAttribute('aria-current', 'page');
      if (id !== 'account') expect(await page.locator('#setMain .set-group').count(), id).toBeGreaterThan(0);
    }
    // Every registry preference is on its section's page.
    const missing = await page.evaluate(() => SYNC_PREFS.filter((p) => { selectSettingsSection(p.s); return !document.querySelector(`#setMain [data-pref="${p.k}"]`); }).map((p) => p.k));
    expect(missing).toEqual([]);
    expect(page.__jsErrors).toEqual([]);
  });

  test('a changed preference shows its default, badges its section, resets, and survives a reload', async ({ page }) => {
    await openProject(page);
    await page.evaluate(() => openSettings('people'));
    await fill(page, '#pref_org_spanWarn', 2);
    const row = page.locator('#setMain [data-pref="org.spanWarn"]');
    await expect(row).toHaveClass(/changed/);
    await expect(row.locator('.set-def')).toContainText('Default: 15 agents');
    await expect(page.locator('.set-tab[data-section="people"] .set-badge')).toHaveText('1');
    // Below the minimum (3) is clamped. The Org builder check follows: Omar has 4 agents.
    await expect(page.locator('#pref_org_spanWarn')).toHaveValue('3');
    expect(await page.evaluate(() => (orgQuality(_coverTodayISO()).find((q) => q.kind === 'span') || {}).title)).toBe('More than 3 agents on one leader');
    // A check can be switched off.
    await page.locator('#pref_org_check_span').uncheck();
    expect(await page.evaluate(() => orgQuality(_coverTodayISO()).some((q) => q.kind === 'span'))).toBe(false);
    await expect(page.locator('.set-tab[data-section="people"] .set-badge')).toHaveText('2');

    // Saved with the project settings (only non-defaults), and read back on load.
    await page.waitForFunction(() => { const raw = (_persistPendingSet.get && _persistPendingSet.get('sc_settings')) || localStorage.getItem('sc_settings'); return raw && JSON.parse(raw).prefs && JSON.parse(raw).prefs['org.spanWarn'] === 3; });
    expect(await page.evaluate(() => { S.prefs = {}; loadSettings(); return [pref('org.spanWarn'), pref('org.check.span'), Object.keys(S.prefs).length]; })).toEqual([3, false, 2]);

    await page.evaluate(() => renderSettings());
    await page.locator('#setMain .set-foot .set-link').click();
    await expect(page.locator('.set-tab[data-section="people"] .set-badge')).toHaveCount(0);
    expect(await page.evaluate(() => [pref('org.spanWarn'), pref('org.check.span'), S.prefs])).toEqual([15, true, {}]);
    // Out-of-range and unknown values are clamped or dropped.
    expect(await page.evaluate(() => { prefSet('org.spanWarn', 999); prefsLoad({ 'nope.key': 1, 'abs.sickRunDays': 'x' }); return [pref('org.spanWarn'), pref('abs.sickRunDays'), S.prefs]; })).toEqual([15, 2, {}]);
  });

  test('schedule rules, alerts and card fields edit the same state the app uses', async ({ page }) => {
    await openProject(page);
    await page.evaluate(() => openSettings('workspace'));
    await fill(page, '#setCovMin', 3);
    expect(await page.evaluate(() => [S.covMin, S.rules.minCoveragePerDay])).toEqual([3, 3]);
    await fill(page, '#setHrsMax', 200);
    expect(await page.evaluate(() => [S.hrsMax, S.rules.maxHoursWeek])).toEqual([80, 80]);
    await page.locator('#setMain .set-row.changed', { hasText: 'Minimum coverage' }).getByRole('button', { name: 'Reset' }).click();
    expect(await page.evaluate(() => S.covMin)).toBe(1);

    await page.locator('.set-tab[data-section="alerts"]').click();
    await expect(page.locator('#setAlert_overHours_t')).toBeDisabled();
    await page.locator('#setAlert_overHours').check();
    await expect(page.locator('#setAlert_overHours_t')).toBeEnabled();
    await fill(page, '#setAlert_overHours_t', 30);
    expect(await page.evaluate(() => S.flagSettings.alerts.overHours)).toMatchObject({ on: true, threshold: 30 });

    await page.locator('.set-tab[data-section="preferences"]').click();
    await page.locator('#setCard_heatmap').uncheck();
    expect(await page.evaluate(() => S.cardShow.heatmap)).toBe(false);
    await page.locator('#pref_ui_reduceMotion').check();
    await expect(page.locator('body')).toHaveClass(/sync-reduce-motion/);
  });

  test('cover suggestions, the pool and the Leaders board follow Cover & leaders', async ({ page }) => {
    await openProject(page);
    const gap = () => page.evaluate(() => { const g = coverGaps(_coverTodayISO(), excKey(_swinAddDays(new Date(), 13))).find((x) => x.leader === 'Ada Leader'); const s = coverSuggest(g); return { n: s.length, top: s[0] && s[0].score, names: s.map((x) => x.name) }; });
    const before = await gap();
    expect(before.n).toBeGreaterThan(1);
    await setPref(page, 'cover.maxSuggestions', 1);
    await setPref(page, 'cover.wAvail', 0);
    const after = await gap();
    expect(after.n).toBe(1);
    expect(after.top).toBeLessThan(before.top);
    // Nobody outside the team is a candidate without a pool label or a team of their own.
    await setPref(page, 'cover.maxSuggestions', 20);
    await setPref(page, 'cover.poolLabels', '');
    expect((await gap()).names).not.toContain('Kim Senior');
    await setPref(page, 'cover.poolLabels', 'Senior Agent');
    expect((await gap()).names).toContain('Kim Senior');

    await setPref(page, 'cover.lookbackDays', 90);
    await page.evaluate(() => railNavPeople('cover'));
    await expect(page.locator('#covPool').getByRole('columnheader', { name: 'Acted (3 months)' })).toBeVisible();

    await page.evaluate(() => railNavPeople('leaders'));
    const upcoming = page.locator('#ldrTable tr[data-leader="Ada Leader"] td[data-col="upcoming"]');
    await expect(upcoming).toHaveAttribute('title', 'Ada Leader');
    await setPref(page, 'leaders.lookahead', 1);
    await expect(page.locator('#ldrTable th', { hasText: 'Leave next' })).toHaveText('Leave next 1d');
    await expect(upcoming).toHaveText('—');
    await setPref(page, 'leaders.sort', 'name');
    await page.evaluate(() => railNavPeople('leaders'));
    await expect(page.locator('#ldrSort')).toHaveValue('name');
  });

  test('absence limits, default period and holiday list follow Absence and Time & holidays', async ({ page }) => {
    await openProject(page);
    const profile = (events) => page.evaluate((ev) => { const p = absenceProfile('Cal Loose', ev, ev[0].iso, _coverTodayISO()); return [...p.flags, ...p.patterns].map((f) => f.kind); }, events);
    const sick = (n) => ({ name: 'Cal Loose', iso: iso(n), type: 'sick', source: 'logged', note: '' });
    // Two days in a row: fine by default (more than 2), flagged with a limit of 1.
    expect(await profile([sick(-10), sick(-9)])).not.toContain('sickLong');
    await setPref(page, 'abs.sickRunDays', 1);
    expect(await profile([sick(-10), sick(-9)])).toContain('sickLong');
    // Three separate occasions in 8 weeks: flagged by default, not when 4 are needed.
    const three = [sick(-40), sick(-30), sick(-20)];
    expect(await profile(three)).toContain('sickThird');
    await setPref(page, 'abs.sickOccasions', 4);
    expect(await profile(three)).not.toContain('sickThird');
    await setPref(page, 'abs.sickOccasions', 3);
    await setPref(page, 'abs.sickWindowWeeks', 2);
    expect(await profile(three)).not.toContain('sickThird');
    // Bridging: two sick days 3 days apart with nothing rostered between are one occasion by default.
    expect(await page.evaluate((ev) => absenceOccasions('Cal Loose', ev).length, [iso(-10), iso(-6)])).toBe(1);
    await setPref(page, 'abs.bridgeGap', 0);
    expect(await page.evaluate((ev) => absenceOccasions('Cal Loose', ev).length, [iso(-10), iso(-6)])).toBe(2);

    await setPref(page, 'abs.defaultPeriod', '3m');
    await setPref(page, 'hol.aheadDays', 365);
    await page.evaluate(() => railNavPeople('absence'));
    await expect(page.locator('.abs-wrap .swin-seg button[aria-pressed="true"]')).toHaveText('3 months');
    await expect(page.locator('#absHolidays h3')).toHaveText('Holidays in the next 365 days');
    await expect(page.locator('#absHolidays th')).toHaveCount(3);
    await setPref(page, 'hol.showUK', false);
    await expect(page.locator('#absHolidays th')).toHaveCount(2);
    await expect(page.locator('#absHolidays')).not.toContainText('Boxing Day (substitute');
  });

  test('Schedule Window defaults and message text follow Sharing, with a live preview', async ({ page }) => {
    await openProject(page);
    await page.evaluate(() => { S.tz = true; });
    await setPref(page, 'swin.range', 'next14');
    await setPref(page, 'swin.clock', 'uk');
    const st = await page.evaluate(() => { openScheduleWindow('Omar Reyes'); const s = Object.assign({}, _swinState); closeScheduleWindow(); return s; });
    expect([st.mode, st.from, st.to, st.clock]).toEqual(['custom', iso(0), iso(13), 'uk']);

    await page.evaluate(() => openSettings('sharing'));
    const preview = page.locator('#setSwinPreview');
    await expect(preview).toContainText('Sent ');
    await fill(page, '#pref_swin_footer', 'Questions? Ask your TL');
    await expect(preview).toContainText('Questions? Ask your TL');
    await page.locator('#pref_swin_txtSent').uncheck();
    await expect(preview).not.toContainText('Sent ');
    await page.locator('#pref_swin_txtOther').check();
    await expect(preview).toContainText('(SA ');
    const text = await page.evaluate(() => swinBuildText('Omar Reyes', _coverTodayISO(), _coverTodayISO(), 'sa').text);
    expect(text.split('\n').pop()).toBe('Questions? Ask your TL');
    expect(text).toMatch(/\(UK \d\d:\d\d/);
  });

  test('search finds settings across sections and keeps the search box focused', async ({ page }) => {
    await openProject(page);
    await page.evaluate(() => openSettings('workspace'));
    await page.locator('#settingsSearch').fill('bank holiday');
    await expect(page.locator('#setMain .set-title h2')).toHaveText('Search');
    await expect(page.locator('#setMain [data-pref="hol.showUK"]')).toBeVisible();
    await expect(page.locator('#setMain [data-pref="swin.txtUK"]')).toBeVisible();
    await expect(page.locator('#settingsPanel .set-tab.on')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('settingsSearch');
    await page.locator('#setMain #pref_hol_showUK').uncheck();
    expect(await page.evaluate(() => pref('hol.showUK'))).toBe(false);
    await expect(page.locator('#setMain [data-pref="hol.showUK"]')).toBeVisible();
    await page.locator('#settingsSearch').fill('zzzz nothing');
    await expect(page.locator('#setMain')).toContainText('Nothing matches');
    // Escape clears the search first, then closes.
    await page.locator('#settingsSearch').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#setMain .set-title h2')).toHaveText('Workspace');
    await page.keyboard.press('Escape');
    await expect(page.locator('#settingsOverlay')).toHaveCount(0);
  });

  test('a settings backup round-trips and rejects other files; reset all clears preferences', async ({ page }) => {
    await openProject(page);
    const payload = await page.evaluate(() => {
      prefSet('org.spanWarn', 9); prefSet('swin.footer', 'Hi'); settingsSetRule('covMin', 4); setFlagThreshold('longShift', 12);
      return settingsBackupPayload();
    });
    expect(payload.schema).toBe('sync.settings');
    expect(payload.prefs).toEqual({ 'org.spanWarn': 9, 'swin.footer': 'Hi' });
    await page.evaluate(() => prefResetAll());
    expect(await page.evaluate(() => [S.prefs, S.covMin])).toEqual([{}, 4]);
    await page.evaluate(() => { S.covMin = 1; S.flagSettings.alerts.longShift.threshold = 10; });
    const n = await page.evaluate((p) => settingsApplyBackup(p), payload);
    expect(n).toBeGreaterThan(5);
    expect(await page.evaluate(() => [pref('org.spanWarn'), pref('swin.footer'), S.covMin, S.flagSettings.alerts.longShift.threshold])).toEqual([9, 'Hi', 4, 12]);
    expect(await page.evaluate(() => { try { settingsApplyBackup({ schema: 'other' }); return 'applied'; } catch (e) { return e.message; } })).toBe('Not a Sync settings file');
  });

  test('scope, start view and export file names follow their settings', async ({ page }) => {
    await openProject(page);
    // Acting scope: Zanele acts for Ada today, so her tree takes in Ada's team unless turned off.
    await page.evaluate(([a, b]) => coverAssign('Zanele Dube', 'Ada Leader', a, b, 'Acting Team Lead'), [iso(0), iso(2)]);
    const tree = () => page.evaluate(() => [...scopeTree('Zanele Dube', _coverTodayISO())].sort());
    expect(await tree()).toContain('Ben Okafor');
    await setPref(page, 'scope.includeActing', false);
    expect(await tree()).toEqual(['Zanele Dube']);
    // Not remembering the scope: a saved one is ignored on the next visit.
    expect(await page.evaluate(() => { scopeSet({ leader: 'Omar Reyes' }); prefSet('scope.remember', false); const now = scopeGet().leader; _scopeSetThisVisit = false; return [now, scopeGet().leader]; })).toEqual(['Omar Reyes', '']);
    await setPref(page, 'scope.remember', true);
    expect(await page.evaluate(() => scopeGet().leader)).toBe('Omar Reyes');

    expect(await page.evaluate(() => { prefSet('ui.startView', 'leaders'); prefApplyStartView(); return [S.tab, S.peopleSubTab]; })).toEqual(['people', 'leaders']);
    expect(await page.evaluate(() => { prefSet('ui.startView', 'resume'); prefApplyStartView(); return S.tab; })).toBe('dashboard');

    const plain = await page.evaluate(() => buildFilename('month', 'xlsx'));
    expect(plain).toMatch(/^Project_A_.*_SavePlus_\d{8}\.xlsx$/);
    await setPref(page, 'export.prefix', 'JHB site');
    await setPref(page, 'export.dateStamp', false);
    expect(await page.evaluate(() => buildFilename('month', 'xlsx'))).toBe(plain.replace(/_\d{8}\.xlsx$/, '.xlsx').replace(/^/, 'JHB_site_'));
  });
});
