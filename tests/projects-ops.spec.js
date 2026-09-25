const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, waitForPicker, createTestProject } = require('./helpers');

// The Projects panel, and the edits it saves. Before this: the entry point was a small link
// shown only when signed in, that re-rendered the landing screen and so often looked like it did
// nothing; and a device that loaded a cloud copy kept its own empty People stores in memory, so the
// next background save deleted the loaded logbook, agent notes and statuses, and a cloud save then
// pushed that loss back to every device.

const PANEL = '#syncProjectsPanel';
const syncState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('sc_cloud_sync') || '{}'));

async function signedInWith(page, row) {
  await openApp(page, { profile: PROFILE, workspaceRow: row });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

// People-side edits made the way the UI makes them: logbook, agent note, agent status, agent detail.
async function editPeople(page) {
  await page.evaluate(() => {
    const who = 'Project A Person 1';
    peopleAddLogbookEntry('note', { leader: who, title: 'Logged on device A' });
    S.agentNotes[who] = 'Note from device A'; saveAgentNotes();
    setAgentStatusQuick(who, 'sick', new Date('2026-02-02T09:00:00'));
    S.people[who] = Object.assign(S.people[who] || { name: who }, { otEligible: false }); savePeople();
  });
}

test.describe('Projects entry point', () => {
  test('is on the landing screen signed out, and opens the projects saved on this device', async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => window.NorthStar && window.NorthStar.bootSettled, null, { timeout: 20_000 });
    const button = page.locator('#lcProjectsOpsBtn');
    await expect(button).toBeVisible();
    await button.click();
    const panel = page.locator(PANEL);
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('No projects saved on this device yet');
    await expect(panel.getByRole('button', { name: /Continue with Google/ })).toBeVisible();

    // Nothing saved means nothing listed: no sample or demo project is offered in its place.
    await expect(panel.getByRole('button', { name: /sample/i })).toHaveCount(0);
    await page.evaluate(() => _syncCloseProjectsPanel());
    await createTestProject(page);
    await expect(page.locator('#mv')).toBeVisible();
    await page.evaluate(() => _syncShowProjectPicker());
    await expect(page.locator('#lcProjectsOpsSub')).toHaveText('1 project · on this device');
    await page.locator('#lcProjectsOpsBtn').click();
    await expect(page.locator(`${PANEL} .spp-row-name`)).toHaveText(['Test Team']);
    expect(page.__jsErrors).toEqual([]);
  });

  test('signed in, lists cloud projects and opens one', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(2)));
    await page.locator('#lcProjectsOpsBtn').click();
    const panel = page.locator(PANEL);
    await expect(panel.locator('.spp-row-name')).toHaveText(['Project A', 'Project B']);
    await expect(panel).toContainText('Everything on this device is in your cloud copy');
    await panel.locator('.spp-row', { hasText: 'Project B' }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.locator('#mv')).toBeVisible();
    expect(await page.evaluate(() => S.activeDept)).toBe('Project B');
  });

  test('opens from inside a project, marks the open one, and Sync from cloud leaves it open when nothing changed', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(2)));
    await page.evaluate(() => _syncOpenProject('Project A'));
    await page.evaluate(() => _syncOpenProjectsPanel());
    const panel = page.locator(PANEL);
    await expect(panel.locator('.spp-row.open')).toContainText('Project A');
    await panel.locator('[data-testid="spp-pull"]').click();
    await expect(panel.locator('[data-testid="spp-pull"]')).toHaveText('Sync from cloud');
    expect(await page.evaluate(() => S.activeDept)).toBe('Project A');
    await expect(page.locator('#mv')).toBeVisible();
  });

  test('says what is not in the cloud yet, and Save carries it', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(1)));
    await page.evaluate(() => _syncOpenProject('Project A'));
    await editPeople(page);
    await page.evaluate(() => _syncOpenProjectsPanel());
    const changes = page.locator(`${PANEL} [data-testid="spp-changes"]`);
    await expect(changes).toContainText('Logbook');
    await expect(changes).toContainText('Agent notes');
    await expect(changes).toContainText('Agent statuses');

    await page.locator(`${PANEL} [data-testid="spp-save"]`).click();
    await expect(changes).toHaveCount(0);
    await expect(page.locator(PANEL)).toContainText('Everything on this device is in your cloud copy');
    const pushed = await page.evaluate(() => window.__fakeSupabase.lastPush().data);
    expect(pushed.sc_people_logbook.map((e) => e.title)).toEqual(['Logged on device A']);
    expect(pushed.sc_agentnotes['Project A Person 1']).toBe('Note from device A');
    expect(await syncState(page)).toMatchObject({ dirty: false, changed: [] });
  });
});

test.describe('edits reach the other device', () => {
  test('Save includes an edit made a moment before it', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(1)));
    // One task: the logbook write is still on its debounce timer when Save reads storage.
    await page.evaluate(() => { peopleAddLogbookEntry('note', { title: 'Just now' }); return _syncManualSave(); });
    const pushed = await page.evaluate(() => window.__fakeSupabase.lastPush().data);
    expect((pushed.sc_people_logbook || []).map((e) => e.title)).toEqual(['Just now']);
  });

  test('a second device keeps the loaded logbook, notes and statuses through its next save', async ({ page, browser }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(1)));
    await page.evaluate(() => _syncOpenProject('Project A'));
    await editPeople(page);
    expect(await page.evaluate(() => _syncManualSave())).toBe(true);
    const row = await page.evaluate(() => window.__fakeSupabase.state.cfg.workspaceRow);

    const other = await (await browser.newContext()).newPage();
    await signedInWith(other, row);
    await other.evaluate(() => _syncOpenProject('Project A'));
    const inMemory = () => other.evaluate(() => ({
      log: S.peopleLogbook.map((e) => e.title),
      note: S.agentNotes['Project A Person 1'],
      status: Object.values(S.agentStatuses),
      ot: S.people['Project A Person 1'] && S.people['Project A Person 1'].otEligible,
    }));
    const expected = { log: ['Logged on device A'], note: 'Note from device A', status: ['sick'], ot: false };
    expect(await inMemory()).toEqual(expected);

    // Moving around runs the background save that used to delete them.
    await other.evaluate(() => setTab('people'));
    await other.waitForTimeout(600);
    expect(await inMemory()).toEqual(expected);
    expect(await other.evaluate(() => JSON.parse(localStorage.getItem('sc_people_logbook')).map((e) => e.title))).toEqual(['Logged on device A']);
    // Loading is not an edit: nothing here to save back.
    expect(await syncState(other)).toMatchObject({ dirty: false });
    expect(await other.evaluate(() => _syncManualSave())).toBe(true);
    const pushed = await other.evaluate(() => window.__fakeSupabase.lastPush().data);
    expect(pushed.sc_people_logbook.map((e) => e.title)).toEqual(['Logged on device A']);
    expect(pushed.sc_agentnotes['Project A Person 1']).toBe('Note from device A');
  });

  test('entries removed on another device are removed here when its copy loads', async ({ page }) => {
    await signedInWith(page, workspaceRow(buildWorkspace(1)));
    await page.evaluate(() => peopleAddLogbookEntry('note', { title: 'Stale here' }));
    expect(await page.evaluate(() => _syncManualSave())).toBe(true);
    // The other device cleared its logbook, so its save carries no logbook key at all.
    const remote = await page.evaluate(() => {
      const data = Object.assign({}, window.__fakeSupabase.state.cfg.workspaceRow.data);
      delete data.sc_people_logbook;
      return data;
    });
    await page.evaluate((data) => window.__fakeSupabase.simulateRemoteWrite(data), remote);
    expect(await page.evaluate(() => _syncManualPull())).toBe(true);
    expect(await page.evaluate(() => S.peopleLogbook.length)).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('sc_people_logbook'))).toBeNull();
    expect(await syncState(page)).toMatchObject({ dirty: false });
  });
});
