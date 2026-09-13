'use strict';
/**
 * Shared Playwright harness for the Sync test suites.
 *
 * The app is a single self-contained index.html, so every suite drives the real
 * file over file:// in headless Chromium. There is no build step and no server.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const APP_URL = 'file://' + path.join(REPO_ROOT, 'index.html');
const FIXTURE_DIR = path.join(REPO_ROOT, 'tests', 'fixtures');

// Playwright and Chromium both come from the image rather than node_modules.
const PLAYWRIGHT = process.env.SYNC_PLAYWRIGHT ||
  '/opt/node22/lib/node_modules/playwright';
const CHROMIUM = process.env.SYNC_CHROMIUM ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function chromium() {
  return require(PLAYWRIGHT).chromium;
}

async function launch() {
  // This image ships Chromium at a fixed path; CI installs it into Playwright's
  // own cache, where Playwright finds it unaided. Only pin the path if it is
  // actually there.
  const opts = { args: ['--no-sandbox'] };
  if (fs.existsSync(CHROMIUM)) opts.executablePath = CHROMIUM;
  return chromium().launch(opts);
}

/**
 * Open the app and collect every console error / uncaught exception.
 * Returns { page, errors } — errors is live, so read it after the actions.
 */
async function openApp(browser, opts) {
  const o = opts || {};
  const context = await browser.newContext({
    viewport: o.viewport || { width: 1600, height: 1000 },
    isMobile: !!o.isMobile,
    hasTouch: !!o.hasTouch
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 300)));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 300));
  });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.autoParse === 'function',
    null, { timeout: 30000 });
  return { page, errors };
}

function fixturePath(name) {
  for (const ext of ['.csv', '.xlsx']) {
    const p = path.join(FIXTURE_DIR, name + ext);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No fixture named ' + name);
}

function isXlsx(name) {
  return fixturePath(name).endsWith('.xlsx');
}

/**
 * Read a fixture into the page and run the real autoParse() over sheet 1,
 * returning the parse decision exactly as the app recorded it in S.parseInfo.
 *
 * This deliberately goes through autoParse rather than the UI so the assertion
 * is about parser selection, not about the preview modal.
 */
async function parseFixture(page, name) {
  const p = fixturePath(name);
  const xlsx = isXlsx(name);
  const payload = xlsx
    ? Array.from(fs.readFileSync(p))
    : fs.readFileSync(p, 'utf8');

  const filename = path.basename(p);

  return page.evaluate(({ payload, xlsx, filename }) => {
    S.parseInfo = [];
    const bytes = xlsx
      ? new Uint8Array(payload)
      : new Uint8Array(new TextEncoder().encode(payload).buffer);
    // Go through the app's own option selection so the CSV/xlsx date handling
    // under test is the same code the import path uses.
    const opts = typeof _readOptsForFile === 'function'
      ? _readOptsForFile({ name: filename })
      : XLSX_STANDARD_READ_OPTS;
    const wb = XLSX.read(bytes, opts);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    const entries = autoParse(grid, wb.SheetNames[0]) || [];
    const info = S.parseInfo[0] || {};
    const months = [...new Set(entries
      .map(e => e.date && new Date(e.date))
      .filter(d => d && !isNaN(d))
      .map(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
    )].sort();

    return {
      parser: info.parser || 'none',
      people: new Set(entries.map(e => e.name).filter(Boolean)).size,
      entries: entries.length,
      confidence: info.confidence || 'none',
      warnings: info.warnings || [],
      months
    };
  }, { payload, xlsx, filename });
}

/** Drive a fixture through the real UI: file input -> preview -> Load. */
async function loadFixtureThroughUI(page, name) {
  await page.setInputFiles('#fi', fixturePath(name));
  await page.waitForSelector('#parsePreviewOverlay button:has-text("Load")',
    { timeout: 120000 });
  await page.click('#parsePreviewOverlay button:has-text("Load")');
  await page.waitForFunction(
    () => typeof S !== 'undefined' && S.entries && S.entries.length > 0,
    null, { timeout: 120000 });
}

function loadExpected() {
  return JSON.parse(fs.readFileSync(
    path.join(FIXTURE_DIR, 'expected.json'), 'utf8'));
}

module.exports = {
  REPO_ROOT, APP_URL, FIXTURE_DIR,
  launch, openApp, fixturePath, isXlsx,
  parseFixture, loadFixtureThroughUI, loadExpected
};
