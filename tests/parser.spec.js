const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, PROFILE } = require('./helpers');

// Parser *selection* is what has failed silently before: every engine extracted the rows and then
// the wrong one won the scoring vote, so "we got some entries" proves nothing. Each roster fixture
// asserts the winning parser, people, entries, confidence band and month span.
//
// These run the real autoParse() over sheet 1 rather than the preview modal, so a failure points
// at parser selection and not at UI. The t_12..t_20 sweep straddles the 13/14-person boundary
// where rosters used to collapse to a single fabricated person.
const DIR = path.join(__dirname, 'fixtures', 'rosters');
const EXPECTED = JSON.parse(fs.readFileSync(path.join(DIR, 'expected.json'), 'utf8'));

function fixtureFile(name) {
  for (const ext of ['.csv', '.xlsx']) {
    const p = path.join(DIR, name + ext);
    if (fs.existsSync(p)) return p;
  }
  throw new Error('No roster fixture named ' + name);
}

async function parseFixture(page, name) {
  const file = fixtureFile(name);
  const xlsx = file.endsWith('.xlsx');
  const payload = xlsx ? Array.from(fs.readFileSync(file)) : fs.readFileSync(file, 'utf8');
  return page.evaluate(({ payload, xlsx, filename }) => {
    S.parseInfo = [];
    const bytes = xlsx ? new Uint8Array(payload) : new TextEncoder().encode(payload);
    // The app's own option selection, so CSV date handling is the code the import path runs.
    const wb = XLSX.read(bytes, _readOptsForFile({ name: filename }));
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const entries = autoParse(grid, wb.SheetNames[0]) || [];
    const info = S.parseInfo[0] || {};
    const months = [...new Set(entries
      .map((e) => e.date && new Date(e.date))
      .filter((d) => d && !isNaN(d))
      .map((d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')))].sort();
    return {
      parser: info.parser || 'none',
      people: new Set(entries.map((e) => e.name).filter(Boolean)).size,
      entries: entries.length,
      confidence: info.confidence || 'none',
      months,
    };
  }, { payload, xlsx, filename: path.basename(file) });
}

async function openReady(page) {
  await openApp(page, { profile: PROFILE, workspaceRow: null });
  await page.waitForFunction(() => typeof autoParse === 'function' && typeof XLSX === 'object');
}

// Parsing is pure, so one page serves every fixture; desktop only, since viewport is irrelevant.
test.describe('parser selection', () => {
  test.skip(({ isMobile }) => isMobile, 'viewport-independent');

  let page;
  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await openReady(page);
  });
  test.afterAll(async () => { await page.close(); });

  for (const [name, want] of Object.entries(EXPECTED)) {
    test(`${name} → ${want.parser}, ${want.people} people, ${want.entries} entries`, async () => {
      test.setTimeout(120_000);
      expect(await parseFixture(page, name)).toEqual(want);
    });
  }

  test('stacked team-leader week blocks: leaders are people, banner is the team, roster code is the week', async () => {
    const file = fixtureFile('tpa_team_blocks');
    const payload = Array.from(fs.readFileSync(file));
    const got = await page.evaluate((payload) => {
      S.parseInfo = [];
      const wb = XLSX.read(new Uint8Array(payload), _readOptsForFile({ name: 'tpa.xlsx' }));
      const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
      const en = autoParse(grid, wb.SheetNames[0]) || [];
      const day = (n, iso) => en.find((e) => e.name === n && e.date.toISOString().slice(0, 10) === iso);
      const pick = (e) => e && { raw: e.raw, ukS: e.ukS, ukE: e.ukE, off: e.isOff, week: e.week, team: e.team };
      return {
        names: [...new Set(en.map((e) => e.name))].sort(),
        teams: [...new Set(en.map((e) => e.team))],
        wk2: pick(day('Pontsho', '2026-10-05')), wk1: pick(day('Pontsho', '2026-10-12')),
        blank: pick(day('Pontsho', '2026-10-09')), spaced: pick(day('Bontle', '2026-09-28')),
      };
    }, payload);
    expect(got.names).toEqual(['Bontle', 'Dylan', 'Pontsho']);
    expect(got.teams).toEqual(['Interventions']);
    expect(got.wk2).toMatchObject({ ukS: '10:30', ukE: '19:00', off: false, week: 'W2' });
    expect(got.wk1).toMatchObject({ ukS: '12:30', ukE: '20:30', week: 'W1' });
    expect(got.blank).toMatchObject({ off: true, ukS: null, week: 'W2' });
    expect(got.spaced).toMatchObject({ ukS: '10:30', ukE: '18:30', off: false });
  });

  test('a lossy parse is never presented as trustworthy', async () => {
    // With scoring correct no fixture reaches this backstop, so force it: make affinity favour the
    // parser that reads one person and check the result is downgraded and warned about.
    const csv = fs.readFileSync(fixtureFile('r_80x31'), 'utf8');
    const got = await page.evaluate((csv) => {
      const real = _parserAffinity;
      // Rivals stay at 8 so they clear autoParse's affinity>=8 filter and actually run.
      _parserAffinity = (parser) => (parser === 'parsePerson' ? 30 : 8);
      try {
        S.parseInfo = [];
        const wb = XLSX.read(new TextEncoder().encode(csv), XLSX_STANDARD_READ_OPTS);
        const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        const entries = autoParse(grid, 'guard') || [];
        const info = S.parseInfo[0] || {};
        return {
          parser: info.parser,
          confidence: info.confidence,
          warned: (info.warnings || []).some((w) => /most of the roster may be missing/.test(w)),
          people: new Set(entries.map((e) => e.name).filter(Boolean)).size,
        };
      } finally { _parserAffinity = real; }
    }, csv);
    expect(got).toEqual({ parser: 'parsePerson', confidence: 'low', warned: true, people: 1 });
  });
});
