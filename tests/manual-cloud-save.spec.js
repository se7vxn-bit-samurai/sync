const { test, expect } = require('@playwright/test');
const { PROFILE, buildWorkspace, workspaceRow, openApp, waitForPicker } = require('./helpers');

test.describe('explicit cloud save contract', () => {
  test('sign-in pulls but never writes until the user explicitly saves', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(1)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await waitForPicker(page);
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => window.__fakeSupabase.lastPush())).toBeNull();

    await page.evaluate(() => _syncManualSave());
    expect(await page.evaluate(() => !!window.__fakeSupabase.lastPush())).toBe(true);
  });
});
