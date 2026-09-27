# Sync

A self-contained, offline-first workforce scheduling app (7th Order Systems / MirrorFlow). It ships as one portable `index.html`, built from the sources in `src/`.

Live at [sync.theguide.club](https://sync.theguide.club) (GitHub Pages, from `main`). The Vercel project
serves the **dev build** instead (see Environments below).

Works fully offline with no account. Signing in (Google on live) adds sync of your workspace across devices.

## Where the source is

**`src/` in this repo is the source of truth.** `index.html` is built from it and committed,
because it is the file the deploy publishes. Never edit `index.html` by hand — CI fails any
commit where it does not match what `src/` builds.

```bash
# edit files under src/, then:
node build/build.js                # writes index.html (live)
node build/build.js --check        # verifies index.html == build(src/), and that every
                                   # environment builds and stays on its own server (CI runs this)
node build/build.js --env dev      # writes dist/dev/index.html (dev; not committed)
```

## Environments

One app, built twice. The builds differ only in the `src/env/<name>/` parts: which Supabase project
they talk to (`env.js` and the CSP in `csp.html`) and which sign-in methods they offer.

| | Live | Dev |
|---|---|---|
| Supabase | `ifeepocnixqqvayqnnxc` | `ycfpalvfnsextknhculd` (`sync-dev`) |
| Served from | sync.theguide.club (GitHub Pages, `deploy.yml`) | the Vercel project (`vercel.json`), Vercel login required |
| Sign-in | Google | Email + password |
| Marker | none | amber `DEV · sync-dev` badge, title `DEV · Sync` |

Guards: `--check` fails if either build mentions the other's server; the dev build refuses to start
on the live address (that origin's browser storage holds real data); `tests/environments.spec.js`
covers all three. Sign-in methods are a list per environment (`SYNC_AUTH_METHODS` in
`src/app/state/settings-persistence.js`), so moving an organisation off Google is a config change
plus enabling the provider in Supabase (`azure` = Microsoft Entra ID is already listed).

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
offline then reconnect, the boot push gate, backup export, snapshots and restore, the absence of any
sample data, the command palette, "what changed since last time", and keyboard/mobile project selection.
`cross-device-sync.spec.js` covers a second device loading an older cloud save, keeping it across
a reload, and both-sides-changed comparisons. `projects-ops.spec.js` covers the Projects panel
(signed in and out, from the landing screen and inside a project) and People edits — logbook, agent
notes and statuses — reaching a second device and surviving its next save.

`mobile-shell.spec.js` covers the phone bar (Home, Calendar, People, Ops, Projects), the iOS
home-screen icon and status bar, and the shell clearing a notch inset.

Tests build their projects with `createTestProject` in `tests/helpers.js`. The app itself ships no
sample or demo data.

Data-integrity regressions have their own specs: `parser.spec.js` (17 roster fixtures across the
13/14-person boundary, dd/mm CSVs, and the lossy-parse guard), `persistence.spec.js` (a schedule
survives reload), and `reporting.spec.js` (Absence, empty exports, storage failures).

`npm run test:web` runs the same specs against a multi-file `web/` build. That build was produced by
the retired upstream workspace and has no generator in this repo yet, so it is dormant until one is
added.

Supabase is replaced in-page by a double (`tests/fixtures/fake-supabase.js`) installed before the
app's own scripts run — no network, no real account, no test data in the live project. Tests drive
it through `window.__fakeSupabase` to sign in, fail a push, or simulate another device writing.

## Cloud sync

One `workspaces` row per account (`department_key = '__personal__'`) holds the whole workspace.
A database trigger bumps its `version` on every write. Each device keeps the version it last
matched, plus an "unsaved changes" flag, in `localStorage["sc_cloud_sync"]`. Signing in loads a
newer cloud copy automatically when the device has no unsaved changes, and a loaded copy replaces
this device's stores outright (a key it lacks was emptied on the device that saved it). When both sides changed, it
opens the comparison instead. Saving stays explicit, and a save only succeeds if the cloud row is
still at the version this device last saw. Schema changes made since this was introduced are in
`supabase/migrations/`.
