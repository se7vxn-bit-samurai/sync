const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

test.describe('first sign-in', () => {
  test('signed out shows one Google action and no project picker', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#syncLcWidget')).toContainText('Continue with Google');
    await expect(page.locator('#syncLcWidget')).toContainText('creates one if you');
    await expect(page.locator(picker.root)).toBeHidden();
    // The import path is the whole landing screen while signed out — nothing is collapsed behind
    // the "start something new" toggle, because there is no picker competing with it.
    await expect(page.locator('#lcNewSourceGroup')).toBeVisible();
    await expect(page.locator(picker.newSourceToggle)).toBeHidden();
  });

  test('clicking Continue with Google starts exactly one OAuth flow', async ({ page }) => {
    await openApp(page);
    await page.locator('#syncLcGoogleBtn').click();
    await expect.poll(() => page.evaluate(() => window.__fakeSupabase.oauthCalls())).toBe(1);
  });

  test('a brand-new account with no saved projects is not blocked by a profile modal', async ({ page }) => {
    // Empty profile = the case that used to trigger "Finish setting up your profile" ahead of
    // everything else. Profile completion now lives in Settings and must not interrupt sign-in.
    await openApp(page, { profile: { full_name: null, organization: null, role: null, preferred_colorway: null, continuation_pref: null }, workspaceRow: null });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await page.waitForTimeout(1500);
    await expect(page.locator('#syncOnboardModal')).toHaveCount(0);
  });

  test('signing in lists the cloud projects without opening one', async ({ page }) => {
    // The new-device case: whatever the account saved elsewhere is listed as soon as sign-in
    // completes. A returning session is still not permission to reopen a prior sheet.
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(3)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(['Project A', 'Project B', 'Project C']);
    await expect(page.locator('#mv')).toBeHidden();
    expect(await page.evaluate(() => ({ active: S.activeDept, entries: S.entries.length }))).toEqual({ active: null, entries: 0 });
    // Starting something new stays available, but as the secondary action.
    await expect(page.locator(picker.newSourceToggle)).toBeVisible();
    await expect(page.locator(picker.newSourceToggle)).toContainText('Start or import a new project');
  });

  test('a restored session lists cloud projects without a second sign-in', async ({ page }) => {
    await openApp(page, { signedIn: true, profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(2)) });
    await waitForPicker(page);
    expect(await projectNames(page)).toHaveLength(2);
    expect(await page.evaluate(() => window.__fakeSupabase.oauthCalls())).toBe(0);
  });

  test('Sync from cloud reports an up-to-date copy without reloading it', async ({ page }) => {
    await openApp(page, { signedIn: true, profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(2)) });
    await waitForPicker(page);
    expect(await page.evaluate(() => window.syncPullWorkspace())).toBe('current');
  });

  test('signing out closes the active sheet and leaves cached projects offline', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(1)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await waitForPicker(page);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    await page.evaluate(() => _syncSignOut());
    // Only this device: the default scope would end the session on every other device too.
    expect(await page.evaluate(() => window.__fakeSupabase.state.signOutCalls)).toEqual([{ scope: 'local' }]);
    await expect(page.locator('#mv')).toBeHidden();
    expect(await page.evaluate(() => ({ active: S.activeDept, entries: S.entries.length }))).toEqual({ active: null, entries: 0 });
    await expect(page.locator('#syncLcWidget')).toContainText('Continue with Google');
    await expect(page.locator(picker.rows)).toHaveCount(1);
  });
});
