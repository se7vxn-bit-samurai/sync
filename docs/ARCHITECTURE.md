# Architecture

## Shape

Sync ships as one self-contained `index.html`. That file is a **build output**.
The sources live in `src/` and are assembled by `build/build.js`.

```
src/head/          <head>, CSP, PWA manifest
src/vendor/        SheetJS, html2canvas, ExcelJS, JSZip — inlined verbatim
src/styles/        the stylesheets
src/body/          the markup
src/app/           the application, ~70 modules
src/northstar/     the canonical-data layer
src/assets/        base64 .xlsx starter templates
src/signal-field/  the ASCII mark animation
src/packbuilder/   SyncSheets v3.1 pack builder
src/boot/          identity installer and boot-splash teardown
```

Everything is inlined because the product is meant to survive being emailed as
an attachment and opened with no network. The page declares
`connect-src 'none'`; no schedule data can leave the machine.

## The build is a concatenation, not a bundle

`build/build.js` joins the files named in `build/manifest.json`, in order, with
newlines. It does not minify, rename, wrap, transform, tree-shake or reorder.

**This is a hard requirement, not a stylistic preference.** Three properties of
the code make any real bundler unsafe:

### 1. The analytics Worker is built from function source

`_buildAnalyticsWorkerSource()` (`src/app/analytics/worker.js`) constructs a
Blob Worker by calling `Function.prototype.toString()` on `computeFlags`,
`computeTeamHealthScore` and `_signalRankMeta`, and re-declares `DOW` inside the
worker string.

Any tool that renames those functions, wraps them in a module closure, or
transpiles them changes what `toString()` returns. The worker then fails **at
runtime, in the background, with no build-time error** — analytics quietly stop
updating. `tests/smoke.test.js` asserts the worker source still contains all
three function declarations and no `[native code]`.

### 2. Fourteen functions are reassigned at runtime

`src/northstar/northstar.js.html` decorates the main script by reassignment:

```js
const nsBaseShowParsePreview = showParsePreview;
showParsePreview = function(...) { ...; return nsBaseShowParsePreview(...); };
```

It does this to `scanFileQuick`, `_refreshParsePreviewLoadState`,
`showParsePreview`, `confirmParsePreview`, `cancelParsePreview`,
`loadIntoWorkspace`, `restoreFromSaveFile`, `_buildAppStateSnapshot`,
`_opsSubtabNav`, `_opsSourceRows`, `rOps`, `rAnalytics`, `renderActiveTab` and
`showLoadSplash`. `saveSettings` is reassigned in the main script too.

ES module bindings are immutable. A module system cannot express this pattern at
all, so converting to modules would mean rewriting the entire NorthStar
integration layer.

### 3. One flat scope, and the DOM depends on it

The main script is a single top-level scope — about 1,310 top-level
declarations, no IIFE. Function declarations land on `window`; `const`/`let`
(`S`, `TH`, `MO`, `DOW`, `EXC`…) are global-lexical.

**335 distinct functions are called from inline `onclick`/`onchange`
attributes**, across roughly 970 call sites — in the static markup and in
generated HTML strings. Handlers also reference the lexical globals `S`, `$`,
`X`, `XJS`, `XA`, `cssAlpha`, `calcHrs`, `excKey`, `srchKey` and `navM`.

Forward references between modules resolve by hoisting, which is why
`src/app/state/exceptions-leave.js` can call `excKey` from
`src/app/exceptions/day-ops.js` even though the latter is concatenated
thousands of lines later.

### What follows from this

- **Order in `build/manifest.json` is the original file order and must not be
  rearranged.** Two clusters are physically interleaved — `people/ops-surface`
  is separated from `views/people` by `export/cards-png-zip`, and
  `analytics/risk-fairness` by `analytics/patterns`. Reordering them to be
  contiguous is a behaviour change, not a tidy-up, and is not part of the split.
- Moving a function between modules is safe. Renaming one that appears in an
  inline handler is not.
- `node build/build.js --check` fails if `index.html` and `src/` diverge. CI
  runs it on every push.

## Verifying the split

The restructure was validated by reproducing the pre-split file exactly:

```
sha256(build(src)) === sha256(index.html)
```

Byte-identical output is the strongest available guarantee that the split
changed no behaviour. That invariant is what `--check` preserves.

## State

One global object, `S`, declared in `src/app/state/store.js`. Around 209
distinct properties are read across the app; roughly 30 of them never appear in
the initial literal and are created lazily by `_ensureCriticalRuntimeState`,
`_ensurePeopleOpsState` and `ensureOTPlanDefaults`. Any refactor must keep those
initialisers on the load path.

The app's `main()` is a bare block at the end of
`src/app/state/settings-persistence.js`: `loadSettings()`,
`_restoreViewportFromState()`, then the `load*` hydrators, then `ren()`.

## Documents

- `docs/PARSERS.md` — the parse pipeline and how to teach Sync a new layout
- `docs/PERSISTENCE.md` — storage keys, IndexedDB, Save+ and vault formats
- `docs/BUILD.md` — building, checking, and adding a module
