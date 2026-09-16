/**
 * Generates the .xlsx fixtures the import tests run against.
 *
 *   node tests/fixtures/make-workbooks.js        (needs the dev server: node tests/serve.js)
 *
 * Why it works this way: fixtures are built by POPULATING the real ScheduleHub v3.1 starter
 * template rather than authoring a workbook from scratch. The template carries the exact sheet
 * names, column headers and workbook metadata the detectors key off, so a generated fixture cannot
 * drift from the shape the app actually expects — only its rows differ. A hand-rolled workbook
 * would be a guess at that shape, and a wrong guess would make the tests pass against a format no
 * real user has.
 *
 * It runs in a browser page against the app's OWN bundled XLSX build, so fixtures are written by
 * exactly the library that will read them, and no npm dependency is added to do it.
 *
 * The generated files are committed. This script is the source of truth for regenerating them; the
 * committed copies mean the suite runs without a generation step.
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'workbooks', 'generated');
const BASE_URL = process.env.SYNC_TEST_URL || 'http://127.0.0.1:4173';
const TEMPLATE = '/tests/fixtures/workbooks/ScheduleHub_v3.1_Starter.xlsx';

const PEOPLE = [
  { name: 'Amara Okafor', team: 'Early', id: 'P-0001' },
  { name: 'Ben Sorensen', team: 'Early', id: 'P-0002' },
  { name: 'Chloe Duarte', team: 'Early', id: 'P-0003' },
  { name: 'Dmitri Volkov', team: 'Late', id: 'P-0004' },
  { name: 'Esi Mensah', team: 'Late', id: 'P-0005' },
  { name: 'Farid Haddad', team: 'Late', id: 'P-0006' },
];

// Fixed dates, never "today": a fixture whose contents depend on when it was generated makes
// failures depend on the calendar, which is the hardest kind of flake to recognise.
const START = '2026-03-02'; // a Monday
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function scheduleRows({ days, department, duplicateFirstRow = false, includeOffDays = true }) {
  const rows = [];
  const start = new Date(START + 'T00:00:00Z');
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + d);
    const iso = date.toISOString().slice(0, 10);
    PEOPLE.forEach((person, i) => {
      const offset = (d + i * 2) % 7;
      const isOff = includeOffDays && (offset === 5 || offset === 6);
      const early = person.team === 'Early';
      rows.push({
        schedule_entry_id: `SE-${iso}-${person.id}`,
        person_id: person.id,
        person_name: person.name,
        team_name: person.team,
        department,
        date: iso,
        day_of_week: DAYS[date.getUTCDay()],
        uk_start: isOff ? '' : early ? '07:00' : '12:00',
        uk_end: isOff ? '' : early ? '15:00' : '20:00',
        sa_start: '',
        sa_end: '',
        is_off: isOff ? 'TRUE' : 'FALSE',
        source_format: 'schedulehub_v3',
        import_batch_id: 'BATCH-0001',
        notes: '',
        pid_key: person.id.toLowerCase(),
        name_key: person.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
        row_version: 1,
        sync_status: 'synced',
        last_modified_utc: '2026-03-01T08:00:00Z',
        modified_by: 'fixture',
        change_reason: '',
        is_deleted: 'FALSE',
        source_id: 'MF-SRC-SCHEDULEHUB-V3',
        authority_rank: 2,
      });
    });
  }
  if (duplicateFirstRow && rows.length) rows.push({ ...rows[0] });
  return rows;
}

const FIXTURES = [
  {
    file: 'schedulehub-two-teams.xlsx',
    note: 'Happy path: 6 people over 2 teams, 4 weeks, rolling days off.',
    rows: scheduleRows({ days: 28, department: 'Operations' }),
  },
  {
    // Same department name as above, different month — for the "a project called X already exists,
    // open as a copy instead" branch, which only appears when the detected name collides.
    file: 'schedulehub-same-name-later-month.xlsx',
    note: 'Collides by department name with schedulehub-two-teams; different dates.',
    rows: scheduleRows({ days: 14, department: 'Operations' }).map((r) => {
      const d = new Date(r.date + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() + 1);
      const iso = d.toISOString().slice(0, 10);
      return { ...r, date: iso, day_of_week: DAYS[d.getUTCDay()], schedule_entry_id: `SE-${iso}-${r.person_id}` };
    }),
  },
  {
    file: 'schedulehub-duplicate-rows.xlsx',
    note: 'One exactly repeated row, to exercise duplicate detection in the preview.',
    rows: scheduleRows({ days: 7, department: 'Support', duplicateFirstRow: true }),
  },
];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('page error:', e.message.split('\n')[0]));
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof XLSX === 'object', null, { timeout: 30_000 });

    for (const fixture of FIXTURES) {
      const bytes = await page.evaluate(
        async ({ templateUrl, rows }) => {
          const res = await fetch(templateUrl);
          if (!res.ok) throw new Error('template fetch failed: ' + res.status);
          const wb = XLSX.read(new Uint8Array(await res.arrayBuffer()), { type: 'array' });
          const sheet = wb.Sheets['Schedule_Data'];
          if (!sheet) throw new Error('template has no Schedule_Data sheet');
          // Reuse the template's own header row so column order is whatever the template says,
          // not whatever this script happens to list.
          const header = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })[0];
          const ordered = rows.map((r) => header.map((col) => (col in r ? r[col] : '')));
          XLSX.utils.sheet_add_aoa(sheet, ordered, { origin: 'A2' });
          const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          return Array.from(new Uint8Array(out));
        },
        { templateUrl: TEMPLATE, rows: fixture.rows }
      );
      const target = path.join(OUT_DIR, fixture.file);
      fs.writeFileSync(target, Buffer.from(bytes));
      console.log(`${fixture.file.padEnd(42)} ${String(fixture.rows.length).padStart(4)} rows  ${fs.statSync(target).size.toLocaleString()} bytes`);
      console.log(`  ${fixture.note}`);
    }
  } finally {
    await browser.close();
  }
})();
