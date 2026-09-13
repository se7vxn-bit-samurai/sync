'use strict';
/**
 * Parser selection regression suite.
 *
 * Every fixture is run through the real autoParse() and compared against
 * tests/fixtures/expected.json. The point of this suite is that parser
 * *selection* is the thing that has silently failed in the past: the engines
 * extracted every row correctly and then lost the scoring vote, so asserting
 * "we got some entries" is not enough. We assert the winning parser, the people
 * count, the entry count, the confidence band and the month span.
 *
 *   node tests/parser.test.js            run the suite
 *   node tests/parser.test.js --update   rewrite expected.json from live output
 */

const fs = require('fs');
const path = require('path');
const H = require('./lib/harness');

const UPDATE = process.argv.includes('--update');
const FIELDS = ['parser', 'people', 'entries', 'confidence', 'months'];

function compare(name, want, got) {
  const failures = [];
  for (const f of FIELDS) {
    if (want[f] === undefined) continue;
    const a = JSON.stringify(want[f]);
    const b = JSON.stringify(got[f]);
    if (a !== b) failures.push(`  ${f}: expected ${a}, got ${b}`);
  }
  if (want.minWarnings !== undefined && got.warnings.length < want.minWarnings) {
    failures.push(`  warnings: expected >= ${want.minWarnings}, got ${got.warnings.length}`);
  }
  return failures;
}

(async () => {
  const browser = await H.launch();
  const { page } = await H.openApp(browser);

  const expected = UPDATE ? {} : H.loadExpected();
  const names = UPDATE
    ? fs.readdirSync(H.FIXTURE_DIR)
        .filter(f => /\.(csv|xlsx)$/.test(f))
        .map(f => f.replace(/\.(csv|xlsx)$/, ''))
        .sort()
    : Object.keys(expected).sort();

  const results = {};
  let pass = 0;
  const failed = [];

  for (const name of names) {
    const got = await H.parseFixture(page, name);
    results[name] = {
      parser: got.parser,
      people: got.people,
      entries: got.entries,
      confidence: got.confidence,
      months: got.months
    };

    if (UPDATE) {
      console.log(`  captured ${name.padEnd(12)} ${got.parser}/${got.people}p/${got.entries}e/${got.confidence}`);
      continue;
    }

    const failures = compare(name, expected[name], got);
    if (failures.length) {
      failed.push(name);
      console.log(`FAIL ${name}`);
      failures.forEach(f => console.log(f));
    } else {
      pass++;
      console.log(`ok   ${name.padEnd(12)} ${got.parser}/${got.people}p/${got.entries}e/${got.confidence}`);
    }
  }

  // The lossy-parse guard is a backstop: with scoring correct, no fixture
  // reaches it. Force the condition by making affinity favour the parser that
  // reads one person, and assert the guard refuses to call that result trusted.
  if (!UPDATE) {
    await page.evaluate(csv => { window.__guardCsv = csv; },
      fs.readFileSync(H.fixturePath('r_80x31'), 'utf8'));
    const guard = await page.evaluate(() => {
      const realAffinity = _parserAffinity;
      // Keep rivals above autoParse's affinity>=8 eligibility filter, or they
      // never run and there is nothing for the guard to compare against.
      _parserAffinity = (parser, f) => parser === 'parsePerson' ? 30 : 8;
      try {
        S.parseInfo = [];
        const wb = XLSX.read(new Uint8Array(new TextEncoder().encode(window.__guardCsv).buffer),
          XLSX_STANDARD_READ_OPTS);
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],
          { header: 1, defval: '' });
        const entries = autoParse(grid, 'guard') || [];
        const info = S.parseInfo[0] || {};
        return {
          parser: info.parser,
          confidence: info.confidence,
          warnings: info.warnings || [],
          people: new Set(entries.map(e => e.name).filter(Boolean)).size
        };
      } finally { _parserAffinity = realAffinity; }
    });

    const guardOk = guard.parser === 'parsePerson' &&
      guard.people === 1 &&
      guard.confidence === 'low' &&
      guard.warnings.some(w => /most of the roster may be missing/.test(w));
    if (guardOk) {
      pass++;
      console.log('ok   [guard]      lossy parse forced to low confidence + warned');
    } else {
      failed.push('[guard]');
      console.log('FAIL [guard] lossy-parse guard did not fire');
      console.log('  got ' + JSON.stringify(guard));
    }
    names.push('[guard]');
  }

  await browser.close();

  if (UPDATE) {
    fs.writeFileSync(path.join(H.FIXTURE_DIR, 'expected.json'),
      JSON.stringify(results, null, 2) + '\n');
    console.log(`\nWrote expected.json with ${names.length} fixtures.`);
    return;
  }

  console.log(`\n${pass}/${names.length} passed`);
  if (failed.length) {
    console.log('failed: ' + failed.join(', '));
    process.exitCode = 1;
  }
})().catch(e => { console.error(e); process.exit(1); });
