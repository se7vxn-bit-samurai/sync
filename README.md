# Sync

**MirrorFlow Sync** — local-first schedule intelligence. Live at
[sync.theguide.club](https://sync.theguide.club).

Drop in a roster spreadsheet and Sync turns it into a workspace: calendar and
cards, coverage and blueprint analysis, overtime planning, coaching, absence,
alerts, and publish-ready exports. Everything runs in the browser. The page
declares `connect-src 'none'` — no schedule data leaves the machine it is opened
on.

## How it is built

The whole product is one self-contained `index.html` at the repo root, served
directly by GitHub Pages. Vendored SheetJS, ExcelJS, JSZip and html2canvas are
inlined alongside the app, so the file works offline and can be handed to
someone as a single attachment.

## The workflow it is built around

1. Import a schedule — `.xlsx`, `.xls` or `.csv`, or paste from Excel.
2. Work the month. Coaching sessions, planner tasks, OT decisions, absence,
   logbook entries and notes accumulate around the schedule as it goes.
3. Export a Save+ file to share, archive or analyse — an `.xlsx` carrying both
   the readable sheets and the full application state.

The modules beyond the schedule start empty by design. They fill up over a
month.

## Running it

Open `index.html` in a browser. There is no build step and no server.

## Tests

```
npm test              # parser suite + smoke suite
npm run test:parser   # parser selection, per fixture
npm run test:smoke    # boot, navigation, injection, viewports, persistence
```

Both suites drive the real `index.html` in headless Chromium via Playwright.
They need Playwright and a Chromium build available; override the paths with
`SYNC_PLAYWRIGHT` and `SYNC_CHROMIUM` if they are not in the default locations.

Expected results live in `tests/fixtures/expected.json` and
`tests/fixtures/smoke-expected.json`. When a change deliberately alters
behaviour, regenerate with `--update` and let the diff to those files be the
record of what changed.

## When a roster imports wrongly

```
node tests/parse-report.js path/to/roster.xlsx
```

This prints what each of the five parse engines extracted from the file and how
it scored, then the decision the app actually made. It distinguishes the two
failure modes that look identical from the UI:

- **a scoring problem** — the right engine read the file correctly and lost the
  vote to one that read less of it
- **a parsing problem** — no engine understood the layout

Add `--grid 12` to see the first rows as the parser sees them, and `--sheet N`
to inspect a sheet other than the first.

To teach Sync a layout it does not yet handle, add the file to `tests/fixtures/`,
record what a correct import looks like in `expected.json`, and work until the
suite is green.

## Repository

```
index.html    the application
tests/        parser and smoke suites, fixtures, parse-report CLI
CHANGELOG.md  what changed and why
CNAME         custom domain for GitHub Pages
```
