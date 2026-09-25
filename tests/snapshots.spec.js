const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

async function signedInWith(page, count) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(count)) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

const listSnapshots = (page) => page.evaluate(() => window.nsListSnapshots());

test.describe('snapshots', () => {
  test('a manual snapshot captures the current workspace', async ({ page }) => {
    await signedInWith(page, 2);
    const entry = await page.evaluate(() => window.nsSaveSnapshot('Manual snapshot', { reason: 'manual' }));
    expect(entry).toBeTruthy();
    expect(entry.people).toBe(4);
    expect(entry.schedule).toBe(6);
    expect(entry.projects).toEqual(['Project A', 'Project B']);
    expect(await listSnapshots(page)).toHaveLength(1);
  });

  test('deleting a project takes an automatic restore point first', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.deleteBtn).first().click();
    await page.locator('#syncDeleteProjectModal').getByRole('button', { name: /Delete .* permanently/ }).click();
    await expect(page.locator('#syncDeleteProjectModal')).toHaveCount(0);
    await expect.poll(() => projectNames(page)).toEqual(['Project B']);

    const snapshots = await listSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].reason).toBe('auto-delete');
    expect(snapshots[0].projects).toEqual(['Project A', 'Project B']);
  });

  test('restoring brings a deleted project back', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.deleteBtn).first().click();
    await page.locator('#syncDeleteProjectModal').getByRole('button', { name: /Delete .* permanently/ }).click();
    await expect.poll(() => projectNames(page)).toEqual(['Project B']);

    const id = (await listSnapshots(page))[0].id;
    const result = await page.evaluate((snapId) => window.nsRestoreSnapshot(snapId), id);
    expect(result.ok).toBe(true);
    await page.evaluate(() => _syncRenderProjectPicker());
    await expect.poll(() => projectNames(page)).toEqual(['Project A', 'Project B']);
  });

  test('restoring takes its own snapshot, so a wrong restore is recoverable', async ({ page }) => {
    await signedInWith(page, 2);
    await page.evaluate(() => window.nsSaveSnapshot('Starting point', { reason: 'manual' }));
    const id = (await listSnapshots(page))[0].id;
    await page.evaluate((snapId) => window.nsRestoreSnapshot(snapId), id);
    const after = await listSnapshots(page);
    expect(after.length).toBe(2);
    expect(after.some((s) => s.reason === 'auto-restore')).toBe(true);
  });

  test('snapshots survive a reload and are listed in Settings', async ({ page }) => {
    await signedInWith(page, 1);
    await page.evaluate(() => window.nsSaveSnapshot('Before the big import', { reason: 'manual' }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb && typeof window.nsListSnapshots === 'function');
    const snapshots = await listSnapshots(page);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].label).toBe('Before the big import');

    await page.evaluate(() => openSettings());
    await expect(page.locator('#settingsOverlay')).toContainText('Backups & history');
    await expect(page.locator('#settingsOverlay')).toContainText('Before the big import');
    await expect(page.locator('#settingsOverlay').getByRole('button', { name: 'Restore' }).first()).toBeVisible();
  });

  test('the snapshot list is capped so it cannot grow without bound', async ({ page }) => {
    await signedInWith(page, 1);
    await page.evaluate(async () => {
      for (let i = 0; i < 15; i++) await window.nsSaveSnapshot('Snapshot ' + i, { reason: 'manual' });
    });
    const snapshots = await listSnapshots(page);
    expect(snapshots.length).toBeLessThanOrEqual(12);
  });
});

test.describe('no sample data', () => {
  test('nothing is offered or generated in place of real data', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(0)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await page.waitForFunction(() => window.NorthStar && window.NorthStar.bootSettled, null, { timeout: 20_000 });
    await expect(page.locator('#lcSampleBtn')).toHaveCount(0);
    expect(await page.evaluate(() => typeof window.nsCreateSampleProject)).toBe('undefined');
    expect(await page.evaluate(() => window.nsListCanonicalProjects().length)).toBe(0);
    expect(await page.evaluate(() => (S.entries || []).length)).toBe(0);
  });
});

test.describe('sample projects made by the old sample button', () => {
  test('Settings lists them and removes only them', async ({ page }) => {
    const model = buildWorkspace(1, { names: ['Real Team'] });
    model.sources.push({ source_id: 'src-sample', source_name: 'Sample roster', source_kind: 'sample', department_name: 'Sample Team', loaded_at: new Date().toISOString(), sheets: 1 });
    model.people.push({ person_id: 'p-sample', full_name: 'Sample Person', home_department: 'Sample Team', source_id: 'src-sample' });
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(model) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(expect.arrayContaining(['Real Team', 'Sample Team']));

    await page.evaluate(() => openSettings('workspace'));
    const section = page.locator('[data-testid="sample-cleanup"]');
    await expect(section).toContainText('Sample Team');
    await expect(section).not.toContainText('Real Team');
    page.once('dialog', (d) => d.accept());
    await section.locator('[data-testid="remove-sample-projects"]').click();
    await expect(section).toHaveCount(0);
    expect(await page.evaluate(() => window.nsListCanonicalProjects().map((p) => p.name))).toEqual(['Real Team']);
    expect(await page.evaluate(() => window.nsListSampleProjects())).toEqual([]);
  });

  test('Settings shows nothing about them when there are none', async ({ page }) => {
    await signedInWith(page, 1);
    await page.evaluate(() => openSettings('workspace'));
    await expect(page.locator('#settingsPanel')).toBeVisible();
    await expect(page.locator('[data-testid="sample-cleanup"]')).toHaveCount(0);
  });
});

test.describe('what changed since last time', () => {
  test('reports the difference in counts when a project is reopened', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();

    // Counts are captured when a project is LEFT, not on every autosave — switching away is what
    // records "this is how it stood when you last saw it".
    await page.evaluate(() => _syncOpenProject('Project B'));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sc_view_state'))['project a']);
    expect(saved.counts).toEqual({ people: 2, schedule: 3 });
    await page.evaluate(() => {
      const map = JSON.parse(localStorage.getItem('sc_view_state'));
      map['project a'].counts = { people: 1, schedule: 1 };
      map['project a'].savedAt = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      localStorage.setItem('sc_view_state', JSON.stringify(map));
    });
    await page.evaluate(() => _syncOpenProject('Project A'));
    // Toasts are transient on screen but persist in the notification tray, which is where this has
    // to be asserted — the tray is hidden, so textContent rather than a visible-text matcher, and
    // polled because the tray is populated a tick after the toast is raised.
    const tray = () => page.evaluate(() => document.getElementById('notifTray').textContent);
    await expect.poll(tray).toContain('Changed since you were last here');
    const notices = await tray();
    expect(notices).toContain('+1 person');
    expect(notices).toContain('+2 schedule rows');
  });

  test('notification history survives a re-render', async ({ page }) => {
    // Regression: the toolbar re-emits the notification tray markup on every render, which threw
    // away the rendered list and reset the unread badge while the notifications themselves stayed
    // in memory — so anything raised just before a render (opening a project, finishing an import,
    // a failed save) vanished from the history.
    await signedInWith(page, 2);
    await page.evaluate(() => toast('A thing worth keeping', 'info', 4000));
    await expect
      .poll(() => page.evaluate(() => document.getElementById('notifTray').textContent))
      .toContain('A thing worth keeping');
    await page.evaluate(() => { ren(); });
    await page.waitForTimeout(400);
    const tray = await page.evaluate(() => document.getElementById('notifTray').textContent);
    expect(tray).toContain('A thing worth keeping');
    expect(await page.evaluate(() => document.getElementById('notifBadge').textContent)).not.toBe('0');
  });

  test('stays quiet when nothing changed', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();
    await page.evaluate(() => _syncOpenProject('Project B'));
    await page.evaluate(() => _syncOpenProject('Project A'));
    // Give the tray the same window the positive case needs, then assert nothing landed in it.
    await page.waitForTimeout(1000);
    const notices = await page.evaluate(() => document.getElementById('notifTray').textContent);
    expect(notices).not.toContain('Changed since you were last here');
  });
});

test.describe('command palette', () => {
  test('lists the other projects and can switch to one', async ({ page }) => {
    await signedInWith(page, 3);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    const labels = await page.evaluate(() => _collectCommandPaletteActions().map((a) => a.label));
    // The project currently open is not offered as somewhere to go.
    expect(labels).toContain('Open project Project B');
    expect(labels).toContain('Open project Project C');
    expect(labels).not.toContain('Open project Project A');
    expect(labels).toContain('Switch project…');
    expect(labels).toContain('Save snapshot');
    expect(labels).toContain('Export backup file');
    expect(labels).toContain('Settings');

    await page.evaluate(() => {
      const action = _collectCommandPaletteActions().find((a) => a.label === 'Open project Project C');
      action.run();
    });
    expect(await page.evaluate(() => S.activeDept)).toBe('Project C');
  });

  test('Switch project returns to the picker without losing the open project', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();
    await page.evaluate(() => _syncShowProjectPicker());
    await expect(page.locator('#mv')).toBeHidden();
    await waitForPicker(page, { sync: false });
    // Still loaded underneath, so coming back is immediate.
    expect(await page.evaluate(() => S.entries.length)).toBeGreaterThan(0);
  });
});
