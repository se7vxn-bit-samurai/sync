const { test, expect } = require('@playwright/test');
const { addUser, rpcFromClient } = require('./fixtures/pg');
const { seedClaims } = require('./fixtures/org-seed');
const { installFakeSupabase } = require('./fixtures/fake-supabase');
const { assemble } = require('../build/build');

// Sync Me (me.html) in the browser, its sb.rpc calls answered by the real migrations in PGlite as
// the signed-in agent. Ada publishes her team's late October; the UK clocks go back on the 25th,
// so SA is UK +1 before and UK +2 after.

async function publishAdaRota(db, orgId, id, users) {
  const shift = (person_id, date, start, end, code) => ({ person_id, date, status: 'shift', start_local: start, end_local: end, code });
  const rows = [
    shift(id.zan, '2026-10-23', '09:00', '17:30', 'Early'),
    shift(id.zan, '2026-10-24', '09:00', '17:30', 'Early'),
    { person_id: id.zan, date: '2026-10-25', status: 'off', code: 'OFF' },
    shift(id.zan, '2026-10-26', '09:00', '17:30', 'Early'),
    { person_id: id.zan, date: '2026-10-27', status: 'leave', leave_type: 'annual' },
  ];
  const out = await rpcFromClient(db, users.ada, 'sync_publish_schedule', { p_org: orgId, p_from: '2026-10-01', p_to: '2026-10-31', p_people: [id.zan], p_rows: rows, p_dry_run: false });
  if (out.error) throw new Error(out.error.message);
}

/** Opens me.html (or the given build's HTML) signed in as `user`, with the phone's clock at `now`. */
async function openMe(page, db, { user, now = '2026-10-23T07:00:00Z', html = null, net = { offline: false } } = {}) {
  await page.clock.setFixedTime(new Date(now));
  await page.exposeFunction('__orgRpc', async (fn, args, who) => {
    if (net.offline) throw new Error('Failed to fetch');
    return rpcFromClient(db, who, fn, args);
  });
  await page.addInitScript(({ src, cfg }) => { new Function('config', `(${src})(config)`)(cfg); }, { src: installFakeSupabase.toString(), cfg: user ? { signedIn: true, user } : {} });
  if (html) await page.route((u) => u.pathname === '/me.html', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.__jsErrors = errors;
  await page.goto('/me.html');
}
const day = (page, iso) => page.locator(`.me-day[data-date="${iso}"]`);

test.describe('Sync Me', () => {
  test('an agent sees today on SA time first, who leads them, and their published month', async ({ page }) => {
    const { db, orgId, id, users } = await seedClaims();
    await publishAdaRota(db, orgId, id, users);
    await openMe(page, db, { user: { id: users.zan, email: 'zan@claims.test' } });

    const today = page.locator('#meToday');
    await expect(today).toContainText('Today · Fri 23 Oct');
    // 09:00–17:30 in London in summer time is 10:00–18:30 in Johannesburg.
    await expect(today.locator('.me-today-main')).toHaveText('10:00–18:30SA');
    await expect(today).toContainText('09:00–17:30 UK');
    await expect(today).toContainText('Starts in 1h 00m');
    await expect(today).toContainText('Team leader: Ada Leader');
    await expect(page.locator('.me-brand span')).toHaveText('Zanele Dube · Acme BPO');

    // After the clocks go back, the same UK shift is two hours ahead in SA.
    await expect(page.locator('#meMonthLabel')).toHaveText('Oct 2026');
    await expect(day(page, '2026-10-26').locator('.t')).toHaveText('11:00–19:30');
    await expect(day(page, '2026-10-25').locator('.t')).toHaveText('Off');
    await expect(day(page, '2026-10-27').locator('.t')).toHaveText('Annual leave');
    // A day with nothing published says so; it never looks like a shift.
    await expect(day(page, '2026-10-28')).toHaveClass(/none/);
    await expect(day(page, '2026-10-28').locator('.t')).toHaveText('No published shift');
    await expect(page.locator('#meNextOff')).toHaveText('Next day off: Sun 25 Oct');
    // The month opens at today; the 22 days already gone are one tap away.
    await expect(day(page, '2026-10-22')).toHaveCount(0);
    await expect(page.locator('.me-days .me-day').first()).toHaveClass(/today/);
    await page.getByRole('button', { name: 'Show 22 earlier days' }).click();
    await expect(day(page, '2026-10-01').locator('.t')).toHaveText('No published shift');
    await expect(page.locator('#meMonth .me-fresh')).toContainText('· Ada Leader');

    // The UK clock is one tap away, and remembered.
    await page.getByRole('button', { name: 'UK', exact: true }).click();
    await expect(day(page, '2026-10-26').locator('.t')).toHaveText('09:00–17:30');
    await expect(page.locator('#meToday .me-today-main')).toHaveText('09:00–17:30UK');
    expect(await page.evaluate(() => localStorage.getItem('sc_me_clock'))).toBe('uk');

    // Next month has nothing published yet.
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.locator('#meMonthLabel')).toHaveText('Nov 2026');
    await expect(page.locator('#meMonth .me-fresh')).toHaveText('Nothing published for this month yet.');
    await expect(day(page, '2026-11-02').locator('.t')).toHaveText('No published shift');
    expect(page.__jsErrors).toEqual([]);
  });

  test('acting cover shows who is leading today, and an unknown account sees nothing', async ({ page, browser }) => {
    const { db, orgId, id, users } = await seedClaims();
    await publishAdaRota(db, orgId, id, users);
    await rpcFromClient(db, users.ada, 'org_save_acting', { p_org: orgId, p_id: null, p_person: id.zan, p_for: id.ada, p_starts: '2026-10-20', p_ends: '2026-10-30', p_role: 'Acting Team Lead', p_label: null, p_status: 'active', p_version: null });
    await openMe(page, db, { user: { id: users.ben, email: 'ben@claims.test' } });
    await expect(page.locator('#meToday .me-leader')).toHaveText('Acting Team Lead: Zanele Dube, covering for Ada Leader until Fri 30 Oct');
    await expect(page.locator('#meToday')).toContainText('Nothing published for today');

    const other = await browser.newPage();
    const stranger = await addUser(db, 'stranger@else.test');
    await openMe(other, db, { user: { id: stranger, email: 'stranger@else.test' } });
    await expect(other.locator('#meNoOrg')).toContainText("that email isn't on anyone's record");
    await expect(other.locator('#meToday')).toHaveCount(0);
    await other.close();
  });

  test('offline, the last schedule stays readable and says how old it is', async ({ page }) => {
    const { db, orgId, id, users } = await seedClaims();
    await publishAdaRota(db, orgId, id, users);
    const net = { offline: false };
    await openMe(page, db, { user: { id: users.zan, email: 'zan@claims.test' }, net });
    await expect(day(page, '2026-10-26').locator('.t')).toHaveText('11:00–19:30');
    net.offline = true;
    await page.reload();
    await expect(page.locator('#meMonth .me-fresh')).toContainText('Offline · showing what was saved');
    await expect(day(page, '2026-10-26').locator('.t')).toHaveText('11:00–19:30');
    // Signing out forgets it.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sc_me_cache'))).toBeNull();
  });

  test('the dev build of Sync Me is marked and signs in with email and password', async ({ page }) => {
    const { db, orgId, id, users } = await seedClaims();
    await publishAdaRota(db, orgId, id, users);
    await openMe(page, db, { html: assemble('dev', 'me').html });
    await expect(page.locator('#syncEnvBadge')).toHaveText('DEV · sync-dev');
    expect(await page.title()).toBe('DEV · Sync Me');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await page.evaluate((uid) => { window.__fakeSupabase.state.cfg.user = { id: uid, email: 'zan@claims.test' }; window.__fakeSupabase.state.cfg.passwords['zan@claims.test'] = 'pw-123456'; }, users.zan);
    await page.locator('#meEmail').fill('zan@claims.test');
    await page.locator('#mePass').fill('pw-123456');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('#meToday .me-today-main')).toHaveText('10:00–18:30SA');
    expect(page.__jsErrors).toEqual([]);
  });
});
