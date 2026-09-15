const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, picker, waitForPicker, projectNames } = require('./helpers');

async function signedInWith(page, count) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(count)) });
  await page.evaluate(() => window.__fakeSupabase.signIn());
  await waitForPicker(page);
}

test.describe('keyboard access', () => {
  test('project rows are real buttons, not clickable divs', async ({ page }) => {
    await signedInWith(page, 3);
    const shape = await page.evaluate(() => {
      const wrap = document.querySelector('.lc-project-row-wrap');
      const row = wrap.querySelector('.lc-project-row');
      return {
        rowTag: row.tagName,
        rowTabIndex: row.tabIndex,
        nestedButton: !!row.querySelector('button'),
        deleteIsSibling: wrap.querySelector('.lc-project-delete').parentElement === wrap,
        deleteLabel: wrap.querySelector('.lc-project-delete').getAttribute('aria-label'),
        renameLabel: wrap.querySelector('.lc-project-action:not(.lc-project-delete)').getAttribute('aria-label'),
      };
    });
    expect(shape.rowTag).toBe('BUTTON');
    expect(shape.rowTabIndex).toBe(0);
    expect(shape.nestedButton).toBe(false); // buttons cannot contain buttons
    expect(shape.deleteIsSibling).toBe(true);
    expect(shape.deleteLabel).toBe('Delete Project A');
    expect(shape.renameLabel).toBe('Rename Project A');
  });

  test('a project can be opened with the keyboard alone', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().focus();
    await expect(page.locator(picker.rows).first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mv')).toBeVisible();
    expect(await page.evaluate(() => S.activeDept)).toBe('Project A');
  });

  test('tab order reaches open, rename and delete for each project', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.rows).first().focus();
    const seen = [];
    for (let i = 0; i < 3; i++) {
      seen.push(await page.evaluate(() => document.activeElement.className));
      await page.keyboard.press('Tab');
    }
    expect(seen[0]).toContain('lc-project-row');
    expect(seen[1]).toContain('lc-project-action');
    expect(seen[2]).toContain('lc-project-delete');
  });

  test('delete can be triggered from the keyboard without opening the project', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.deleteBtn).first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#syncDeleteProjectModal')).toBeVisible();
    // The row's own click must not have fired as well.
    await expect(page.locator('#mv')).toBeHidden();
  });
});

test.describe('renaming', () => {
  test('a project can be renamed from the picker without opening it', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.renameBtn).first().click();
    const modal = page.locator('#syncRenameProjectModal');
    await expect(modal).toBeVisible();
    await page.locator('#syncRenameInput').fill('Night Shift');
    await modal.getByRole('button', { name: 'Rename project' }).click();
    await expect(modal).toHaveCount(0);
    await expect.poll(() => projectNames(page)).toContain('Night Shift');
    expect(await projectNames(page)).not.toContain('Project A');
  });

  test('renaming to an existing name is refused', async ({ page }) => {
    await signedInWith(page, 2);
    await page.locator(picker.renameBtn).first().click();
    await page.locator('#syncRenameInput').fill('Project B');
    await page.locator('#syncRenameProjectModal').getByRole('button', { name: 'Rename project' }).click();
    await expect(page.locator('#syncRenameError')).toContainText('already uses that name');
    await expect(page.locator('#syncRenameProjectModal')).toBeVisible();
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the picker is usable and tappable at phone width', async ({ page }) => {
    await signedInWith(page, 3);
    const first = page.locator(picker.rows).first();
    await expect(first).toBeVisible();
    const box = await first.boundingBox();
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThanOrEqual(40); // comfortable tap target
    // No horizontal overflow on the landing screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await first.tap();
    await expect(page.locator('#mv')).toBeVisible();
  });

  test('delete and rename controls stay reachable at phone width', async ({ page }) => {
    await signedInWith(page, 2);
    await expect(page.locator(picker.deleteBtn).first()).toBeVisible();
    await expect(page.locator(picker.renameBtn).first()).toBeVisible();
    const box = await page.locator(picker.deleteBtn).first().boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(24);
  });
});
