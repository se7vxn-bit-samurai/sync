const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp } = require('./helpers');

// The Schedule Window: one person, any range, UK and SA times, where each row came from, and
// sending it to them. The fixture spans the UK clock change (Sun 25 Oct 2026): SA is UK +1h before
// it and UK +2h from it. Ben has an overnight shift on Fri 23 Oct; the roster ends on Thu 29 Oct.
const ROSTER = path.join(__dirname, 'fixtures', 'rosters', 'sw_dst.csv');

async function loadRoster(page) {
  await openApp(page, { workspaceRow: null });
  await page.waitForFunction(() => { try { return requireExcelParserReady(); } catch (e) { return false; } });
  await page.setInputFiles('#fi', ROSTER);
  await page.getByRole('button', { name: /^Load \d+ entries/ }).click();
  await page.waitForFunction(() => S.entries && S.entries.length === 14);
  // The boot splash covers the page until finishBoot() removes it.
  await expect(page.locator('#syncBoot')).toHaveCount(0);
}

const openWindow = (page, name, opts) => page.evaluate(([n, o]) => openScheduleWindow(n, o), [name, opts || { mode: 'custom', from: '2026-10-23', to: '2026-10-31' }]);
const row = (page, iso) => page.locator(`#swinTable tr[data-iso="${iso}"]`);
const firstTime = (page, iso) => row(page, iso).locator('td').nth(2);

test.describe('Schedule Window', () => {
  test('SA times follow the UK clock change, on the changeover Sunday too', async ({ page }) => {
    await loadRoster(page);
    // Shift times on the changeover Sundays themselves are after 01:00 UK, so they get the new offset.
    expect(await page.evaluate(() => [
      u2s('09:00', new Date(2026, 9, 24)), u2s('09:00', new Date(2026, 9, 25)), u2s('09:00', new Date(2026, 9, 26)),
      u2s('09:00', new Date(2027, 2, 27)), u2s('09:00', new Date(2027, 2, 28)),
    ])).toEqual(['10:00', '11:00', '11:00', '11:00', '10:00']);

    await openWindow(page, 'Ada Leader');
    await expect(page.locator('#swinTitle')).toHaveText('Ada Leader');
    await expect(firstTime(page, '2026-10-23')).toHaveText('10:00');
    await expect(firstTime(page, '2026-10-24')).toHaveText('10:00');
    await expect(firstTime(page, '2026-10-25')).toHaveText('11:00');
    await expect(firstTime(page, '2026-10-26')).toHaveText('11:00');
    // The UK columns keep the roster's own times.
    await expect(row(page, '2026-10-25').locator('td').nth(4)).toHaveText('09:00');
    expect(page.__jsErrors).toEqual([]);
  });

  test('an overnight shift ends the next day, converted on that day', async ({ page }) => {
    await loadRoster(page);
    const r = await page.evaluate(() => swinRows('Ben Rows', '2026-10-23', '2026-10-23')[0]);
    expect([r.ukS, r.ukE, r.saS, r.saE, r.overnight]).toEqual(['22:00', '06:00', '23:00', '07:00', true]);
    await openWindow(page, 'Ben Rows');
    await expect(row(page, '2026-10-23').locator('sup').first()).toHaveText('+1');
  });

  test('a date with no source row shows No row, never a shift', async ({ page }) => {
    await loadRoster(page);
    await openWindow(page, 'Ben Rows');
    for (const iso of ['2026-10-30', '2026-10-31']) {
      await expect(row(page, iso)).toHaveAttribute('data-kind', 'none');
      await expect(row(page, iso)).toContainText('No row');
      await expect(firstTime(page, iso)).toHaveText('—');
    }
    await expect(page.locator('.swin-stat.warn b')).toHaveText('2');
    const text = await page.evaluate(() => swinBuildText('Ben Rows', '2026-10-23', '2026-10-31', 'sa', 'test').text);
    expect(text).toContain('Fri 30 Oct  No row');
    expect(text).toContain('2 days not on the roster yet');
  });

  test('an agent with no rows of their own follows the team leader\'s rota, and says so', async ({ page }) => {
    await loadRoster(page);
    await page.evaluate(() => { S.people['Cara Follows'] = { name: 'Cara Follows', role: 'agent', teamLeader: 'Ada Leader', team: '' }; });
    await openWindow(page, 'Cara Follows');
    await expect(row(page, '2026-10-25')).toHaveAttribute('data-source', 'tl');
    await expect(row(page, '2026-10-25')).toContainText('From TL rota');
    await expect(firstTime(page, '2026-10-25')).toHaveText('11:00');
    await expect(page.locator('.swin-hd')).toContainText("shifts follow Ada Leader's rota");
    await expect(page.locator('.swin-hd')).toContainText('Leader: Ada Leader');
  });

  test('the clock switch puts UK or SA first', async ({ page }) => {
    await loadRoster(page);
    await openWindow(page, 'Ada Leader', { mode: 'custom', from: '2026-10-23', to: '2026-10-29', clock: 'sa' });
    await expect(page.locator('#swinTable th').nth(2)).toHaveText('SA in');
    // On a phone the panels stack; the table must keep its height instead of collapsing under the summary.
    expect(await page.locator('.swin-tbl-wrap').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(150);
    await page.locator('#swinClock_uk').click();
    await expect(page.locator('#swinTable th').nth(2)).toHaveText('UK in');
    await expect(firstTime(page, '2026-10-25')).toHaveText('09:00');
    await expect(page.locator('#swinClock_uk')).toHaveAttribute('aria-pressed', 'true');
  });

  test('copying records the send, and a later roster change is listed as changed since', async ({ page }) => {
    await loadRoster(page);
    await page.evaluate(() => {
      window.__copied = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } });
    });
    await openWindow(page, 'Ada Leader', { mode: 'custom', from: '2026-10-23', to: '2026-10-29', clock: 'sa' });
    await page.locator('#swinCopy').click();
    await expect(page.locator('#swinSentLine')).toContainText('Last sent');
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toContain('Ada Leader · Fri 23 Oct – Thu 29 Oct 2026 · SA time');
    expect(copied).toContain('Sun 25 Oct  11:00–19:30');
    expect(copied).toContain('Thu 29 Oct  LEAVE');
    await expect(page.locator('#swinChanged')).toContainText('Nothing in this range has changed since');

    // The roster moves Wednesday's shift after it was sent.
    await page.evaluate(() => {
      const e = S.entries.find((x) => x.name === 'Ada Leader' && excKey(x.date) === '2026-10-28');
      e.ukS = '08:00'; e.ukE = '16:30';
      S.entriesVer = (S.entriesVer || 0) + 1;
      renderScheduleWindow();
    });
    await expect(page.locator('#swinChanged')).toContainText('1 day changed since');
    await expect(page.locator('#swinChanged')).toContainText('Wed 28 Oct: 12:30–21:00 → 10:00–18:30');
    await expect(row(page, '2026-10-28')).toHaveClass(/chg/);

    // The sent log is a synced local store (inside the NorthStar closure), so it follows the account.
    const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'northstar', 'northstar.js.html'), 'utf8');
    expect(core).toMatch(/const SYNC_LOCAL_KEYS=\[[^\]]*"sc_swin_sent"/);
  });

  test('Save PNG downloads the schedule as an image', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'rendering path is the same on phones');
    await loadRoster(page);
    await openWindow(page, 'Ben Rows');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#swinPng').click()]);
    expect(download.suggestedFilename()).toMatch(/Ben_Rows_schedule_2026-10-23_to_2026-10-31_\d{8}\.png$/);
    const file = await download.path();
    const head = fs.readFileSync(file).subarray(0, 8);
    expect(head.toString('hex')).toBe('89504e470d0a1a0a');
    await expect(page.locator('#swinSentLine')).toContainText('Last sent');
    expect(page.__jsErrors).toEqual([]);
  });

  test('Team PNGs zips one schedule per agent and records each send', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'rendering path is the same on phones');
    await loadRoster(page);
    await page.evaluate(() => {
      S.people['Cara Follows'] = { name: 'Cara Follows', role: 'agent', teamLeader: 'Ada Leader', team: '' };
      S.people['Dan Follows'] = { name: 'Dan Follows', role: 'agent', teamLeader: 'Ada Leader', team: '' };
    });
    await openWindow(page, 'Cara Follows');
    await expect(page.locator('#swinZip')).toHaveText('Team PNGs (2)');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#swinZip').click()]);
    expect(download.suggestedFilename()).toMatch(/Ada_Leader_team_schedules_2026-10-23_to_2026-10-31_\d{8}\.zip$/);
    expect(fs.readFileSync(await download.path()).subarray(0, 2).toString()).toBe('PK');
    await expect.poll(() => page.evaluate(() => [_swinSentFor('Cara Follows'), _swinSentFor('Dan Follows')].map((s) => !!(s && s.channel === 'zip')))).toEqual([true, true]);
  });

  test('opens from the command palette and the Day view; Escape closes it and arrows stay inside', async ({ page }) => {
    await loadRoster(page);
    await page.evaluate(() => openCommandPalette());
    await page.keyboard.type('Schedule: Ben');
    await page.keyboard.press('Enter');
    await expect(page.locator('#swinTitle')).toHaveText('Ben Rows');

    const month = await page.evaluate(() => S.month);
    await page.locator('#swinClose').focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.evaluate(() => S.month)).toBe(month);
    await page.keyboard.press('Escape');
    await expect(page.locator('#swinOverlay')).toHaveCount(0);

    await page.evaluate(() => { S.calSubTab = 'day'; S.calDay = new Date(2026, 9, 23); setTab('calendar'); });
    await page.locator('.swin-open-btn').first().click();
    await expect(page.locator('#swinOverlay')).toBeVisible();
    await expect(page.locator('.swin-nav b')).toHaveText('October 2026');
    expect(page.__jsErrors).toEqual([]);
  });

  test('names are escaped everywhere the window writes them', async ({ page }) => {
    await loadRoster(page);
    const evil = '<img src=x onerror="window.__pwned=1">\'";alert(1)//';
    await page.evaluate((n) => {
      S.people[n] = { name: n, role: 'agent', teamLeader: 'Ada Leader', team: '' };
      openScheduleWindow(n);
      swinSet('cmp', 'Ada Leader');
    }, evil);
    await expect(page.locator('#swinTitle')).toHaveText(evil);
    await page.locator('#swinPerson').selectOption('Ben Rows');
    await expect(page.locator('#swinTitle')).toHaveText('Ben Rows');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(page.__jsErrors).toEqual([]);
  });
});
