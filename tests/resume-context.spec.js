const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker } = require('./helpers');

async function signedInWith(page, count) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(count)) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

test.describe('continue exactly where you left off', () => {
  test('the screen and filters a project was left on are saved per project', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    await page.evaluate(() => {
      setTab('people');
      S.emp = 'someone';
      S.dayFilter = 'Mon';
      ren();
    });
    // The view record is written on a short debounce; force it rather than waiting it out.
    await page.evaluate(() => _syncSaveViewState());

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_view_state') || '{}'));
    expect(saved['project a']).toBeTruthy();
    expect(saved['project a'].tab).toBe('people');
    expect(saved['project a'].emp).toBe('someone');
    expect(saved['project a'].dayFilter).toBe('Mon');
  });

  test('reopening a project restores its screen, not the default one', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();
    await page.evaluate(() => {
      setTab('people');
      _syncSaveViewState();
    });

    // Switch to the other project and back, the same way a user would. Both tabs used here are
    // valid for entry-only data — the Table and Raw tabs legitimately bounce back when a project
    // has no workbook behind it, which these seeded projects do not.
    await page.evaluate(() => _syncOpenProject('Project B'));
    await page.evaluate(() => { setTab('calendar'); _syncSaveViewState(); });
    expect(await page.evaluate(() => S.tab)).toBe('calendar');

    await page.evaluate(() => _syncOpenProject('Project A'));
    expect(await page.evaluate(() => S.tab)).toBe('people');
    await page.evaluate(() => _syncOpenProject('Project B'));
    expect(await page.evaluate(() => S.tab)).toBe('calendar');
  });

  test('view context survives a reload and follows the cloud payload', async ({ page }) => {
    await signedInWith(page, 1);
    await page.locator(picker.rows).first().click();
    await page.evaluate(() => { setTab('analytics'); _syncSaveViewState(); });
    // The record must be part of what gets synced, not just a local-only convenience.
    const pushed = await page.evaluate(async () => {
      await window._syncPushWorkspaceNow();
      const last = window.__fakeSupabase.lastPush();
      return last && last.data ? Object.keys(last.data).filter((k) => k === 'sc_view_state') : [];
    });
    expect(pushed).toEqual(['sc_view_state']);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb);
    await page.waitForTimeout(2000);
    await page.evaluate(() => _syncOpenProject('Project A'));
    expect(await page.evaluate(() => S.tab)).toBe('analytics');
  });

  test('a stale view record never restores a month the project no longer has', async ({ page }) => {
    await signedInWith(page, 1);
    await page.evaluate(() => {
      const map = { 'project a': { tab: 'calendar', month: '1999-01', mIdx: 99 } };
      localStorage.setItem('sc_view_state', JSON.stringify(map));
    });
    await page.evaluate(() => _syncOpenProject('Project A'));
    // The screen is restored; the impossible month is discarded rather than opening an empty view.
    expect(await page.evaluate(() => S.tab)).toBe('calendar');
    expect(await page.evaluate(() => S.month)).not.toBe('1999-01');
  });

  test('most-recent resume prefers the project actually opened last', async ({ page }) => {
    await signedInWith(page, 3);
    // Project C is the oldest by import date, so only a real open event can make it most recent.
    await page.evaluate(() => _syncOpenProject('Project C'));
    const order = await page.evaluate(() => nsListCanonicalProjects().map((p) => p.name));
    expect(order[0]).toBe('Project C');
  });
});
