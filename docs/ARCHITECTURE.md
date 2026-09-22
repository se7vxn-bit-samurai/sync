# Architecture

## Shape

Sync ships as one self-contained `index.html`. That file is a **build output** of `src/`, assembled
by `build/build.js`. Edit `src/`, never `index.html`.

```
src/head/          <head>, CSP, PWA manifest
src/vendor/        SheetJS, html2canvas, ExcelJS, JSZip — inlined verbatim
src/styles/        the stylesheets
src/body/          the markup
src/app/           the application, ~70 modules in one flat script
src/northstar/     canonical data model, persistence, cloud sync (an IIFE)
src/assets/        base64 .xlsx starter templates
src/signal-field/  the ASCII mark animation
src/packbuilder/   SyncSheets v3.1 pack builder
src/boot/          identity installer and boot-splash teardown
```

Everything is inlined so the file survives being emailed and opened with no network.

## The build is a concatenation, not a bundle

`build/build.js` joins the files listed in `build/manifest.json`, in order, with newlines. It does
not minify, rename, wrap, transform or reorder — and must never start to. Three properties of the
code make a real bundler unsafe:

1. **The analytics Worker is built from function source.** `_buildAnalyticsWorkerSource()`
   (`src/app/analytics/health.js`) calls `Function.prototype.toString()` on `computeFlags`,
   `computeTeamHealthScore` and `_signalRankMeta`. Renaming, wrapping or transpiling them breaks
   analytics at runtime, in the background, with no build error.
2. **NorthStar decorates the main script by reassignment.** Fourteen functions
   (`showParsePreview`, `loadIntoWorkspace`, `rOps`, `renderActiveTab`, …) are captured as
   `const nsBaseX = X` and reassigned. ES module bindings are immutable, so modules cannot express
   this.
3. **One flat hoisted scope.** Hundreds of functions are called from inline `onclick`/`onchange`
   attributes in markup and generated HTML, and modules call each other by hoisting regardless of
   concatenation order.

### What follows

- **Manifest order is the original file order.** Reordering parts is a behaviour change.
- Moving a function between files is safe. Renaming one used by an inline handler is not.
- `node build/build.js --check` fails when `index.html` and `src/` diverge. CI runs it before the
  tests, so a hand-edit to `index.html` cannot ship.
- `build/split.js` is the one-time splitter that produced `src/`. It refuses to run while `src/`
  exists.

## State

One global object, `S`, declared in `src/app/state/store.js`. Some of its properties are created
lazily by initialisers (`_ensureCriticalRuntimeState`, `_ensurePeopleOpsState`,
`ensureOTPlanDefaults`), which must stay on the load path.

Persistence has two layers: `localStorage` (settings, and the canonical model **without** schedule
rows) and IndexedDB `sync-northstar` / `workspace` / `canonical` (the full model). Writes to
IndexedDB are held until boot hydration has read it back, unless they carry schedule rows — see
`nsCanWriteSnapshot` in `src/northstar/northstar.js.html`.
