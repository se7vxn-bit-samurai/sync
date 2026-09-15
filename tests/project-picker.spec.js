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
});
