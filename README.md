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

## ⚠ 2026-09-15 — `index.html` was hand-edited directly (needs backporting)

The session that made this change (branch `claude/sync-fixture-departments-picker-v4qfa0`) did not have
filesystem access to the canonical source (`L:\projects\Sync\...\03_NorthStar_UI\`) — only this
deployed repo. It edited `index.html` directly rather than following the normal build flow above.
**The same changes must be manually ported into `northstar-core.js` and `7os-sync-northstar.html`
in the source workspace**, or the next real build-and-deploy from source will silently revert them.

What changed, and why:

- **Root cause of the recurring test-fixture departments** (Home, Retentions, Customer Service,
  Claims, Ret Messenger Rota, TPPD/DC kept reappearing in the "continue a project" picker after
  repeated manual Supabase cleanups): the affected device's own local IndexedDB copy of the
  canonical model (`sync-northstar` DB) still held the old records. `nsPersist()` fires
  `syncPushWorkspace()` on every local mutation, so any edit on that device re-pushed the stale
  IndexedDB data over whatever had just been cleaned server-side. No server-side fix can be durable
  while that's true — confirmed live via direct query against `public.workspaces`
  (`department_key='__personal__'`): 29 people still tagged to `customer service`/`claims`/`home`/
  `ret messenger rota` as of an `updated_at` of 11:52 UTC today, after the timestamp-comparison fix
  from the previous entry was already deployed.
- **Secondary bug found and fixed**: `nsHydrateDatabase()` (northstar-core.js, was ~line 32694)
  compared IndexedDB's `stored.updated_at` against the in-memory canonical model's `updated_at` as
  plain strings (`String(a) > String(b)`), the same class of bug already fixed in
  `syncPullWorkspace()` / `_syncPushWorkspaceNow()` (see the entry above this one) but missed here.
  Changed to use the existing `nsIsNewerTimestamp()` helper for consistency. This alone would not
  have fully explained the recurrence (IndexedDB hydration runs before any server pull and, on a
  device whose IndexedDB was never cleared, would load the stale local blob into memory either way),
  but it's a real correctness bug worth having fixed regardless.
- **Root-cause fix — a real delete/remove capability**, since hand-editing the Supabase row has now
  failed to stick 3 times and there was previously no user-facing way to remove a stale project at
  all (see the "Deliberately deferred" note in the source README this was deferred from):
  - `nsDeleteCanonicalProject(key)` (northstar-core.js) — removes every record tagged with the given
    `department_key` from **every** table in `NS_DEPARTMENT_TABLES`, not just `people`, then calls
    `nsPersist()` so the change is written to IndexedDB and pushed to Supabase immediately (not on
    some later, unrelated auto-save).
  - `_syncDeleteProjectFromPicker(key, name)` — confirm() dialog, then calls the above and
    re-renders the picker.
  - A small "✕ Remove" button now appears on each picker row (`_syncProjectPickerHtml`,
    7os-sync-northstar.html), visible on hover on pointer devices and always visible on touch
    (`@media(hover:none)`), styled via new `.lc-project-remove` / `.lc-project-row-main` CSS.

**Not done in this session** (needs the actual affected device/browser, which this session cannot
reach): confirming the IndexedDB contents directly via devtools, and actually clicking "Remove" on
the 6 test departments on that device. The Supabase row was left as-is rather than cleaned again by
script — a 4th manual DB edit would not stick either, for the same reason the first 3 didn't. Use
the new Remove button on the real device instead; that is now the durable path (device-local delete
→ immediate push), not a server-side edit.
