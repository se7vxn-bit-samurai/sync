const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp } = require('./helpers');

// A schedule imported with no account must survive a reload. It used not to: boot wrote the
// localStorage-seeded model (which deliberately carries schedule:[]) over the IndexedDB copy
// ~180ms in, before hydration had read it back, so every reload erased the rows it was about to
// restore — while people, which live in both copies, survived and made the loss easy to miss.
const ROSTER = path.join(__dirname, 'fixtures', 'rosters', 'r_20x31.csv');

function storedCanonical(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const open = indexedDB.open('sync-northstar');
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      try {
        const get = db.transaction('workspace').objectStore('workspace').get('canonical');
        get.onsuccess = () => { db.close(); resolve({ schedule: (get.result && get.result.schedule || []).length, people: (get.result && get.result.people || []).length }); };
        get.onerror = () => { db.close(); resolve(null); };
      } catch (e) { db.close(); resolve(null); }
    };
  }));
}

async function importRoster(page) {
  await openApp(page, { workspaceRow: null });
  await page.waitForFunction(() => { try { return requireExcelParserReady(); } catch (e) { return false; } });
  await page.setInputFiles('#fi', ROSTER);
  await page.getByRole('button', { name: /^Load \d+ entries/ }).click();
  await page.waitForFunction(() => S.entries && S.entries.length === 620);
  await expect.poll(() => storedCanonical(page).then((s) => s && s.schedule)).toBe(620);
}

test.describe('local persistence', () => {
  test('an imported schedule survives a reload', async ({ page }) => {
    await importRoster(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb);

    await expect.poll(() => page.evaluate(() => (S.entries || []).length), { timeout: 15_000 }).toBe(620);
    // Resumed into the workspace, not the empty import card.
    await expect(page.locator('#mv')).toBeVisible();
    // And stays stored: the boot-time write must not have erased it underneath.
    await page.waitForTimeout(1000);
    expect(await storedCanonical(page)).toEqual({ schedule: 620, people: 20 });
  });

  test('a second reload still finds the schedule', async ({ page }) => {
    await importRoster(page);
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.sb);
      await expect.poll(() => page.evaluate(() => (S.entries || []).length), { timeout: 15_000 }).toBe(620);
    }
  });
});
