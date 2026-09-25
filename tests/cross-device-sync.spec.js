const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, createTestProject, picker, waitForPicker, projectNames } = require('./helpers');

// Two devices, one account. The cloud row carries a server version; each device remembers the
// version it last matched and whether it has changed anything since.

const syncState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('sc_cloud_sync') || '{}'));

async function signedInWith(page, row) {
  await openApp(page, { profile: PROFILE, workspaceRow: row });
  await page.evaluate(() => window.__fakeSupabase.signIn());
}

test.describe('a second device', () => {
  test('loads a cloud save made before it started, without pressing Sync from cloud', async ({ page }) => {
    // The reported bug: a fresh device stamped its empty model with the time it booted, so any
    // cloud save older than that looked stale and was never loaded.
    await signedInWith(page, workspaceRow(buildWorkspace(2), '2026-01-05T09:00:00.000Z'));
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(['Project A', 'Project B']);
    expect(await syncState(page)).toMatchObject({ uid: 'user-test-1', version: 1, dirty: false });
    // Loading is not an edit, and never writes back.
    expect(await page.evaluate(() => window.__fakeSupabase.pushCount())).toBe(0);
  });

  test('keeps the loaded copy after a reload, with no network call', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(2)));
    await waitForPicker(page);
    await page.waitForTimeout(400); // the IndexedDB write is debounced
    // The double re-installs signed out on reload, so anything listed now came from this device.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.NorthStar && window.NorthStar.bootSettled, null, { timeout: 20_000 });
    expect(await page.evaluate(() => window.nsListCanonicalProjects().map((p) => p.name).sort())).toEqual(['Project A', 'Project B']);
    expect(await page.evaluate(() => window.__fakeSupabase.state.session)).toBeNull();
  });

  test('picks up a newer save from the other device when it has nothing unsaved', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(2)));
    await waitForPicker(page);
    const remote = Object.assign(buildWorkspace(3), { sc_notes: { '2026-02-02': 'Saved on the other device' } });
    await page.evaluate((data) => window.__fakeSupabase.simulateRemoteWrite(data), remote);
    expect(await page.evaluate(() => _syncManualPull())).toBe(true);
    await expect.poll(() => projectNames(page)).toEqual(['Project A', 'Project B', 'Project C']);
    expect(await syncState(page)).toMatchObject({ version: 2, dirty: false });
    // The synced stores are live in memory too, so the next background save keeps them.
    expect(await page.evaluate(() => S.notes['2026-02-02'])).toBe('Saved on the other device');
    await page.evaluate(() => { saveNotes(); schedulePersist(true); });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sc_notes'))['2026-02-02'])).toBe('Saved on the other device');
    expect(await syncState(page)).toMatchObject({ dirty: false });
  });
});

test.describe('saving', () => {
  test('Save works straight after sign-in, and bumps the cloud version', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(1)));
    await waitForPicker(page);
    await page.evaluate(() => { nsCanonical().people.push({ person_id: 'p-new', full_name: 'New Person', home_department: 'Project A', source_id: 'src-0' }); nsPersist(); });
    expect(await syncState(page)).toMatchObject({ dirty: true });

    expect(await page.evaluate(() => _syncManualSave())).toBe(true);
    const last = await page.evaluate(() => window.__fakeSupabase.lastPush());
    expect(last.version).toBe(2);
    expect(last.data.people.some((p) => p.person_id === 'p-new')).toBe(true);
    expect(await syncState(page)).toMatchObject({ version: 2, dirty: false });
  });

  test('the first save from an account with no cloud copy creates it', async ({ page }) => {
    await signedInWith(page, null);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sc_cloud_sync') || '{}').version === 0, null, { timeout: 20_000 });
    await createTestProject(page);
    expect(await page.evaluate(() => _syncManualSave())).toBe(true);
    const row = await page.evaluate(() => window.__fakeSupabase.state.cfg.workspaceRow);
    expect(row.version).toBe(1);
    expect(row.department_key).toBe('__personal__');
    expect(await syncState(page)).toMatchObject({ version: 1, dirty: false });
  });

  test('uploads the schedule held in IndexedDB, not the lean localStorage copy', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(2, { scheduleRowsPer: 4 })));
    await waitForPicker(page);
    expect(await page.evaluate(() => _syncManualSave())).toBe(true);
    expect(await page.evaluate(() => window.__fakeSupabase.lastPush().data.schedule.length)).toBe(8);
  });
});

test.describe('both devices changed', () => {
  test('unsaved work here plus a newer cloud copy opens the comparison and replaces nothing', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(2)));
    await waitForPicker(page);
    await page.evaluate(() => { nsCanonical().people.push({ person_id: 'p-local', full_name: 'Local Person', home_department: 'Project A', source_id: 'src-0' }); nsPersist(); });
    await page.evaluate((data) => window.__fakeSupabase.simulateRemoteWrite(data), buildWorkspace(3));

    expect(await page.evaluate(() => window.syncPullWorkspace())).toBe('conflict');
    const modal = page.locator('#syncConflictModal');
    await expect(modal).toBeVisible();
    expect(await page.evaluate(() => nsCanonical().people.some((p) => p.person_id === 'p-local'))).toBe(true);
    expect(await page.evaluate(() => window.__fakeSupabase.pushCount())).toBe(0);

    await modal.getByRole('button', { name: /Use the cloud copy/ }).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => projectNames(page)).toEqual(['Project A', 'Project B', 'Project C']);
    expect(await page.evaluate(() => nsCanonical().people.some((p) => p.person_id === 'p-local'))).toBe(false);
    expect(await syncState(page)).toMatchObject({ version: 2, dirty: false });
  });

  test('a device with its own projects is asked before its first sign-in replaces them', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(2)) });
    await page.waitForFunction(() => window.NorthStar && window.NorthStar.bootSettled, null, { timeout: 20_000 });
    await createTestProject(page);
    const localProjects = await page.evaluate(() => window.nsListCanonicalProjects().map((p) => p.name));

    await page.evaluate(() => window.__fakeSupabase.signIn());
    await expect(page.locator('#syncConflictModal')).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate(() => window.nsListCanonicalProjects().map((p) => p.name))).toEqual(localProjects);
    // And a Save from here cannot replace the cloud copy it has never seen.
    expect(await page.evaluate(() => window._syncPushWorkspaceNow())).toBe(false);
    expect(await page.evaluate(() => window.__fakeSupabase.pushCount())).toBe(0);
  });
});
