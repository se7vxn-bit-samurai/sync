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
