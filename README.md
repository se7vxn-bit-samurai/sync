# Sync

A self-contained, offline-first workforce scheduling app (7th Order Systems / MirrorFlow). This repository holds only the deployed build — `index.html` is a single portable file with no build step of its own; it's generated elsewhere and copied in here.

Live at [sync.theguide.club](https://sync.theguide.club) (GitHub Pages, this repo/branch) and also connected to a Vercel project for the same domain.

Works fully offline with no account. Signing in with Google (optional) adds sync of your workspace across devices.

## This is a build output, not the source

Do not hand-edit `index.html` here — changes will be overwritten by the next deploy and won't exist anywhere else. The actual source lives in the main project workspace:

```
7os-sync-northstar.html   ← page shell, styles, most app logic
northstar-core.js         ← canonical data model, persistence, cloud sync
sync-signal-field.js
syncsheets-v31.js
tests/build_standalone.js ← builds the standalone file from the above
```

To ship a change: edit the source, run `node tests/build_standalone.js`, copy the resulting `7os-sync-northstar-standalone.html` over this repo's `index.html`, commit, and push to `main`.

`node tests/build_and_stage.js` does the build and the copy in one step, so the tested artifact can
never drift from the sources that produced it.

## Two build targets

| Target | Command | Output | Use |
| --- | --- | --- | --- |
| Standalone | `tests/build_standalone.js` | one ~5MB `.html` | what this repo deploys; portable, runs from a file:// path with no server |
| Multi-file web | `tests/build_web.js` | `web/` folder | hosted sites: same app split so the ~2.8MB of vendor bundles and starter workbooks (53% of the payload) stay cached across app deploys |

The multi-file build is not currently deployed — switching this repo to it is a deployment decision,
not a code one. Both targets are verified by the same test suite (`npm test` / `npm run test:web`).

## UI / end-to-end tests

The suite here runs against the built `index.html` — the artifact users actually load — so it catches
problems that only appear after inlining (script-scope boundaries between the page shell and
`northstar-core.js` have caused real, silent breakage more than once).

```bash
npm install
npx playwright install chromium
npm test
```

Covers sign-in and the cloud pull, 0/1/2/7-project pickers, people-only projects, resuming a
project's exact view context, deletion when the cloud save fails, concurrent edits from two devices,
offline then reconnect, the boot push gate, backup export, snapshots and restore, the sample
project, the command palette, "what changed since last time", and keyboard/mobile project selection.

`npm run test:web` runs the same specs against the multi-file build (see Two build targets above);
it needs that build to exist first — `node tests/build_web.js` in the source tree.

Supabase is replaced in-page by a double (`tests/fixtures/fake-supabase.js`) installed before the
app's own scripts run — no network, no real account, no test data in the live project. Tests drive
it through `window.__fakeSupabase` to sign in, fail a push, or simulate another device writing.
