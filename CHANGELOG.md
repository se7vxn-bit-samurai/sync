# Changelog

## v65 — Parser integrity and session resume

The first release with a test suite. Three defects fixed, each of which lost
user data without saying so.

### Rosters over 13 people were silently reduced to one person

A roster of 14 or more people on a calendar month imported as a single
fabricated person — the team header cell — with one entry per day, reported at
**high** confidence with no warnings. A 150-person, 90-day roster loaded 59 of
its 13,500 rows. The threshold was exactly `people > (days − 5) / 2`.

The parsers were never at fault. `parseWideHoriz` extracted every row correctly
and then lost the scoring vote, for two compounding reasons:

- `_sheetParserFeatures` inferred orientation from the sheet's aspect ratio. A
  31-day month is 32 columns wide, so any roster taller than ~13 people failed
  the "horizontal" test even though every date sat in a header row and column A
  held no dates at all. Orientation is now read from where the dates actually
  are.
- `_entrySetQuality` had no term for how much of the sheet a parse consumed. Its
  only size term saturates near 316 entries, so extracting 59 rows scored within
  1.4 points of extracting 13,500. A coverage term now measures extracted people
  against the sheet's plausible person-rows.

A guard was added on top: a parse that finds half as many people as a rival
parser can no longer be reported as trustworthy, whatever it scored.

### dd/mm/yyyy CSVs were read as American dates

A 28-day September rota written `01/09/2026`…`28/09/2026` imported across twelve
months — the first twelve days became January through December the 9th. CSV
carries no cell types, so SheetJS resolved the ambiguity as month-first, and
`pDt()` — which reads day-first correctly — never saw the text. CSV is now read
with `raw:true` so the cells stay as written. `.xlsx` was never affected and is
untouched.

### A loaded schedule did not survive a refresh

Every piece of derived operational data persisted — coaching, planner, OT,
blueprints, logbook, settings — but the schedule they hang off did not, so a
reload returned to the landing card with a month of annotations attached to
nothing.

The schedule was already being written to IndexedDB on every import. It was
unreachable for three reasons, all now fixed: hydration restored only the people
and discarded the rows; the stored copy was adopted only when strictly newer,
which two copies written by the same call can never be; and startup itself
overwrote the stored schedule with an empty one 180ms into every reload, before
hydration could read it.

Sessions now resume on load. A `resumeSession` setting turns it off, the
debounced write is flushed on page hide, and undo keeps fewer restore points on
large rosters since each one clones the whole schedule.

### Storage failures are no longer silent

Every `localStorage` write sat inside an empty catch, so a full quota discarded
it with no warning of any kind. Failures now log per key and warn once per
session.

### Added

- `tests/` — parser and smoke suites driving the real `index.html` in headless
  Chromium, with 17 fixtures including a people-count sweep across the 13/14
  boundary and a 150×90 roster
- `tests/parse-report.js` — per-engine scorecard for diagnosing a roster that
  imports wrongly, and the starting point for teaching Sync a new layout
