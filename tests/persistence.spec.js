const { test, expect } = require('@playwright/test');
const path = require('path');
const { openApp } = require('./helpers');

// An offline schedule must survive a reload without being reopened. The local cache is a project
// library; activating its sheet remains a deliberate project-picker action.
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

async function importRoster(page, keepOffline = true) {
  await openApp(page, { workspaceRow: null });
  await page.waitForFunction(() => { try { return requireExcelParserReady(); } catch (e) { return false; } });
  await page.setInputFiles('#fi', ROSTER);
  if (!keepOffline) await page.locator('#parseOfflineCopy').uncheck();
  await page.getByRole('button', { name: /^Load \d+ entries/ }).click();
  await page.waitForFunction(() => S.entries && S.entries.length === 620);
  if (keepOffline) await expect.poll(() => storedCanonical(page).then((s) => s && s.schedule)).toBe(620);
}

test.describe('local persistence', () => {
  test('an imported schedule survives a reload without reopening itself', async ({ page }) => {
    await importRoster(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb);

    await expect.poll(() => page.locator('#lcProjectPicker .lc-project-row').count(), { timeout: 15_000 }).toBe(1);
    expect(await page.evaluate(() => ({ active: S.activeDept, entries: S.entries.length }))).toEqual({ active: null, entries: 0 });
    await expect(page.locator('#mv')).toBeHidden();
    // It remains cached, ready for an explicit offline-project selection.
    await page.waitForTimeout(1000);
    expect(await storedCanonical(page)).toEqual({ schedule: 620, people: 20 });
  });

  test('repeated reloads keep the schedule in the offline project library', async ({ page }) => {
    await importRoster(page);
    for (let i = 0; i < 2; i++) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.sb);
      await expect.poll(() => page.locator('#lcProjectPicker .lc-project-row').count(), { timeout: 15_000 }).toBe(1);
      expect(await page.evaluate(() => S.entries.length)).toBe(0);
    }
  });

  test('a one-off load is not retained when offline copy is declined', async ({ page }) => {
    await importRoster(page, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.sb);
    await page.waitForTimeout(500);
    await expect(page.locator('#lcProjectPicker .lc-project-row')).toHaveCount(0);
    expect(await page.evaluate(() => S.entries.length)).toBe(0);
  });
});
