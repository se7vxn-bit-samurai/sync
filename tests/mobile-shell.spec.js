const { test, expect } = require('@playwright/test');
const { openApp, PROFILE, buildWorkspace, workspaceRow, createTestProject } = require('./helpers');

// The phone shell: the bottom bar's order and names, and the home-screen install on iPhone. iOS
// ignored the SVG touch icon (it saved a screenshot instead) and black-translucent put the top of
// every screen under the status bar and notch.

async function openProject(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: workspaceRow(buildWorkspace(0)) });
  await createTestProject(page);
  await expect(page.locator('#mv')).toBeVisible();
  await expect(page.locator('#syncBoot')).toHaveCount(0);
}

test('the nav reads Home, Calendar, People, Ops, Projects', async ({ page }) => {
  await openProject(page);
  const labels = page.locator('#mfRailNav .mf-rail-parent .ri-label');
  await expect(labels).toHaveText(['Home', 'Calendar', 'People', 'Ops', 'Projects']);
  await page.locator('[data-testid="rail-projects"]').click();
  await expect(page.locator('#syncProjectsPanel')).toBeVisible();
});

test('on a phone, the five bar items share the width and all fit on screen', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'phone layout only');
  await openProject(page);
  const width = page.viewportSize().width;
  const boxes = await page.locator('#mfRailNav .mf-rail-group').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  expect(boxes).toHaveLength(5);
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(width + 0.5);
    expect(Math.abs(b.width - boxes[0].width)).toBeLessThan(1);
  }
});

test('iPhone gets a real PNG home-screen icon and a status bar the page stays below', async ({ page, request }) => {
  await openApp(page);
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(href).toBe('apple-touch-icon.png');
  const res = await request.get('/' + href);
  expect(res.status()).toBe(200);
  const png = await res.body();
  // PNG signature, then the IHDR width and height.
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute('content', 'black');
});

test('with a notch inset, the shell starts below it and the bottom bar still ends at the screen edge', async ({ page, context }) => {
  test.skip(test.info().project.name !== 'mobile-chromium', 'phone layout only');
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  await openProject(page);
  const height = page.viewportSize().height;
  // The highest visible piece of the shell: the project tab strip when it shows, else the masthead.
  const top = await page.evaluate(() => Math.min(...[...document.querySelector('.app').children]
    .filter((el) => !['fixed', 'absolute'].includes(getComputedStyle(el).position))
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.height > 0)
    .map((r) => r.top)));
  expect(top).toBeGreaterThanOrEqual(47);
  const rail = await page.locator('#mfRail').evaluate((el) => el.getBoundingClientRect().toJSON());
  expect(Math.abs(rail.bottom - height)).toBeLessThan(1);

  await page.evaluate(() => _syncShowProjectPicker());
  const landing = await page.locator('#us').evaluate((el) => el.getBoundingClientRect().toJSON());
  expect(landing.top).toBeGreaterThanOrEqual(47);
  expect(landing.bottom).toBeLessThanOrEqual(height + 0.5);
});
