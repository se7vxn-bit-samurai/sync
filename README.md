# Sync

A self-contained, offline-first workforce scheduling app (7th Order Systems / MirrorFlow). It ships as one portable `index.html`, built from the sources in `src/`.

Live at [sync.theguide.club](https://sync.theguide.club) (GitHub Pages, this repo/branch) and also connected to a Vercel project for the same domain.

Works fully offline with no account. Signing in with Google (optional) adds sync of your workspace across devices.

## Where the source is

**`src/` in this repo is the source of truth.** `index.html` is built from it and committed,
because it is the file the deploy publishes. Never edit `index.html` by hand — CI fails any
commit where it does not match what `src/` builds.

```bash
# edit files under src/, then:
node build/build.js           # writes index.html
node build/build.js --check   # verifies index.html == build(src/)  (CI runs this)
```

The build is a plain concatenation in `build/manifest.json` order, never a bundler — see
`docs/ARCHITECTURE.md` for why that is a hard requirement.

> **Retired:** the old upstream workspace (`7os-sync-northstar.html`, `northstar-core.js`,
> `tests/build_standalone.js`, …) no longer feeds this repo. Copying its standalone build over
> `index.html` would silently revert every fix made in `src/` since the split, and CI will reject
> it anyway because it will not match `src/`.

To ship: edit `src/`, build, run `npm test`, commit `src/` and `index.html` together, merge to
`main`. `deploy.yml` checks the build, runs the suite, and publishes only if both pass.

## UI / end-to-end tests

The suite here runs against the built `index.html` — the artifact users actually load — so it catches
problems that only appear after inlining (script-scope boundaries between the page shell and
`northstar-core.js` have caused real, silent breakage more than once).

```bash
npm install
npx playwright install chromium
npm test
```

Where Chromium is preinstalled at a fixed path (e.g. cloud sandboxes), point the suite at it with
`PW_CHROMIUM_PATH=/path/to/chrome npm test` instead of downloading.

Covers sign-in and the cloud pull, 0/1/2/7-project pickers, people-only projects, resuming a
project's exact view context, deletion when the cloud save fails, concurrent edits from two devices,
offline then reconnect, the boot push gate, backup export, snapshots and restore, the sample
project, the command palette, "what changed since last time", and keyboard/mobile project selection.

Data-integrity regressions have their own specs: `parser.spec.js` (17 roster fixtures across the
13/14-person boundary, dd/mm CSVs, and the lossy-parse guard), `persistence.spec.js` (a schedule
survives reload), and `reporting.spec.js` (Absence, empty exports, storage failures).

`npm run test:web` runs the same specs against a multi-file `web/` build. That build was produced by
the retired upstream workspace and has no generator in this repo yet, so it is dormant until one is
added.

Supabase is replaced in-page by a double (`tests/fixtures/fake-supabase.js`) installed before the
app's own scripts run — no network, no real account, no test data in the live project. Tests drive
it through `window.__fakeSupabase` to sign in, fail a push, or simulate another device writing.
