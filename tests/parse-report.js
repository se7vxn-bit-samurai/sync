'use strict';
/**
 * Parser scorecard for one roster file.
 *
 *   node tests/parse-report.js path/to/roster.xlsx [--sheet 2] [--grid 12]
 *
 * Runs every parse engine against the file and prints what each one extracted
 * and how it scored, then the decision autoParse() actually made. Use this when
 * a roster imports wrongly or not at all: it shows whether the right engine
 * produced the right rows and merely lost the vote (a scoring problem), or
 * whether no engine understood the layout at all (a parser problem).
 *
 * See docs/PARSERS.md for how to act on the output.
 */

const fs = require('fs');
const path = require('path');
const H = require('./lib/harness');

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('-'));
const flag = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const sheetArg = parseInt(flag('sheet', '1'), 10);
const gridRows = parseInt(flag('grid', '0'), 10);

if (!target) {
  console.error('usage: node tests/parse-report.js <file.xlsx|file.csv> [--sheet N] [--grid N]');
  process.exit(2);
}
if (!fs.existsSync(target)) {
  console.error('No such file: ' + target);
  process.exit(2);
}

const ENGINES = ['parseWideHoriz', 'parseHoriz', 'parseVert', 'parseBlocks', 'parsePerson'];

(async () => {
  const browser = await H.launch();
  const { page } = await H.openApp(browser);

  const xlsx = /\.xlsx?$/i.test(target);
  const payload = xlsx
    ? Array.from(fs.readFileSync(target))
    : fs.readFileSync(target, 'utf8');

  await page.evaluate(n => { window.__reportFilename = n; }, path.basename(target));

  const out = await page.evaluate(({ payload, xlsx, engines, sheetArg, gridRows }) => {
    S.parseInfo = [];
    const bytes = xlsx
      ? new Uint8Array(payload)
      : new Uint8Array(new TextEncoder().encode(payload).buffer);
    const opts = typeof _readOptsForFile === 'function'
      ? _readOptsForFile({ name: window.__reportFilename })
      : XLSX_STANDARD_READ_OPTS;
    const wb = XLSX.read(bytes, opts);
    const sheetNames = wb.SheetNames;
    const sheetName = sheetNames[Math.max(0, sheetArg - 1)] || sheetNames[0];
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });

    const features = _sheetParserFeatures(grid, sheetName);

    const candidates = engines.map(name => {
      const c = _runParserCandidate(name, grid, sheetName, features);
      const people = [...new Set(c.entries.map(e => e.name).filter(Boolean))];
      return {
        name,
        score: c.score,
        affinity: c.affinity,
        quality: c.quality.score,
        entries: c.entries.length,
        people: people.length,
        sample: people.slice(0, 4),
        complete: c.quality.complete,
        error: c.error || ''
      };
    }).sort((a, b) => b.score - a.score);

    const chosen = autoParse(grid, sheetName) || [];
    const info = S.parseInfo[0] || {};

    let preview = null;
    if (gridRows > 0) {
      preview = grid.slice(0, gridRows).map(r =>
        (r || []).slice(0, 12).map(v =>
          v instanceof Date ? v.toISOString().slice(0, 10) : String(v == null ? '' : v)));
    }

    return {
      sheetNames, sheetName,
      rows: grid.length,
      cols: Math.max(0, ...grid.map(r => (r || []).length)),
      features, candidates, preview,
      decision: {
        parser: info.parser || 'none',
        confidence: info.confidence || 'none',
        score: info.score,
        reason: info.reason || '',
        warnings: info.warnings || [],
        entries: chosen.length,
        people: new Set(chosen.map(e => e.name).filter(Boolean)).size
      }
    };
  }, { payload, xlsx, engines: ENGINES, sheetArg, gridRows });

  await browser.close();

  const f = out.features;
  console.log('\nFILE      ' + path.basename(target));
  console.log('SHEET     ' + out.sheetName + '   (of: ' + out.sheetNames.join(', ') + ')');
  console.log('GRID      ' + out.rows + ' rows x ' + out.cols + ' cols');
  console.log('\nDETECTED SHAPE');
  console.log('  orientation        ' + (f.orientation || '(ambiguous)'));
  console.log('  max dates in a row ' + f.maxDatesInRow);
  console.log('  dates in column A  ' + f.firstColDates);
  console.log('  day names in col A ' + f.firstColDays);
  console.log('  day-header rows    ' + f.dayHeaderRows);
  if (f.plausibleNameRows !== undefined) {
    console.log('  plausible name rows ' + f.plausibleNameRows);
  }

  console.log('\nENGINE SCORECARD                       (higher score wins)');
  console.log('  engine           score  = quality + affinity   entries  people');
  for (const c of out.candidates) {
    const line = '  ' + c.name.padEnd(16) +
      String(c.score).padStart(6) + '  =' +
      String(c.quality).padStart(7) + ' +' + String(c.affinity).padStart(8) + '   ' +
      String(c.entries).padStart(7) + ' ' + String(c.people).padStart(7);
    console.log(line + (c.error ? '   ERROR: ' + c.error : ''));
    if (c.people && c.sample.length) {
      console.log('      names: ' + c.sample.join(', ') + (c.people > c.sample.length ? ', …' : ''));
    }
  }

  const d = out.decision;
  console.log('\nDECISION');
  console.log('  parser      ' + d.parser);
  console.log('  confidence  ' + d.confidence + (d.score !== undefined ? '  (score ' + d.score + ')' : ''));
  console.log('  loaded      ' + d.entries + ' entries for ' + d.people + ' people');
  if (d.reason) console.log('  reason      ' + d.reason);
  if (d.warnings.length) d.warnings.forEach(w => console.log('  warning     ' + w));

  const best = out.candidates[0];
  const richest = out.candidates.slice().sort((a, b) => b.people - a.people)[0];
  if (richest && best && richest.people > best.people * 2) {
    console.log('\n  ⚠ ' + richest.name + ' found ' + richest.people + ' people but ' +
      best.name + ' won with ' + best.people + '.');
    console.log('    That is a scoring problem, not a parsing problem — see docs/PARSERS.md.');
  }

  if (out.preview) {
    console.log('\nGRID PREVIEW');
    out.preview.forEach((r, i) =>
      console.log('  ' + String(i).padStart(3) + ' | ' +
        r.map(c => c.length > 14 ? c.slice(0, 13) + '…' : c.padEnd(14)).join('')));
  }
  console.log();
})().catch(e => { console.error(e); process.exit(1); });
