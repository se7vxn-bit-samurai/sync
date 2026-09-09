# Sync

**MirrorFlow Sync** — local-first schedule intelligence. Live at
[sync.theguide.club](https://sync.theguide.club).

Drop in a roster spreadsheet and Sync turns it into a workspace: calendar and
cards, coverage and blueprint analysis, overtime planning, coaching, absence,
alerts, and publish-ready exports. Everything runs in the browser. The page
declares `connect-src 'none'` — no schedule data leaves the machine it is opened
on.

## How it is built

Sync ships as one self-contained `index.html`, served directly by GitHub Pages.
Vendored SheetJS, ExcelJS, JSZip and html2canvas are inlined alongside the app,
so the file works offline and can be handed to someone as a single attachment.

That file is a **build output**. The sources live in `src/` as ~85 modules, and
`build/build.js` concatenates them:

```
npm run build      assemble src/ into index.html
npm run check      verify index.html matches src/
npm test           check + parser suite + smoke suite
```

Edit `src/`, never `index.html`. The build is a plain concatenation — it does
not minify, rename or wrap anything, and it must not start to; see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why.

## The workflow it is built around

1. Import a schedule — `.xlsx`, `.xls` or `.csv`, or paste from Excel.
2. Work the month. Coaching sessions, planner tasks, OT decisions, absence,
   logbook entries and notes accumulate around the schedule as it goes.
3. Export a Save+ file to share, archive or analyse — an `.xlsx` carrying both
   the readable sheets and the full application state.

The modules beyond the schedule start empty by design. They fill up over a
month.

## Running it

Open `index.html` in a browser. No server, no install.

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
index.html      the built application — generated, committed, served by Pages
src/            the sources
build/          the concatenator and its manifest
tests/          parser and smoke suites, fixtures, parse-report CLI
docs/           architecture, parsers, persistence, build
CHANGELOG.md    what changed and why
CONTRIBUTING.md the working loop and the three things that will bite you
CNAME           custom domain for GitHub Pages
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how it is put together, and why
  the build is a concatenation rather than a bundle
- [docs/PARSERS.md](docs/PARSERS.md) — the parse pipeline, and how to teach Sync
  a roster layout it does not yet read
- [docs/PERSISTENCE.md](docs/PERSISTENCE.md) — storage, session resume, Save+
- [docs/BUILD.md](docs/BUILD.md) — building, checking, adding a module
