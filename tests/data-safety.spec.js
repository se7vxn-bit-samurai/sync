const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

async function signedInWith(page, count, opts) {
  await openApp(page, Object.assign({ profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(count)) }, opts || {}));
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

test.describe('deleting a project', () => {
  test('deletion succeeds and removes the row once the cloud write confirms', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.deleteBtn).first().click();
    const modal = page.locator('#syncDeleteProjectModal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: /Delete .* permanently/ }).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => projectNames(page)).toEqual(['Project B']);
  });

  test('a failed cloud save keeps the modal in a Removing state and never claims success', async ({ page }) => {
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

  test('retrying after the cloud recovers closes the modal and confirms', async ({ page }) => {
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
    await expect(modal.getByRole('button', { name: /Reload and use the other/ })).toBeVisible();
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

  test('reconnecting flushes the pending save to the cloud', async ({ page, context }) => {
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
    await expect.poll(() => page.evaluate(() => window.__fakeSupabase.pushCount())).toBeGreaterThan(before);
    await expect(page.locator('[data-sync-status]').first()).toContainText('Saved to cloud');
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

  test('a real local schedule already in IndexedDB survives a normal page reload', async ({ page }) => {
    // The regression this guards: a top-level boot statement called nsPersist() synchronously,
    // before nsHydrateDatabase() (deferred to an idle callback) ever read IndexedDB. nsPersist()
    // stamps updated_at to "now" and queues an unconditional IndexedDB put() of whatever
    // nsCanonical() currently holds — which, read from localStorage at that point, is always
    // schedule-less (nsPersist's own localStorage copy strips `schedule` for quota reasons; only
    // IndexedDB ever holds the real rows). That queued write fired ~180ms later regardless of what
    // hydration decided, permanently overwriting IndexedDB's real schedule with an empty one — a
    // purely local-device bug, no sign-in or cloud involved. This is the exact "project is there
    // but the schedule is empty" report: people survive (the localStorage copy keeps them), the
    // schedule does not.
    await openApp(page);
    await page.waitForTimeout(500); // let this first boot's own writes, buggy or not, settle first

    const seededAt = new Date(Date.now() - 60_000).toISOString();
    await page.evaluate(
      async ({ storageKey, seededAt }) => {
        const lean = {
          schema: 'sync.northstar.canonical', version: 1, updated_at: seededAt,
          sources: [{ source_id: 'src-0', source_name: 'Project A.xlsx', department_name: 'Project A' }],
          people: [{ person_id: 'p-0', full_name: 'Project A Person 1', home_department: 'Project A', source_id: 'src-0' }],
          schedule: [], syncLog: [],
        };
        const full = Object.assign({}, lean, {
          schedule: [{ schedule_id: 's-0', person_name: 'Project A Person 1', department: 'Project A', source_id: 'src-0', date: '2026-02-01', shift: '09:00-17:00' }],
        });
        localStorage.setItem(storageKey, JSON.stringify(lean));
        await new Promise((resolve, reject) => {
          const req = indexedDB.open('sync-northstar', 1);
          req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('workspace')) req.result.createObjectStore('workspace'); };
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('workspace', 'readwrite');
            tx.objectStore('workspace').put(full, 'canonical');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
          };
          req.onerror = () => reject(req.error);
        });
      },
      { storageKey: 'sc_northstar_canonical_v1', seededAt }
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb, null, { timeout: 30_000 });
    // Cover both the 180ms debounced IndexedDB write and the up-to-1200ms idle-callback hydration.
    await page.waitForTimeout(1500);

    const stored = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const req = indexedDB.open('sync-northstar', 1);
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction('workspace', 'readonly');
            const getReq = tx.objectStore('workspace').get('canonical');
            getReq.onsuccess = () => { resolve(getReq.result); db.close(); };
            getReq.onerror = () => reject(getReq.error);
          };
          req.onerror = () => reject(req.error);
        })
    );

    expect(stored).toBeTruthy();
    expect(stored.schedule.length).toBe(1);
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
