# Operations audit

An audit of the Operations tab looking for features that are **spoken about but
not fully implemented** — specifically for controls that claim to have done
something they did not, which is the signature every defect fixed in v65 shared.

Method: load `tests/fixtures/r_80x31.csv` (80 people × 31 days, a normal roster
import — not a native SyncSheets workbook) through the real UI, enumerate every
control in the `#ca` content container, trace each handler in `src/`, verify
persistence across a reload, and click every export to check the file is
non-empty and well-formed. A download event on its own is not evidence — A2
below downloaded a file containing nothing.

## Summary

| Surface | controls | chars | nodes | verdict |
|---|---|---|---|---|
| Dashboard | 176 | 4.2k | 1,145 | wired |
| Workspace | 1 | 0.9k | 86 | read-only port map |
| Schedule Window | 83 | 3.0k | 506 | wired |
| Coverage | 235 | 8.8k | 2,786 | wired |
| Blueprint | 120 | 2.9k | 713 | wired |
| People & Org | 183 | 13.3k | 2,091 | wired |
| Absence | 10 | 0.2k | 20 | **was broken — A1, fixed in v66** |
| Alerts | 1,173 | 77.5k | 6,765 | wired, unbounded — **A3, open** |
| Data | 19 | 32.5k | 5,549 | wired |
| Export Centre | 14 | 1.3k | 75 | wired — **A2 fixed in v66** |
| Decisions | 2 | 7.6k | 497 | read-only list, action via Issue Inbox |
| Handoff | 3 | 0.2k | 19 | wired |

**The Operations surface is not decorative.** Every destination renders real
content for an ordinary roster, and the governance machinery behind it works:
Export Centre produces genuine files from 8 of its 9 handlers, the Issue Inbox
records decisions that survive a reload, and People & Org, Coverage, Blueprint
and Schedule Window are all fully wired.

## A1 — Absence ignored every absence in the roster *(fixed, v66)*

`rAbsenceBreakdown(y,m,monthEnt)` in `src/app/views/flags.js` built its entire
view from `effExc()` — manually logged exceptions and leave requests — and
**never used its `monthEnt` parameter**, which holds the month's actual entries.

The parser classifies every off-day it reads (`classifyOff`,
`src/app/core/kernel.js`) into `OFF`, `LEAVE`, `SICK`, `PH`, `TRAINING`, `WFH`.
On the audit fixture it produced **305 SICK and 324 LEAVE** days. The Absence
tool reported:

> September 2026 · **0 events · 0h lost**
> No exceptions logged for this month.
> Log events via Calendar → + Flag to populate this view.

The roster stated plainly who was sick and who was on leave, and the tool built
to show absence told the user to type it in by hand.

**Fix.** `deriveRosterAbsences()` maps `SICK → sick`, `LEAVE → annual_leave`,
`TRAINING → training` onto the existing `EXC_TYPES` ids and merges the result
with `effExc()`. `OFF` is a scheduled rest day and `PH`/`WFH` are not absences,
so none of those carry over. Events are keyed by person and date, and a manually
logged exception wins over a derived one for the same day — it carries the real
duration and any note — so nothing is double-counted. Hours lost for a derived
event is the median length of the shifts that person actually works, rather than
zero, which would have reported the events but understated the cost.

The header now states provenance: `614 events · 5219h lost · 614 read from the
schedule`.

After the fix, on the same fixture: **614 events in September** — the roster's
absences split 614 September / 15 October, and the view shows the selected
month, so the arithmetic is exact.

Regression covered by `tests/smoke.test.js` ("absence: roster absences reach the
Absence view"), which fails against the pre-fix build.

## A2 — `nsExportCsv('person')` handed over a 0-byte file *(fixed, v66)*

With no person selected the control is labelled "No person selected", yet
clicking it downloaded `Sync_Person_Schedule_<date>.csv` containing **zero
bytes** — not even a header row — and raised no warning. `nsCsv([])` returns an
empty string and the blob was written unconditionally.

**Fix.** `nsExportCsv` now declines when the scope resolves to no rows, with a
message naming what to do, matching how `nsExportPublishPacket` already handles
its empty case. With a person selected it produces a proper file — verified: 31
lines, `"name","date","start","end","status"` header, person-scoped filename.

## A3 — Alerts renders without bound *(open)*

At 150 people the Alerts surface produces **26,829 DOM nodes, 6,485 buttons, and
takes 2.65 seconds** to render, growing linearly with roster size. On identical
data: Decisions 82ms, Data 333ms, Coverage 568ms.

Cards already solves exactly this with `_virtualizeTableBody` and
`_initCardsAllMonthVirtualization` (`src/app/views/cards.js`). Alerts has no
equivalent.

**Not fixed here.** Virtualising Alerts changes how the surface behaves —
scrolling, find-in-page, export-to-image all interact with it — so it is a
design decision rather than a bug fix.

Recommended, in order of cost:

1. Cap the initial render (say 200 rows) with an explicit "show more", which is
   a contained change and removes the worst of the cost.
2. Reuse the Cards virtualisation for the full fix.

Either way the count should stay honest: if rows are withheld, say how many.

## Observations that are not defects

- **Decisions** lists every open signal with a static "Open" and no per-row
  control, under the heading "every signal should have owner, evidence, status,
  and next action". All action lives behind one "Open Issue Inbox" button, which
  works well — the inbox has per-row Resolve/Dismiss, filters, pinning and notes,
  and decisions persist. The surface implies inline action it does not offer;
  worth revisiting for its own sake, but nothing is broken or lost.
- **Workspace** is a one-control port map summarising the other surfaces. Thin,
  but honest about what it is.
- **`nsExportConflictRules`** exports a valid JSON file reporting "0 conflict
  rules" when none are configured. Empty but well-formed, and it says so.

## Method notes

Two of my own early readings were wrong and are recorded here so the same
mistakes are not repeated:

- Enumerating controls from `#mv` rather than `#ca` picks up the rail chrome and
  misses the panel. Worse, clicking those "controls" navigates away mid-test.
  Modals are appended to `document.body` and carry `data-testid="qol-modal"`.
- `updateIssueInboxItem(id, status)` takes a status **string** (`open`,
  `resolved`, `dismissed`). Passing an object makes it return silently, which
  looks like a broken handler and is not.
