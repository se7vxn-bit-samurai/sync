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
offline then reconnect, the boot push gate, backup export, and keyboard/mobile project selection.

Supabase is replaced in-page by a double (`tests/fixtures/fake-supabase.js`) installed before the
app's own scripts run — no network, no real account, no test data in the live project. Tests drive
it through `window.__fakeSupabase` to sign in, fail a push, or simulate another device writing.
