const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { assemble, partsFor, serverOf, leaks, ENVS, TARGETS } = require('../build/build');
const { openApp, PROFILE } = require('./helpers');

// Live and dev are the same app built twice (build/build.js --env): they differ only in the env/
// parts, which pick the Supabase server and the sign-in methods. The dev build must never be able
// to reach the live server, run on the live address, or look like live.

const LIVE_HOST = serverOf('live');
const DEV_HOST = serverOf('dev');
const devHtml = () => assemble('dev').html;

/** Serves the dev build at / for this page, then opens it like any other test does. */
async function openDevApp(page, config) {
  const html = devHtml();
  await page.route((url) => url.pathname === '/', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  return openApp(page, config);
}

test.describe('Environments', () => {
  test('the dev build differs from live only in its env parts, and each stays on its own server', () => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'build-only check');
    expect(ENVS).toEqual(['live', 'dev']);
    expect(LIVE_HOST).not.toBe(DEV_HOST);
    const changed = partsFor('live').map((p, i) => [p, partsFor('dev')[i]]).filter(([a, b]) => a !== b);
    expect(changed).toEqual([['env/live/csp.html', 'env/dev/csp.html'], ['env/live/env.js', 'env/dev/env.js']]);

    const live = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const dev = devHtml();
    expect(live).toBe(assemble('live').html);
    expect(leaks('live', live)).toEqual([]);
    expect(leaks('dev', dev)).toEqual([]);
    expect(live).not.toContain(DEV_HOST);
    expect(dev).not.toContain(LIVE_HOST);
    // The page's own CSP only lets it talk to its server.
    const csp = (html) => /connect-src ([^;]+);/.exec(html)[1];
    expect(csp(live)).toBe(`'self' https://${LIVE_HOST}`);
    expect(csp(dev)).toBe(`'self' https://${DEV_HOST}`);
    // A leak is caught: live code naming the dev server would fail the build.
    expect(leaks('live', live + DEV_HOST)).toEqual([`the live build mentions the dev server (${DEV_HOST})`]);
  });

  test('Sync Me (me.html) is built the same way: env parts only, its own server, and small', () => {
    test.skip(test.info().project.name !== 'desktop-chromium', 'build-only check');
    expect(Object.keys(TARGETS)).toEqual(['index', 'me']);
    const changed = partsFor('live', 'me').map((p, i) => [p, partsFor('dev', 'me')[i]]).filter(([a, b]) => a !== b);
    expect(changed).toEqual([['env/live/csp.html', 'env/dev/csp.html'], ['env/live/env.js', 'env/dev/env.js']]);
    const live = fs.readFileSync(path.join(__dirname, '..', 'me.html'), 'utf8');
    const dev = assemble('dev', 'me').html;
    expect(live).toBe(assemble('live', 'me').html);
    expect([leaks('live', live), leaks('dev', dev)]).toEqual([[], []]);
    expect(dev).not.toContain(LIVE_HOST);
    // None of the spreadsheet, image or export engines: a phone page (plan target: under 400 KB).
    expect(partsFor('live', 'me').filter((p) => /xlsx|exceljs|html2canvas|jszip|packbuilder/.test(p))).toEqual([]);
    expect(Buffer.byteLength(live)).toBeLessThan(400 * 1024);
  });

  test('the live build offers Google only and carries no dev marker', async ({ page }) => {
    await openApp(page);
    expect(await page.evaluate(() => [SYNC_ENV.name, SYNC_ENV.supabaseUrl, SYNC_ENV.auth])).toEqual(['live', `https://${LIVE_HOST}`, ['google']]);
    await expect(page.locator('#syncLcWidget button[data-auth]')).toHaveCount(1);
    await expect(page.locator('#syncLcGoogleBtn')).toContainText('Continue with Google');
    await expect(page.locator('#syncEnvBadge')).toHaveCount(0);
    expect(await page.title()).toBe('Sync');
    expect(page.__jsErrors).toEqual([]);
  });

  test('the dev build is marked, talks to sync-dev, and signs in with email and password', async ({ page }) => {
    await openDevApp(page, { profile: PROFILE, passwords: { 'sel@example.com': 'correct horse' } });
    expect(await page.evaluate(() => [SYNC_ENV.name, SYNC_SUPABASE_URL])).toEqual(['dev', `https://${DEV_HOST}`]);
    await expect(page.locator('#syncEnvBadge')).toHaveText('DEV · sync-dev');
    expect(await page.title()).toBe('DEV · Sync');

    const widget = page.locator('#syncLcWidget');
    await expect(widget).toContainText('Sign in to sync across devices');
    await expect(widget).not.toContainText('Google');
    await widget.getByRole('button', { name: 'Sign in with email' }).click();
    const modal = page.locator('#syncEmailModal');
    await expect(modal).toContainText('On the dev server');

    // A wrong password says so and keeps the form.
    await page.locator('#syncEmailAddr').fill('sel@example.com');
    await page.locator('#syncEmailPass').fill('wrong');
    await page.locator('#syncEmailPass').press('Enter');
    await expect(page.locator('#syncEmailMsg')).toHaveText('Invalid login credentials');
    await expect(page.locator('#syncEmailInBtn')).toBeEnabled();

    await page.locator('#syncEmailPass').fill('correct horse');
    await page.locator('#syncEmailInBtn').click();
    await expect(modal).toHaveCount(0);
    // Greets by the signed-in address, as it does after Google.
    await expect(widget).toContainText('Hi sel');
    expect(await page.evaluate(() => window.__fakeSupabase.passwordCalls())).toEqual([{ kind: 'in', email: 'sel@example.com' }, { kind: 'in', email: 'sel@example.com' }]);
    expect(await page.evaluate(() => window.__fakeSupabase.oauthCalls())).toBe(0);
    expect(page.__jsErrors).toEqual([]);
  });

  test('creating a dev account signs straight in, or asks for the confirmation email first', async ({ page }) => {
    await openDevApp(page, { profile: PROFILE, confirmSignUp: true });
    await page.getByRole('button', { name: 'Sign in with email' }).first().click();
    await page.locator('#syncEmailAddr').fill('new@example.com');
    await page.locator('#syncEmailPass').fill('a new password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#syncEmailMsg')).toHaveText('Check new@example.com for a confirmation link, then sign in here.');

    // With "Confirm email" off (how sync-dev is meant to run), sign-up is the sign-in.
    await page.evaluate(() => { window.__fakeSupabase.state.cfg.confirmSignUp = false; });
    await page.locator('#syncEmailAddr').fill('other@example.com');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#syncEmailModal')).toHaveCount(0);
    await expect(page.locator('#syncLcWidget')).toContainText('Hi other');
    expect(page.__jsErrors).toEqual([]);
  });

  test('the dev build refuses to run on the live address', async ({ page }) => {
    const html = devHtml();
    await page.route('https://sync.theguide.club/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    // window.stop() aborts the page, so neither load nor DOMContentLoaded ever fires.
    await page.goto('https://sync.theguide.club/', { waitUntil: 'commit' });
    await expect(page.locator('body')).toHaveText('This is the dev build of Sync. It does not run on the live address.');
    // Nothing after the guard ran: no client, no NorthStar, nothing written to the live origin.
    expect(await page.evaluate(() => [typeof window.sb, typeof window.nsCanonical, localStorage.length])).toEqual(['undefined', 'undefined', 0]);
    expect(errors).toEqual(['Sync dev build refused to start on the live address']);
  });
});
