const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

test.describe('harness', () => {
  test('app boots signed out with a single Continue with Google action', async ({ page }) => {
    await openApp(page);
    const buttons = page.locator('#syncLcWidget button');
    await expect(buttons).toHaveCount(1);
    await expect(buttons.first()).toContainText('Continue with Google');
    // The retired duplicate CTA must not come back.
    await expect(page.locator('#syncLcWidget')).not.toContainText('Create account');
    expect(page.__jsErrors).toEqual([]);
  });

  test('the fake Supabase drives a signed-in pull into the picker', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(2)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(['Project A', 'Project B']);
    await expect(page.locator(picker.root)).toContainText('Continue a project');
  });
});
