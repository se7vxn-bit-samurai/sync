# Persistence

Sync has no backend. Everything lives in the browser, plus files the user
exports.

## Where things live

| Store | Holds | Survives reload |
|---|---|---|
| `localStorage` | settings and all derived operational data (~60KB typical) | yes |
| IndexedDB `sync-northstar` | the canonical model **including the schedule** | yes |
| `sessionStorage` | splash-shown flags only | no |
| Save+ `.xlsx` | readable sheets plus full application state | it is a file |
| `.syncvault` | the same, AES-GCM encrypted | it is a file |

### Why the schedule is not in localStorage

A 150-person, 90-day roster is about 13,500 entries. Serialised with all 20
fields per entry that is roughly 4.5MB of JSON — and browsers account
`localStorage` in UTF-16, so ~9MB against a 5MB origin budget. It does not fit.

The NorthStar layer therefore writes `schedule: []` into its localStorage copy
deliberately, and keeps the real rows in IndexedDB.

## localStorage keys

Settings and view state: `sc_settings`, `mf_theme`, `mf_variant`,
`mf_rail_collapsed`, `sc_people_view`, `sc_state_schema`.

Operational data: `sc_people`, `sc_people_home`, `sc_people_logbook`,
`sc_positions`, `sc_blueprints`, `sc_planner`, `sc_leaderplanner`, `sc_shiftlib`,
`sc_otplan`, `sc_att`, `sc_hc`, `sc_notes`, `sc_scratchpad`, `sc_coachquality`,
`sc_coveragereq`, `sc_forecast`, `sc_agentnotes`, `sc_agentstatuses`,
`sc_name_remaps`, `sc_rosterfile`, `sc_exceptions`, `sc_leaverequests`,
`sc_dayclosed`, `sc_coaching`, `sc_qol_state`, `mf_shared_qol_state_v1`.

Per-department: `sc_snap_<dept>` (last import's schedule fingerprint, used to
diff the next one), `sc_swaps_<dept>`.

Canonical model: `sc_northstar_canonical_v1` — same shape as the IndexedDB
record but with `schedule` emptied.

Writes go through `_persistSet` / `_persistRemove`
(`src/app/state/persist-queue.js`), which batch on idle. Failures — a full
quota, or a browser blocking site data — log per key and warn the user once per
session.

## Session resume

Every import commits the schedule to IndexedDB:

```
loadIntoWorkspace / restoreFromSaveFile
  └─ nsCommitWorkbook | nsCommitRuntimeSchedule
       └─ nsPersist()
            ├─ localStorage  (schedule stripped)
            └─ nsQueueDatabaseWrite → IndexedDB (schedule intact, 180ms debounce)
```

On load, `nsHydrateDatabase()` reads the stored model back and
`nsResumeLastSession()` maps its rows through `nsRuntimeEntry` into `S.entries`,
rebuilds `S.months` / `S.month` / `S.mIdx`, and hands off to
`_restoreViewportFromState()` — which decides landing card versus workspace on
exactly `S.wb || S.entries.length`.

Three rules keep this working, each of which was a bug before v65:

- **The stored copy is adopted when it has the schedule and the live one does
  not**, regardless of timestamps. Both copies are written by the same
  `nsPersist` call and so carry the same `updated_at`; a strictly-newer test can
  never fire.
- **Database writes are skipped while a model carries no schedule and hydration
  has not yet run.** Startup calls `nsPersist()` with a model seeded from
  localStorage — without this guard it overwrote the stored schedule with
  nothing, 180ms into every reload. A model with rows always writes.
- **The debounced write is flushed on `pagehide` and on hiding**, so closing the
  tab just after an import does not lose it.

Turn resume off with the `resumeSession` setting; the landing card is always
reachable.

A resumed session has **no workbook** behind it. `S.wb` is stubbed as
`{SheetNames:[],Sheets:{}}` so sheet-backed views degrade instead of throwing,
and raw-sheet views say so. Re-import the file to inspect its sheets.

## Save+ files

A normal `.xlsx` with readable sheets plus two `veryHidden` ones:

- `_app_state` — A1 holds a manifest describing the chunking
- `_app_state_json` — the state JSON split into 30,000-character chunks, to stay
  under Excel's 32,767-character cell limit
- `Schedule_Data` — the entries as real rows, 25 columns

The schedule is deliberately **not** in the JSON blob; it lives in
`Schedule_Data` and is reconstructed from there by `restoreFromSaveFile`. A file
is recognised as a Save+ by the presence of an `_app_state` sheet, and restores
immediately rather than going through the parse preview — it is already the
user's own state.

Round-trip is complete except for the SA-timezone columns and per-entry notes,
which are written to the sheet but not read back.

## Undo

`_undoStack` is in memory only — it does not survive a reload. Each restore
point deep-clones the whole of `S`, entries included, so the stack is capped
lower as the roster grows (20 restore points normally, down to 3 above 20,000
entries). `S.changeHistory` — the labels — *is* persisted, so after a reload the
UI can list restore points whose payloads are gone; selecting one reports that
it is no longer available.
