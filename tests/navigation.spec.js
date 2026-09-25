const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, createTestProject } = require('./helpers');

// A realistic project: real shift times, one imported source.
async function openProject(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(0)) });
  await createTestProject(page);
  await expect(page.locator('#mv')).toBeVisible();
  await page.waitForFunction(() => S.entries.length > 100);
  // The boot splash sits over everything until finishBoot() removes it (up to ~3s after load);
  // hit-testing before then lands on the splash, not the page.
  await expect(page.locator('#syncBoot')).toHaveCount(0);
}
const opsRail = '[data-rail-group="analytics"] .mf-rail-child';
const nav = (page, fn, arg) => page.evaluate(fn, arg);

test.describe('Ops sidebar', () => {
  test('lists six sections, and every page of a section is a tab inside it', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'the rail is collapsed into a bottom bar on phones');
    await openProject(page);
    await nav(page, () => railNavOps('overview'));
    await expect(page.locator(opsRail)).toHaveText(['Overview', 'Analytics', 'Alerts', 'Blueprint', 'People & Org', 'Data']);

    const sections = await page.evaluate(() => OPS_SECTIONS.map((s) => ({ label: s.label, tabs: s.tabs.map((t) => [t[1], t[2]]) })));
    for (const sec of sections) {
      await page.locator(opsRail, { hasText: sec.label }).click();
      for (const [view, label] of sec.tabs) {
        if (sec.tabs.length > 1) {
          await page.locator(`[data-testid="ops-tab-${view}"]`).click();
          await expect(page.locator('#opsSectionNav .pst-btn.a')).toHaveText(label);
        } else {
          await expect(page.locator('#opsSectionNav')).toBeHidden();
        }
        await expect(page.locator(`${opsRail}.active`)).toHaveText(sec.label);
      }
    }
    expect(page.__jsErrors).toEqual([]);
  });

  test('pages opened from inside a section keep that section highlighted', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'the rail is collapsed into a bottom bar on phones');
    await openProject(page);
    await nav(page, () => { railNavOps('data-control'); S.opsView = 'conflicts'; rOps($('ca')); });
    await expect(page.locator(`${opsRail}.active`)).toHaveText('Data');
    await expect(page.locator('#opsSectionNav')).toContainText('Data control');
  });

  test('the tab strip is gone outside Ops', async ({ page }) => {
    await openProject(page);
    await nav(page, () => railNavAnalytics('coverage'));
    await expect(page.locator('#opsSectionNav')).toBeVisible();
    await nav(page, () => railNavCalendar('day'));
    await expect(page.locator('#opsSectionNav')).toBeHidden();
  });

  test('on a phone, the toolbar does not cover the top of the page', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile-chromium', 'phone layout only');
    await openProject(page);
    await nav(page, () => railNavAnalytics('dashboard'));
    const firstTab = page.locator('#opsSectionNav .pst-btn').first();
    await expect(firstTab).toBeVisible();
    // The sticky offset pushed the toolbar 40px down over whatever came next.
    const covered = await firstTab.evaluate((b) => {
      const r = b.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== b;
    });
    expect(covered).toBe(false);
  });
});

test.describe('screens agree with each other', () => {
  test('shift times follow the SA/UK setting on every screen', async ({ page }) => {
    await openProject(page);
    for (const tz of [true, false]) {
      await nav(page, (on) => { S.tz = on; railNavDashboard(); }, tz);
      const home = await page.locator('#ca .sd-list-row', { hasText: 'Amara Okafor' }).first().locator('.meta').innerText();
      await nav(page, () => railNavAnalytics('dashboard'));
      const pulse = page.locator('#ca .team-pulse .team-pulse-chip', { hasText: 'Amara' });
      await expect(pulse).toContainText(home.replace('-', '–'));
    }
  });

  test('Ops and Data control report the same sources', async ({ page }) => {
    await openProject(page);
    await nav(page, () => railNavOps('overview'));
    await expect(page.locator('#ca .an-card', { hasText: 'Sources' }).first()).toContainText('1 loaded');
    await expect(page.locator('#ca')).not.toContainText('Parsed schedule rows');
    await nav(page, () => railNavOps('data-control'));
    await expect(page.locator('#ca .ns-ops-context')).toContainText('Sources1');
  });

  test('blueprint slots describe the blueprint, not the team health score', async ({ page }) => {
    await openProject(page);
    await nav(page, () => railNavDashboard());
    const plan = page.locator('#ca .sd-panel', { hasText: 'Schedule plan' });
    await expect(plan).toContainText('No blueprint yet');
    await expect(plan).not.toContainText(/Health|[ABCD] \d\d/);
    await nav(page, () => railNavOps('overview'));
    await expect(page.locator('#ca .sd-kpi', { hasText: 'Team health' })).toBeVisible();
    await expect(page.locator('#ca .sd-kpi', { hasText: /^Blueprint/ })).toHaveCount(0);
  });

  test('no build notes leak into the Ops screens', async ({ page }) => {
    await openProject(page);
    for (const view of ['overview', 'decisions', 'sources', 'events', 'logbook']) {
      await nav(page, (v) => railNavOps(v), view);
      await expect(page.locator('#ca')).not.toContainText(/ops hub|port map|port target|people memory/i);
    }
  });
});

test.describe('fewer choices up front', () => {
  test('the landing page offers a file; the rest waits behind one click', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(0)) });
    await expect(page.locator('#dz')).toBeVisible();
    await expect(page.locator('#lcSampleBtn')).toHaveCount(0);
    for (const hidden of ['#lcModeWfm', '.lc-paste-btn', '.lc-new-btn']) await expect(page.locator(hidden)).toBeHidden();
    await page.locator('.lc-more-summary').click();
    await page.locator('#lcModeWfm').click();
    await expect(page.locator('#lcDzHead')).toContainText('WFM');
    await expect(page.locator('.lc-paste-btn')).toBeVisible();
    await expect(page.locator('.lc-new-btn')).toBeVisible();
  });

  test('Home opens on the hero and today, with no admin rows in the hero', async ({ page }) => {
    await openProject(page);
    await nav(page, () => railNavDashboard());
    const hero = page.locator('#ca .sd-hero');
    await expect(hero).toBeVisible();
    await expect(hero.locator('.sd-title')).toHaveText(/Sync\s*Dashboard/);
    await expect(hero.locator('.sd-ledger-row b')).toHaveText(['On floor', 'Off / leave', 'Floor window']);
    await expect(hero).not.toContainText(/Alerts|Scope|Sources|Drop \/ browse|Import file/);
    await expect(hero.locator('.sd-ledger-row', { hasText: 'Floor window' })).toContainText(/\d\d:\d\d–\d\d:\d\d/);
    await expect(page.locator('#ca .sd-panel', { hasText: 'Working Today' })).toBeVisible();
    await expect(page.locator('#ca .sd-panel', { hasText: 'Shift time' })).toHaveCount(0);
  });

  test('Home carries the live signal field, with no invader mode', async ({ page }) => {
    await openProject(page);
    await nav(page, () => railNavDashboard());
    const field = page.locator('#ca .sd-side .sync-ascii-stage');
    await expect(field).toBeVisible();
    await expect(field.locator('.sync-signal-pre')).not.toBeEmpty();
    const modes = await page.evaluate(() => SyncSignalField.modes);
    expect(modes).toEqual(['Signal', 'Contour', 'Rain', 'Lattice', 'Phase']);
    // The button names the mode the engine is drawing, and follows it round the whole cycle.
    const button = page.locator('#syncAsciiModeButton');
    await expect(button).toHaveText('Signal ↻');
    for (const name of [...modes.slice(1), modes[0]]) {
      await button.click();
      await expect(button).toHaveText(`${name} ↻`);
      expect(await page.evaluate(() => window._syncField.mode)).toBe(name);
    }
    expect(page.__jsErrors).toEqual([]);
  });
});
