# Parsers

How Sync reads a roster, and how to teach it a layout it does not yet
understand.

## The pipeline

```
file
  └─ proc()                     src/app/parse/preview-gate.js
       ├─ _readOptsForFile()    CSV keeps text; .xlsx keeps date serials
       ├─ scanFileQuick()       parse without committing anything
       │    └─ autoParse()      src/app/parse/engines.js   ← chooses the engine
       │         ├─ _sheetParserFeatures()   what shape is this sheet?
       │         ├─ _runParserCandidate()    run each engine, score the result
       │         └─ _entrySetQuality()       how good is what it extracted?
       ├─ _validateCanonicalScheduleEntries()
       └─ showParsePreview()    the confirm gate the user sees
```

Nothing reaches `S.entries` until the user confirms the preview.

## The five engines

All live in `src/app/parse/engines.js`. Each takes a grid (array of rows) and
returns entries built by `mkE()`.

| Engine | Layout it reads |
|---|---|
| `parseWideHoriz` | annual / multi-month single-sheet rota — many date columns |
| `parseHoriz` | people down the rows, dates across a header row |
| `parseVert` | dates down column A, people across the header |
| `parseBlocks` | repeating day-header blocks stacked down the sheet |
| `parsePerson` | one person per sheet, alternating date/shift rows |

`autoParse` runs every engine whose affinity clears a threshold, scores each
result, and picks a winner.

## How the winner is chosen

```
score = quality (max 75) + affinity (max 30)
```

**Affinity** — `_parserAffinity()` — is a prior: how well the sheet's *shape*
matches what this engine expects. Orientation, how many dates appear in a row,
whether column A holds dates, how many day-header rows there are.

**Quality** — `_entrySetQuality()` — measures the extracted rows:

| Term | Weight | Meaning |
|---|---|---|
| `completeRatio` | 20 | rows that resolved to a shift or a genuine off day |
| `coverage` | 15 | people found ÷ plausible person-rows in the sheet |
| `1 - duplicateRatio` | 10 | absence of duplicate person/date pairs |
| `balance` | 10 | evenness of entries per person |
| names present | 5 | any names at all |
| date spread | 5 | up to a week's worth of distinct dates |
| size | 5 | saturates around 316 entries |
| `plausibleRatio` | 5 | shift lengths between 1 and 16 hours |

Confidence bands: **≥82 and a margin of ≥4** is high, **≥62** is medium, below
**52** is rejected outright.

Two guards sit on top:

- Candidates producing identical output are treated as equivalent, so two
  engines agreeing does not count as an ambiguous result.
- If the winner found half as many people as some rival, confidence is forced to
  low and a warning is raised. A parse can be the best available and still be
  wrong.

### Why coverage exists

Before it did, the only size-sensitive term saturated near 316 entries. A parse
extracting 59 rows of a 13,500-row roster scored within 1.4 points of one
extracting all of them — so a parser that found **one** person could outrank one
that found **a hundred and fifty**, and did. See `CHANGELOG.md` for the full
account.

## Diagnosing a roster that imports wrongly

```
node tests/parse-report.js path/to/roster.xlsx
node tests/parse-report.js roster.csv --grid 15     # show the grid as parsed
node tests/parse-report.js book.xlsx --sheet 2      # a sheet other than the first
```

Output:

```
DETECTED SHAPE
  orientation        horizontal
  max dates in a row 31
  dates in column A  0
  plausible name rows 80

ENGINE SCORECARD                       (higher score wins)
  engine           score  = quality + affinity   entries  people
  parseWideHoriz   101.8  =   74.8 +      27      2480      80
      names: Alice Morgan, Bushra Morgan, …
  parsePerson       83.2  =   58.2 +      25        31       1
      names: Team A
```

This separates the two failures that look identical from the UI:

**A scoring problem** — an engine extracted the roster correctly and lost the
vote. The scorecard shows a losing engine with far more people than the winner,
and the report says so explicitly. Fix by correcting the shape detection in
`_sheetParserFeatures` or the prior in `_parserAffinity`. Do not special-case
the file.

**A parsing problem** — every engine returned 0 entries, or all returned
nonsense. The layout is genuinely new. Read the grid with `--grid 20` and work
out which engine is closest.

Check `DETECTED SHAPE` first either way. If `orientation` disagrees with where
the dates visibly are, that is the bug — that exact misread is what silently
destroyed every roster over 13 people until v65.

## Teaching Sync a new layout

1. **Add the file to `tests/fixtures/`.** Anonymise real names first — fixtures
   are committed. Keep the structure exactly as it came.
2. **Run `parse-report.js`** and decide which of the two failures it is.
3. **Fix the cause.**
   - Shape misread → `_sheetParserFeatures`. Prefer evidence (where dates
     actually are) over proxies (sheet proportions).
   - Wrong prior → `_parserAffinity`. Keep the bonus proportional to how
     specific the signal is.
   - Genuinely new layout → a new engine. Add it to `allParsers` in `autoParse`,
     give it an affinity rule, and return entries from `mkE()` so they are
     shaped like every other engine's.
4. **Record the expected result.** `node tests/parser.test.js --update`, then
   read the diff. It must change only the fixtures you meant to change — that
   diff is the proof you did not break the other layouts.
5. **Commit fixture, expectation and fix together.**

## Rules worth keeping

- **Never special-case a file.** Fix the property that made it ambiguous.
- **A parse that loses data must never report high confidence.** Silence is the
  failure mode that costs the most trust; every parser defect found so far
  reported success while discarding most of the roster.
- **Keep engines pure.** A parser takes a grid and returns entries. It should
  not touch `S`, the DOM, or storage.
- **Weight changes are global.** `_entrySetQuality` scores every engine on every
  file. Rebalance within the 75-point ceiling, or the confidence bands stop
  meaning what they say — and run the full fixture suite afterwards.

## Dates

`pDt()` (`src/app/core/kernel.js`) reads **day-first**: `01/09/2026` is
1 September.

CSV carries no cell types, so SheetJS interprets date-looking text itself and
resolves ambiguity as US month-first. `_readOptsForFile()` therefore reads CSV
with `raw:true`, keeping cells as written so `pDt` decides. `cellDates:false`
alone is **not** sufficient — SheetJS's CSV reader still returns `Date` objects.

`.xlsx` is unaffected: its dates are real serials, not text to be guessed at.
