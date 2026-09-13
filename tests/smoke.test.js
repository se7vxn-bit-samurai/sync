'use strict';
/**
 * End-to-end smoke suite.
 *
 * Covers the things that must never regress while the parser and persistence
 * work happens: a clean boot, every rail destination rendering, hostile names
 * being refused, no horizontal overflow at three viewports, and whether a
 * loaded schedule survives a reload.
 *
 * Behaviours that are expected to change during this work live in
 * tests/fixtures/smoke-expected.json rather than being hard-coded, so the suite
 * is green before the change and green after it, and the diff to that file is
 * the record of what deliberately changed.
 *
 *   node tests/smoke.test.js
 *   node tests/smoke.test.js --update
 */

const fs = require('fs');
const path = require('path');
const H = require('./lib/harness');

const UPDATE = process.argv.includes('--update');
const EXPECT_PATH = path.join(H.FIXTURE_DIR, 'smoke-expected.json');

// Every destination in the left rail, as (label, onclick) pairs.
const RAIL = [
  ['Home', 'railNavDashboard()'],
  ['Calendar/Dashboard', "railNavCalendar('day')"],
  ['Calendar/Cards', "railNavCalendar('cards')"],
  ['Calendar/Coaching', "railNavCalendar('coaching')"],
  ['Calendar/Overtime', "railNavCalendar('overtime')"],
  ['Calendar/Planner', "railNavCalendar('planner')"],
  ['People/Dashboard', "railNavPeople('dashboard')"],
  ['People/Team', "railNavPeople('team')"],
  ['People/Agents', "railNavPeople('agents')"],
  ['People/Logbook', "railNavPeople('logbook')"],
  ['People/Events', "railNavPeople('events')"],
  ['Ops/Dashboard', "railNavAnalytics('dashboard')"],
  ['Ops/Workspace', "railNavOps('overview')"],
  ['Ops/ScheduleWindow', "railNavOps('schedule')"],
  ['Ops/Coverage', "railNavAnalytics('coverage')"],
  ['Ops/Blueprint', "railNavAnalytics('blueprint')"],
  ['Ops/People&Org', "railNavOps('organisation')"],
  ['Ops/Absence', "railNavAnalytics('absence')"],
  ['Ops/Alerts', "railNavAnalytics('alerts')"],
  ['Ops/Data', "railNavAnalytics('data')"],
  ['Ops/ExportCentre', "railNavOps('exports')"],
  ['Ops/Decisions', "railNavOps('decisions')"],
  ['Ops/Handoff', "railNavOps('handoff')"]
];

const checks = [];
const record = {};
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (detail ? '   ' + detail : ''));
}

(async () => {
  const browser = await H.launch();
  const expected = UPDATE ? {} : JSON.parse(fs.readFileSync(EXPECT_PATH, 'utf8'));

  // ---- 1. clean boot ----
  {
    const { page, errors } = await H.openApp(browser);
    await page.waitForTimeout(3000);
    check('boot: no console errors or exceptions', errors.length === 0,
      errors.length ? errors.slice(0, 3).join(' | ') : '');
    const landing = await page.evaluate(() =>
      getComputedStyle(document.getElementById('us')).display);
    check('boot: landing card shown with no data', landing !== 'none', landing);
    await page.context().close();
  }

  // ---- 2. import + every rail destination renders ----
  {
    const { page, errors } = await H.openApp(browser);
    await H.loadFixtureThroughUI(page, 'roster_iso');
    const loaded = await page.evaluate(() => ({
      entries: S.entries.length,
      people: new Set(S.entries.map(e => e.name)).size
    }));
    check('import: roster_iso loads via the UI',
      loaded.entries === 360 && loaded.people === 12,
      `${loaded.people}p/${loaded.entries}e`);

    const thin = [];
    for (const [label, call] of RAIL) {
      const before = errors.length;
      await page.evaluate(c => { try { eval(c); } catch (e) {} }, call);
      await page.waitForTimeout(450);
      const len = await page.evaluate(() =>
        (document.getElementById('mv')?.innerText || '').length);
      if (len < 600 || errors.length > before) thin.push(`${label}(${len}ch)`);
    }
    check(`nav: all ${RAIL.length} rail destinations render without errors`,
      thin.length === 0, thin.join(' '));
    check('nav: no errors accumulated during sweep', errors.length === 0,
      errors.slice(0, 2).join(' | '));
    await page.context().close();
  }

  // ---- 3. hostile person names are refused, never executed ----
  {
    const { page } = await H.openApp(browser);
    await H.loadFixtureThroughUI(page, 'roster_xss');
    for (const [, call] of RAIL.slice(0, 12)) {
      await page.evaluate(c => { try { eval(c); } catch (e) {} }, call);
      await page.waitForTimeout(150);
    }
    const r = await page.evaluate(() => ({
      executed: !!window.__XSS || !!window.__XSS2,
      names: [...new Set(S.entries.map(e => e.name))]
    }));
    check('xss: injected handlers never execute', r.executed === false);
    check('xss: script-bearing names are not admitted',
      !r.names.some(n => /[<>]/.test(n)), r.names.join(' | '));
    await page.context().close();
  }

  // ---- 4. responsive: no horizontal overflow ----
  for (const [label, vp, mobile] of [
    ['390', { width: 390, height: 844 }, true],
    ['820', { width: 820, height: 1180 }, false],
    ['1440', { width: 1440, height: 900 }, false]
  ]) {
    const { page } = await H.openApp(browser, { viewport: vp, isMobile: mobile, hasTouch: mobile });
    await H.loadFixtureThroughUI(page, 'roster_iso');
    await page.evaluate(() => { try { railNavCalendar('cards'); } catch (e) {} });
    await page.waitForTimeout(700);
    const over = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth);
    check(`responsive: no horizontal scroll at ${label}px`, over <= 2, `overflow ${over}px`);
    await page.context().close();
  }

  // ---- 4b. the analytics Worker still builds from function source ----
  // _buildAnalyticsWorkerSource() stringifies computeFlags,
  // computeTeamHealthScore and _signalRankMeta into a Blob Worker. Any build
  // step that renames or wraps those breaks it at runtime with no build error,
  // which is why the build is a plain concatenation. Assert the source is
  // still reachable and intact.
  {
    const { page } = await H.openApp(browser);
    const w = await page.evaluate(() => {
      if (typeof _buildAnalyticsWorkerSource !== 'function') return { built: false };
      const src = _buildAnalyticsWorkerSource();
      return {
        built: true,
        length: src.length,
        hasFlags: /function computeFlags\s*\(/.test(src),
        hasHealth: /function computeTeamHealthScore\s*\(/.test(src),
        hasRank: /function _signalRankMeta\s*\(/.test(src),
        native: /\[native code\]/.test(src)
      };
    });
    check('worker: analytics worker source builds with all three functions intact',
      w.built && w.hasFlags && w.hasHealth && w.hasRank && !w.native,
      JSON.stringify(w));
    await page.context().close();
  }

  // ---- 4c. absence surfaces the absences that are already in the roster ----
  // The parser classifies SICK / LEAVE / TRAINING off-days straight from the
  // schedule. rAbsenceBreakdown used to read only manually logged exceptions, so
  // a roster full of sick days reported "0 events". Assert the derived events
  // reach the view, or that regression returns silently.
  {
    const { page } = await H.openApp(browser);
    await H.loadFixtureThroughUI(page, 'r_80x31');
    await page.waitForTimeout(1200);
    const a = await page.evaluate(() => {
      const inRoster = (S.entries || []).filter(e =>
        e.isOff && /^(SICK|LEAVE|TRAINING)$/.test(String(e.offL || ''))).length;
      try { railNavAnalytics('absence'); } catch (e) {}
      return { inRoster };
    });
    await page.waitForTimeout(900);
    const shown = await page.evaluate(() => {
      const txt = document.getElementById('ca')?.innerText || '';
      const m = txt.match(/·\s*([\d,]+)\s+events/);
      return { events: m ? parseInt(m[1].replace(/,/g, ''), 10) : null, txt: txt.slice(0, 120) };
    });
    check('absence: roster absences reach the Absence view',
      a.inRoster > 0 && shown.events !== null && shown.events > 0,
      `${a.inRoster} SICK/LEAVE in roster, view reports ${shown.events} events`);
    await page.context().close();
  }

  // ---- 5. does a loaded schedule survive a reload? ----
  {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    await page.goto(H.APP_URL, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.autoParse === 'function', null, { timeout: 30000 });
    await H.loadFixtureThroughUI(page, 'roster_iso');
    // The schedule is written to IndexedDB on a short debounce, so give it a
    // moment to land before reloading — otherwise this measures the race, not
    // the feature.
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => S.entries.length);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(6000);
    const after = await page.evaluate(() => ({
      entries: (typeof S !== 'undefined' && S.entries) ? S.entries.length : 0,
      landing: getComputedStyle(document.getElementById('us')).display
    }));
    const resumes = after.entries > 0 && after.landing === 'none';
    record.resumesAfterReload = resumes;
    if (!UPDATE) {
      check('persistence: schedule survives a reload',
        resumes === expected.resumesAfterReload,
        `before ${before}e, after ${after.entries}e (expected resume=${expected.resumesAfterReload})`);
    } else {
      console.log(`  captured resumesAfterReload = ${resumes} (before ${before}e, after ${after.entries}e)`);
    }
    await context.close();
  }

  await browser.close();

  if (UPDATE) {
    fs.writeFileSync(EXPECT_PATH, JSON.stringify(record, null, 2) + '\n');
    console.log('\nWrote smoke-expected.json');
    return;
  }

  const failed = checks.filter(c => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length) process.exitCode = 1;
})().catch(e => { console.error(e); process.exit(1); });
