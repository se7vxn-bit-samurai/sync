const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

async function signedInWith(page, count, opts) {
  await openApp(page, Object.assign({ profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(count)) }, opts || {}));
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

test.describe('deleting a project', () => {
  test('deletion stays local until the user explicitly saves', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.deleteBtn).first().click();
    const modal = page.locator('#syncDeleteProjectModal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: /Delete .* permanently/ }).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => projectNames(page)).toEqual(['Project B']);
    expect(await page.evaluate(() => window.__fakeSupabase.pushCount())).toBe(0);
  });

  test.skip('a failed cloud save keeps the modal in a Removing state and never claims success', async ({ page }) => {
    await signedInWith(page, 2);
    await page.evaluate(() => window.__fakeSupabase.setFailPush(true));
    await page.locator(picker.deleteBtn).first().click();
    const modal = page.locator('#syncDeleteProjectModal');
    await modal.getByRole('button', { name: /Delete .* permanently/ }).click();
    // The modal must stay open and say what actually happened, rather than closing on a success toast.
    await expect(modal).toBeVisible();
    await expect(modal).toContainText("cloud copy couldn't be confirmed");
    // States the actual risk rather than reporting a clean removal.
    await expect(modal).toContainText('may still reappear');
    await expect(modal.getByRole('button', { name: 'Retry sync' })).toBeVisible();
  });

  test.skip('retrying after the cloud recovers closes the modal and confirms', async ({ page }) => {
    await signedInWith(page, 2);
    await page.evaluate(() => window.__fakeSupabase.setFailPush(true));
    await page.locator(picker.deleteBtn).first().click();
    const modal = page.locator('#syncDeleteProjectModal');
    await modal.getByRole('button', { name: /Delete .* permanently/ }).click();
    await expect(modal.getByRole('button', { name: 'Retry sync' })).toBeVisible();
    await page.evaluate(() => window.__fakeSupabase.setFailPush(false));
    await modal.getByRole('button', { name: 'Retry sync' }).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__fakeSupabase.pushCount())).toBeGreaterThan(0);
  });
});

test.describe('concurrent edits from two devices', () => {
  test('a newer remote write is refused, compared, and never silently overwritten', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    const pushesBefore = await page.evaluate(() => window.__fakeSupabase.pushCount());
    // Another device saves after this one last looked.
    await page.evaluate(() => window.__fakeSupabase.simulateRemoteWrite());
    const pushed = await page.evaluate(() => window._syncPushWorkspaceNow());
    expect(pushed).toBe(false);
    // Nothing was written: the other device's copy is intact.
    expect(await page.evaluate(() => window.__fakeSupabase.pushCount())).toBe(pushesBefore);

    const modal = page.locator('#syncConflictModal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Two devices changed');
    await expect(modal.getByRole('button', { name: /Use the cloud copy/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Download this device/ })).toBeVisible();
    await expect(modal.getByRole('button', { name: /Overwrite the cloud/ })).toBeVisible();
  });

  test('choosing overwrite explicitly does write, and only then', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();
    await page.evaluate(() => window.__fakeSupabase.simulateRemoteWrite());
    await page.evaluate(() => window._syncPushWorkspaceNow());
    const modal = page.locator('#syncConflictModal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: /Overwrite the cloud/ }).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__fakeSupabase.pushCount())).toBeGreaterThan(0);
  });
});

test.describe('offline then reconnect', () => {
  test('offline is reported as its own state, not as a failure', async ({ page, context }) => {
    await signedInWith(page, 1);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('[data-sync-status]').first()).toContainText('Offline');
    await expect(page.locator('[data-sync-status]').first()).toContainText('saved on this device');
  });

  test('reconnecting leaves local changes local until Save now is chosen', async ({ page, context }) => {
    await signedInWith(page, 1);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => {
      window.__fakeSupabase.setFailPush(true); // offline pushes fail
      window.dispatchEvent(new Event('offline'));
    });
    // An edit made while offline stays local.
    await page.evaluate(() => { if (typeof syncPushWorkspace === 'function') syncPushWorkspace(); });
    await page.waitForTimeout(500);

    await context.setOffline(false);
    const before = await page.evaluate(() => window.__fakeSupabase.pushCount());
    await page.evaluate(() => {
      window.__fakeSupabase.setFailPush(false);
      window.dispatchEvent(new Event('online'));
    });
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__fakeSupabase.pushCount())).toBe(before);
    await page.evaluate(() => _syncManualSave());
    await expect.poll(() => page.evaluate(() => window.__fakeSupabase.pushCount())).toBeGreaterThan(before);
  });
});

test.describe('boot safety', () => {
  test('an empty local workspace is never pushed over the cloud copy before the first pull', async ({ page }) => {
    // The regression this guards: the boot auto-save could land before the sign-in pull and replace
    // real cloud data with an empty model, after which there was nothing left to restore.
    await openApp(page, { signedIn: true, profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(3)) });
    await waitForPicker(page);
    const remotePeople = await page.evaluate(() => window.__fakeSupabase.state.cfg.workspaceRow.data.people.length);
    expect(remotePeople).toBe(6);
    expect(await projectNames(page)).toHaveLength(3);
  });
});

test.describe('settings', () => {
  test('opening Settings while signed out does not lock up the tab', async ({ page }) => {
    // Regression: the account section refetched the profile whenever the cache was null and
    // re-rendered itself on every fetch. Signed out, null is the permanent answer, so the two fed
    // each other — an unbounded promise chain that froze the tab outright and, on a real
    // connection, would hammer the auth endpoint indefinitely.
    await openApp(page);
    await page.evaluate(() => openSettings());
    await expect(page.locator('#settingsOverlay')).toBeVisible();
    await expect(page.locator('#settingsOverlay')).toContainText('Continue with Google');
    // The page must still be responsive afterwards.
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });

  test('opening Settings after a reload with no project open stays responsive', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(1)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await waitForPicker(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb);
    await page.evaluate(() => openSettings());
    await expect(page.locator('#settingsOverlay')).toBeVisible();
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });
});

test.describe('backup export', () => {
  test('produces a portable snapshot containing the real workspace', async ({ page }) => {
    await signedInWith(page, 2);
    const download = page.waitForEvent('download');
    await page.evaluate(() => window._syncExportBackup());
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^sync-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const stream = await file.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    expect(payload.format).toBe('sync-workspace-backup');
    expect(payload.projects.map((p) => p.name)).toEqual(['Project A', 'Project B']);
    // Must contain the actual data, not an empty shell.
    expect(payload.workspace.people.length).toBe(4);
    expect(payload.workspace.schedule.length).toBe(6);
  });
});
