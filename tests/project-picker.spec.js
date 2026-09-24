const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

async function signInWith(page, count, opts) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(count, opts)) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
}

test.describe('project counts', () => {
  test('0 projects: no picker, import path stays front and centre', async ({ page }) => {
    await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(0)) });
    await page.evaluate(() => window.__fakeSupabase.signIn());
    await page.waitForTimeout(1500);
    await expect(page.locator(picker.root)).toBeHidden();
    await expect(page.locator('#lcNewSourceGroup')).toBeVisible();
    await expect(page.locator(picker.newSourceToggle)).toBeHidden();
  });

  test('1 project: the picker still appears, as a single choice', async ({ page }) => {
    // The behaviour this whole change exists for — one saved project used to open silently.
    await signInWith(page, 1);
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(['Project A']);
    await expect(page.locator(picker.root)).toContainText('Continue a project');
  });

  test('2 projects: both listed, neither opened automatically', async ({ page }) => {
    await signInWith(page, 2);
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(['Project A', 'Project B']);
    // Still on the landing screen: nothing was auto-opened.
    await expect(page.locator('#mv')).toBeHidden();
  });

  test('7 projects: all reachable via Show all, none stranded', async ({ page }) => {
    await signInWith(page, 7);
    await waitForPicker(page);
    expect(await projectNames(page)).toHaveLength(6);
    await expect(page.locator(picker.showAll)).toContainText('Show all 7 projects');
    await page.locator(picker.showAll).click();
    expect(await projectNames(page)).toHaveLength(7);
    await expect(page.locator(picker.showAll)).toHaveCount(0);
    // The old dead-end copy pointed at an in-app switcher the user cannot reach yet.
    await expect(page.locator(picker.root)).not.toContainText('department switcher');
  });

  test('7 projects: search narrows the list without needing Show all', async ({ page }) => {
    await signInWith(page, 7);
    await waitForPicker(page);
    await page.locator(picker.search).fill('Project G');
    expect(await projectNames(page)).toEqual(['Project G']);
    await page.locator(picker.search).fill('nothing-matches-this');
    await expect(page.locator(picker.root)).toContainText('No projects match');
    await page.locator(picker.search).fill('');
    expect(await projectNames(page)).toHaveLength(6);
  });

  test('a background re-render keeps the search text, the expansion and keyboard focus', async ({ page }) => {
    // Local hydration and manual syncs re-render the picker on their own schedule.
    await signInWith(page, 7);
    await waitForPicker(page);
    await page.locator(picker.search).fill('Project G');
    await page.evaluate(() => _syncRenderProjectPicker());
    await expect(page.locator(picker.search)).toHaveValue('Project G');
    await expect(page.locator(picker.search)).toBeFocused();
    expect(await projectNames(page)).toEqual(['Project G']);

    await page.locator(picker.search).fill('');
    await page.locator(picker.showAll).click();
    await page.evaluate(() => _syncRenderProjectPicker());
    expect(await projectNames(page)).toHaveLength(7);

    await page.locator(picker.rows).nth(6).focus();
    await page.evaluate(() => _syncRenderProjectPicker());
    await page.keyboard.press('Enter');
    await expect(page.locator('#mv')).toBeVisible();
    expect(await page.evaluate(() => S.activeDept)).toBe('Project G');
  });

  test('a people-only project (no schedule rows) is listed and opens', async ({ page }) => {
    await signInWith(page, 1, { peopleOnly: true });
    await waitForPicker(page);
    expect(await projectNames(page)).toEqual(['Project A']);
    await expect(page.locator(picker.root)).toContainText('2 people');
    await expect(page.locator(picker.root)).not.toContainText('schedule rows');
    await page.locator(picker.rows).first().click();
    // The regression this guards: a PeopleHub-only import passed the picker's bar but failed the
    // stricter viewport restore, so the app stayed on the landing screen with no error at all.
    await expect(page.locator('#mv')).toBeVisible();
    await expect(page.locator('#us')).toBeHidden();
  });

  test('opening a project reveals the workspace and records it as most recent', async ({ page }) => {
    await signInWith(page, 3);
    await waitForPicker(page);
    await page.locator(picker.rows).nth(2).click();
    await expect(page.locator('#mv')).toBeVisible();
    expect(await page.evaluate(() => S.activeDept)).toBe('Project C');
    const opened = await page.evaluate(() => JSON.parse(localStorage.getItem('sync_last_opened') || '{}'));
    expect(Object.keys(opened)).toContain('project c');
  });

  test('switching projects shows the new schedule, not a cached copy of the last one', async ({ page }) => {
    // Every indexed view caches by S.entriesVer. Opening from the picker replaced S.entries without
    // bumping it, so screens kept serving the index built before: empty, or the last project's.
    const indexedNames = () => page.evaluate(() => {
      railNavCalendar('day');
      return Object.keys(getDataIndexes().byName);
    });
    await signInWith(page, 2);
    await waitForPicker(page);
    await page.locator(picker.rows, { hasText: 'Project A' }).click();
    await expect.poll(indexedNames).toEqual([expect.stringMatching(/^Project A/)]);

    await page.evaluate(() => _syncShowProjectPicker());
    await page.locator(picker.rows, { hasText: 'Project B' }).click();
    await expect.poll(indexedNames).toEqual([expect.stringMatching(/^Project B/)]);
  });

  test('opening a project on a fresh sign-in (cloud pull only, no local workbook) shows its schedule', async ({ page }) => {
    // Regression: S.entries rebuilt correctly from the cloud pull (the schedule ROWS were really
    // there), but S.months/S.month/S.mIdx — the separate index every local import path derives for
    // itself at load time — was never rebuilt for this cross-device path. The calendar had no month
    // to show, so it rendered as if nothing had loaded even though the data was genuinely present.
    // Reported as: "sign in, open a saved project, the dashboard opens but every tab and column is
    // empty."
    await signInWith(page, 1);
    await waitForPicker(page);
    await page.locator(picker.rows).first().click();
    await expect(page.locator('#mv')).toBeVisible();

    expect(await page.evaluate(() => S.entries.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => S.months.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => S.month)).not.toBeNull();
    // The month index must actually correspond to real data, not just be non-empty. Month keys
    // are 0-indexed throughout this codebase (getFullYear()+"-"+P(getMonth()), no +1) — matched
    // here rather than the calendar convention, since that's what S.months actually contains.
    const monthsMatchEntries = await page.evaluate(() => {
      const entryMonths = new Set(S.entries.filter((e) => e.date).map((e) => e.date.getFullYear() + '-' + String(e.date.getMonth()).padStart(2, '0')));
      return S.months.every((m) => entryMonths.has(m)) && S.months.length === entryMonths.size;
    });
    expect(monthsMatchEntries).toBe(true);
  });
});
