# Sync Org Layer: plan

Status: planning. Nothing in this file is built yet. Update it as phases land.

Sync today is one person's workspace, synced as one blob per account. This plan adds an org
layer on top: agents, team leaders (TLs), managers and ops working in the same organisation,
each seeing their own slice of it, with changes flowing between them.

---

## 0. Decisions locked

| # | Decision | Consequence |
|---|---|---|
| 1 | Shared cloud storage of staff data is allowed | Supabase holds the shared org data. The file-based transport is kept only as an export and backup. |
| 2 | Anyone from TL upward can edit the org graph, and edits take effect immediately | Every edit is effective-dated, audited, revertible and announced to the leaders it affects. |
| 3 | Everyone signs in with Google, agents included | An account is linked to a person by email. A TL or Ops user enters the email on the person record. |
| 4 | Managers can edit everything in their scope | Sharing through packets alone is not enough. Schedules must be **shared rows** that several people edit, protected by version checks. |

Context: a UK BPO. Staff are South African and work in South Africa. The client's day runs on UK
time; staff live on South African time (SAST). Both clocks matter, on every screen.

### What decision 4 changed

The first sketch had managers reading only what TLs chose to send (packets). Once managers can
edit everything in scope, schedules and org data must live in shared tables everyone in scope
reads and writes. Packets remain, but only for things that are messages by nature: reports,
requests, notices and acknowledgements.

---

## 1. Three classes of data

This is the rule every feature follows.

| Class | Rule | Where it lives | Examples |
|---|---|---|---|
| **Live** | Facts someone will act on within the hour. They save immediately and appear on other screens within seconds. | Org tables, delivered in realtime | Sick or late report, attendance, acknowledgements, request decisions, org edits, acting cover, edits to a published shift |
| **Published** | Plans that need a person's sign-off before others rely on them. Drafted in private, then pushed deliberately. | Workspace draft first, then org tables on Publish | Next period's schedule (rota), roster file imports, overtime (OT) plans, end-of-day (EOD) reports |
| **Private** | A person's own thinking. Never leaves them unless they share it. | Personal workspace blob (exists today), or the notes table with `visibility=private` | TL scratch notes, draft coaching notes, planner scenarios, an agent's private notes |

A note moves from private to shared by changing its visibility, not by being copied. There is
never a second version of the truth.

---

## 2. Live or manual push, entity by entity

| Entity | Written by | Visible to | Mode | Notifies |
|---|---|---|---|---|
| Org graph (person, reporting line, team, department) | TL, manager, ops, admin | Everyone in scope. An agent sees only their own leader chain. | **Live** | Leaders who gain or lose a person, and the person who moved |
| Acting cover / YAT assignment | TL and up | Everyone in scope, and the affected team's agents | **Live** | The acting person, the person being covered, and that team's agents |
| Schedule, draft period | TL, manager, ops | Other editors only (shown hatched as "Draft"). Agents never see drafts. | Private until published | Nobody |
| Schedule, publish | TL, manager, ops | Everyone in scope, and the agent (their own rows) | **Manual push** with a change preview | Every agent whose rows changed |
| Schedule, edit to a published row | TL, manager, ops | Same as publish | **Live** | The agent, if the date is within the next 14 days. The row's other editors, always. |
| Roster file import (Schedule Library) | Ops, TL | Ops, and the department's managers | **Manual push**: parse, preview gate, change preview, publish | The TLs of teams whose rows changed |
| Attendance (present, late, sick, absent, left early) | The agent (self-report), or the TL (marks it) | TL chain, ops (RTA), HR. Reason text: TL chain and HR only. | **Live** | The TL immediately. Ops real-time board. |
| Leave, OT, swap or availability request | Agent, or a TL on the agent's behalf | The agent and their TL chain | **Live**. A request is submitted at once. | The effective leader (acting cover respected); escalates if not decided in time |
| Request decision | The effective leader, a manager, or ops | The agent and their TL chain | **Live** | The agent |
| Notice / directive | TL and up | The chosen audience (a person, team, department or all in scope) | **Live** | The audience. An unacknowledged notice badges until acknowledged. |
| Acknowledgement | Any recipient | The sender and their chain | **Live** | The sender (as a count) |
| Coaching note | TL and up | Author only, until visibility changes to `manager` or `subject` | Private, then a visibility flip | Whoever it is shared with |
| EOD report | TL (or acting TL) | Manager chain | **Manual push**, prefilled from live data | The manager's digest updates |
| OT plan | TL, manager, ops | Scope | Draft, then **manual push** | Agents chosen for OT |
| Analytics and fairness scores | Calculated | TL and up. Never shown to agents. | Calculated on screen from live data | — |

Rule of thumb: **anything an agent will act on today is live; anything that changes many
people's plans is pushed deliberately, with a preview.**

---

## 3. Roles and permissions

`scope` is the set of people a role can see, calculated per user per date (section 4).

| Capability | Agent | TL / acting TL / YAT | Manager / CCL | Ops (WFM / RTA) | HR | Admin |
|---|---|---|---|---|---|---|
| Own schedule, own requests, own notes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read schedules in scope | self only | own team, plus teams they are acting for | their whole reporting tree | department(s) | department(s) | all |
| Edit and publish schedules in scope | — | ✓ | ✓ | ✓ | — | ✓ |
| Edit org graph | — | ✓ (whole department) | ✓ | ✓ | ✓ | ✓ |
| Assign acting cover | — | ✓ (own team) | ✓ | ✓ | ✓ | ✓ |
| Decide requests | — | ✓ (own team, or acting) | ✓ (overrides) | ✓ | leave only | ✓ |
| Mark attendance | self-report | ✓ | ✓ | ✓ | — | ✓ |
| See absence *reasons* | own | own team | tree | — | ✓ | ✓ |
| Send notices | — | to own team | to their tree | to department(s) | to department(s) | all |
| HR lens (absence patterns, leave balances) | — | — | read, their tree | — | ✓ | ✓ |
| Invite users, map email to person | — | own team | tree | ✓ | ✓ | ✓ |
| Audit log | — | own edits | tree | department(s) | department(s) | all |

"TL can edit the whole department's org graph" is decision 2 taken literally. Guard rails:
- Every edit is effective-dated.
- Every edit writes an audit row with the values before and after.
- Moving someone out of another leader's team notifies that leader.
- Any edit can be reverted in one click from the audit log.

---

## 4. Scope resolution and acting cover

One server function, `visible_people(user, date)`, decides scope. The row-level security rules
(RLS: the database only returns rows a user may see) and the app both call it, so the screen and
the database can never disagree.

```
scope(user, date) =
    { user.person }
  ∪ descendants(user.person, date)             -- reporting lines in effect on that date
  ∪ ⋃ descendants(a.for_person, date)          -- for each acting cover the user holds on that date
  ∪ department_people(user)                    -- ops / hr / admin roles only
```

This is the prototype's `_scopePeople` loop (repeatedly adding people until nothing changes),
keyed on `person_id` instead of name and made date-aware.

| Scenario | How it is modelled | What people see |
|---|---|---|
| TL on leave; a YAT or senior agent covers | `acting_assignments(person, role='TL', for_person=TL, starts, ends, label='YAT')` | The acting person gets the TL's scope for those dates only. Agents see "Acting TL: X (covering Y) until 7 Oct". Requests go to X. |
| Agent seconded to another team for 2 weeks | A new reporting line with `effective_from/to`; the home line resumes afterwards | The new TL has edit rights during the window. The home TL keeps read access to the agent's history. |
| Manager covers another manager | An acting cover at manager level | Scope is merged for the window |
| Joiner | Person created with `status=Active`, `start_date` | No rows before the start date. An invite goes to their email. |
| Leaver | `status=Leaver`, `end_date` | Future rows removed at publish. History kept. Sign-in revoked the day after. |
| Team split or merge | Reporting lines moved in bulk with one effective date | One audit batch, which can be undone as a unit |
| Agent with no leader | Reporting line missing | Flagged on the Ops data-quality list and shown as "No reporting line" in the Schedule Window. Never shown as a blank. |
| Agents follow the TL's rota (the Claims pattern) | Rows are written at publish with `source='inherited'` and `source_leader` | Agents see real rows. Provenance says "from TL rota". Nothing is filled in by guesswork at display time. |
| Two TLs share a team | One primary reporting line, plus a `co_leader` edge | Both have the TL scope. Requests go to the primary. |

---

## 5. Surfaces

There are four surfaces, built from shared components. Desk, Bridge and Ops are views inside
`index.html`, and which of them a user gets depends on their role. The agent surface is a
separate lightweight build (section 11).

### 5.1 Sync Me (agent, phone first)

Purpose: the agent's own schedule on SA time, and a fast channel to their TL.

```
┌───────────────────────────────┐
│ Sync Me        Gugulethu M.  ⚙ │
├───────────────────────────────┤
│ TODAY · Fri 25 Sep            │
│ 11:30 – 20:00 SA   (10:30 UK) │
│ Late shift · starts in 2h 10m │
│ TL: Sharon Moyo               │
│ [ I'm sick ] [ Running late ] │
├───────────────────────────────┤
│ INBOX (2)                     │
│ ● Team huddle moved to 11:45  │
│   Sharon · needs ack  [ Ack ] │
│ ○ Oct rota published          │
├───────────────────────────────┤
│ MY SCHEDULE      Sep ▾  SA|UK │
│ M  T  W  T  F  S  S           │
│    1  2  3  4  5  6           │
│    L  L  L  L  E  —           │
│ …                             │
│ Next off: Sun 27 Sep          │
├───────────────────────────────┤
│ REQUESTS            [ + New ] │
│ Leave 12–14 Oct  ● Pending    │
│ OT Sat 3 Oct     ✓ Approved   │
├───────────────────────────────┤
│ My notes (private)            │
└───────────────────────────────┘
```

| Section | Content | Mode |
|---|---|---|
| Today card | Shift in SA time first, UK time underneath; shift type; countdown; current leader, acting cover included | Live |
| I'm sick / Running late | One tap, optional minutes or note. Writes attendance. Offline: the button says "Not delivered, call your TL" until it is sent. | Live |
| Inbox | Notices and directives, acknowledge button, published-rota alerts, request decisions | Live |
| My schedule | Schedule Window (self): month list plus mini calendar, SA/UK toggle, next day off, provenance tag per row | Published rows only |
| Requests | New leave / OT wish / swap / availability. A timeline per request: Submitted → Seen → Approved or Declined, with a comment. | Live |
| My notes | Private notes, synced across the agent's own devices | Private |

An agent never sees: other agents' leave reasons, coaching notes, fairness or health scores,
drafts, or anyone else's attendance. For swaps, an agent sees only teammates' **shift code** on
the chosen date.

### 5.2 Sync Desk (TL)

Purpose: today's Sync, connected to the org. Every current view stays. These are added:

```
┌ Desk ─ Sharon Moyo · Claims / Team 3 ──────────── ● LIVE ─ Inbox 4 ─ Publish ▾ ┐
│ DAY BOARD · Fri 25 Sep                                                          │
│ ┌──────────────┬──────────┬──────────┬─────────────┬───────────────────────┐   │
│ │ Agent        │ Shift UK │ Shift SA │ Status      │                       │   │
│ ├──────────────┼──────────┼──────────┼─────────────┼───────────────────────┤   │
│ │ Gugulethu M. │ 10:30-19 │ 11:30-20 │ ● Present   │                       │   │
│ │ Sivuyile K.  │ 09:00-17 │ 10:00-18 │ ▲ Late 15m  │ self-reported 09:52   │   │
│ │ Linolan M.   │ 08:00-16 │ 09:00-17 │ ✚ Sick      │ note req'd (3rd in 8w)│   │
│ │ Larissa B.   │ —        │ —        │ Leave (AL)  │                       │   │
│ └──────────────┴──────────┴──────────┴─────────────┴───────────────────────┘   │
│ Coverage today (UK):  08 ▂▃▅▆▆▇▇▆▅▃▂ 19     min 6 · low 17:00-18:30          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ INBOX                               │ OUTBOX                                    │
│ Leave · Gugulethu · 12–14 Oct       │ Oct rota · DRAFT · 14 changes [Publish…]  │
│   Tue 13: 6/9 working (min 7) ⚠     │ EOD report · due 19:30   [Submit EOD…]    │
│   [Approve] [Decline] [Ask]         │ Notice to team            [Compose]       │
│ Directive from Manager: "…"  [Ack]  │                                           │
│ Org: Sharon M. moved to you 1 Oct   │                                           │
└─────────────────────────────────────┴───────────────────────────────────────────┘
```

| Addition | What it does | Mode |
|---|---|---|
| Day board | The team today: planned shift in UK and SA time, attendance, self-reports, a sick-note flag, a coverage strip | Live |
| Inbox | Agent requests (showing coverage impact), manager directives, org changes that affect this team, overdue badges | Live |
| Publish rota | Preview of changes by agent (added, removed, moved); on confirm, rows publish and the affected agents are notified | Manual push |
| Submit EOD | Prefilled from live data using the existing `copyEOD` logic; the TL adds three short fields (wins, issues, needs) and the result is frozen as a snapshot | Manual push |
| Notice composer | Audience, body, "requires ack", optional send-later, expiry | Live |
| Schedule Window | Any agent in scope, from the People view or the command palette | Live and published |
| Org panel | This team's part of the org chart, acting cover ("I'm off 3–7 Oct: X covers"), invite by email | Live |
| Note visibility | Each agent note gets a Private / Manager / Agent switch | Visibility flip |

### 5.3 Sync Bridge (manager / CCL)

Purpose: every team in the manager's tree on one screen, with the right to edit anything in it.

```
┌ Bridge ─ Claims · 6 teams · 58 people ─ Fri 25 Sep ─ ● LIVE ─ Approvals 3 ─ Digest 4/6 ┐
│ LEADER GRID                                                                              │
│ ┌─────────────────────┬────┬─────┬──────┬──────┬───────┬────────┬──────────┬──────────┐ │
│ │ Leader              │ HC │ Sch │ In   │ Sick │ Leave │ Req ⏳ │ Rota     │ EOD      │ │
│ ├─────────────────────┼────┼─────┼──────┼──────┼───────┼────────┼──────────┼──────────┤ │
│ │ Sharon Moyo         │ 10 │  8  │ 6 ▲1 │  1   │   1   │ 1      │ Oct pub  │ —        │ │
│ │ Zanele D. (acting)  │  9 │  9  │ 9    │  0   │   0   │ 0      │ Oct DRAFT│ ✓ 18:40  │ │
│ │ Thabo N.            │ 11 │ 10  │ 7    │  2 ⚠ │   1   │ 3 ⚠ 26h│ Oct pub  │ —        │ │
│ └─────────────────────┴────┴─────┴──────┴──────┴───────┴────────┴──────────┴──────────┘ │
│ COVERAGE (UK, 30-min)      08:00 ────────────────────────────── 19:00                   │
│ Team 1 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░    Team 2 ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  …  (red = below min)    │
├───────────────────────────────┬────────────────────────────────────────────────────────┤
│ SCHEDULE WINDOW  [person ▾]   │ APPROVALS · DIRECTIVES · DIGEST                        │
│ (same component as Desk)      │ Leave 8 days · Thabo's team · over cap ⚠ [Decide]      │
│                               │ [Compose directive]  [Open daily digest]               │
└───────────────────────────────┴────────────────────────────────────────────────────────┘
```

| Panel | Content | Mode |
|---|---|---|
| Leader grid | One row per effective leader (acting cover shown). Headcount, scheduled, present, sick, leave, requests waiting (oldest age), rota state (published or draft, for which period), whether today's EOD is in. Click a row to open that team's Day board with full edit rights. | Live, calculated |
| Coverage heatmap | Teams × 30-minute slots on UK time (the client's service levels), SA time on hover; below-minimum slots in red | Live, calculated |
| Schedule Window | Anyone in scope | Live |
| Approvals | Escalations: requests past their time limit, over the leave cap, long leave, OT over budget | Live |
| Directives | Compose to leaders, teams or everyone in scope; acknowledgement counts per team | Live |
| Daily digest | Collates EOD reports (section 8) | Manual push from TLs, collated automatically |
| Edit anything | Any cell, request or org node in scope. Every edit is stamped "edited by <manager> <time>". | Live |

### 5.4 Sync Ops (WFM, RTA, HR, admin)

Purpose: the department and cross-department layer, where schedule files and the org chart are
owned. (RTA = the real-time analysts who watch attendance through the day.)

| Tab | Content | Mode |
|---|---|---|
| Schedule Library | Every linked schedule file per department: file, owner, priority rank (`authority_rank`), last import, row count, parse quality, unchanged-file check. Re-import runs parse, preview gate, change preview and publish. | Manual push |
| Org Builder | Lanes GM → CCL/Manager → TL → Agent (from the prototype), drag a person to another parent, effective date on save, acting/YAT register, organogram import (`parseOrganogramWB`) | Live |
| Data quality | People without a leader, agents without an email (so they cannot sign in), duplicate names, people scheduled but not in the org chart, leavers with future rows | Live, calculated |
| Real-time board (RTA) | All departments today: scheduled against present per 30-minute slot, live stream of attendance events, late starters not yet reported | Live |
| Planning | Coverage against required staffing per department and slot; leave caps per team per day; OT and voluntary time off planning across teams | Draft, then publish |
| HR lens (HR and admin only) | Absence log and patterns (spells, Monday/Friday, sick-note rule flags), leave taken by type, history of acting cover and org changes | Live, calculated |
| Admin | Users (Google email ↔ person), roles, invites, audit log, retention settings | Live |

---

## 6. Shared components

Build each once and reuse it everywhere. Most come from the Ops Hub prototype.

| Component | Used in | Source |
|---|---|---|
| **Schedule Window**: one person, a date range, UK and SA columns, status tag, provenance, next day off | Me, Desk, Bridge, Ops | Prototype `renderScheduleWindow` (fix before porting, section 7) |
| **Mini calendar**: the month grid with a shift code per day | Me, Desk, Bridge | Prototype `renderScheduleMonitor` |
| **Scope chip**: department · leader · person · period, limited to the viewer's scope | Desk, Bridge, Ops | Prototype `refreshHubOptions` |
| **Leader grid row** | Bridge, Ops | Prototype leader watch rows, extended |
| **Day board** | Desk, Bridge (drill-down), Ops RTA | New |
| **Request card**: request plus coverage impact, with Approve / Decline / Ask | Desk, Bridge, Ops | Prototype `_leaveRequestCard` and `_leaveImpact` |
| **Provenance badge**: import file / manual edit by X / from TL rota / acting | Everywhere a shift appears | New |
| **Freshness badge**: ● Live · Published <time> by X · Draft | Every panel header | New |
| **Org lanes** | Ops, Desk (own team only) | Prototype `renderOrgBuilder` |
| **Change preview**: added, removed and moved rows before publishing | Publish rota, re-import, bulk org moves | Existing Sync preview gate, extended |

---

## 7. Display conventions

### Time
- The source of truth is the time the roster shows (UK clock) plus its timezone:
  `start_local`, `end_local`, `tz='Europe/London'`. `start_utc` and `end_utc` are calculated when
  a row is written.
- SA time is **calculated, never stored**, per date. Sync's `u2s(time, date)`
  (`src/app/core/kernel.js`) already applies the UK clock-change dates correctly, so reuse it. Only
  `me.html`, which will not include `kernel.js`, needs its own copy (or `Intl.DateTimeFormat` for
  `Africa/Johannesburg`).
- SA is on UTC+2 all year. The UK is on UTC+1 in summer and UTC+0 in winter. So:
  - SA = UK +1 until 25 Oct 2026
  - SA = UK +2 from 25 Oct 2026 until 28 Mar 2027
  - The prototype's fixed "+1h" label is wrong for five months of every year.
- A shift that ends before it starts runs overnight into the next date.
- Which clock shows first:
  - **Me** shows SA first (where the agent lives).
  - **Bridge / Ops** show UK first (the client's service levels).
  - **Desk** is a toggle; both columns are always visible in the Schedule Window.
- Two holiday calendars are shown: SA public holidays (staff rights; working one needs flagging for
  pay) and UK bank holidays (client demand).

### Status
| Layer | Values |
|---|---|
| Planned | Early / Mid / Late (by start time; the bands are configurable per department, defaults from the prototype's `_cls`), Off, Leave (type), Training, OT, Unavailable |
| Actual (live) | Scheduled (default), Present, Late (minutes), Sick, Absent, Left early, Family responsibility |
| Leave types (SA BCEA defaults, configurable) | Annual, Sick, Family responsibility, Maternity / Parental, Unpaid, Study |
| Record state | Draft (hatched), Published, Edited (dot plus tooltip), Inherited (tag), Acting (tag) |

- One colour per status everywhere, using the existing theme tokens.
- **Never display a missing value as a shift.** No source row means "No row", greyed out and
  flagged.

### Freshness
- Every panel says how current it is: `● Live`, `Published 2 Oct 14:05 · Sharon M.`, `Draft, not
  visible to agents`, or `Offline, last synced 09:12`.

---

## 8. What is sent: the formats

| Message | Fields | Trigger |
|---|---|---|
| **Rota publish** | `period`, `team_id`, rows `{person_id, date, start_local, end_local, tz, code, status, source}`, change summary `{added, removed, moved}`, `published_by` | TL, manager or ops presses Publish |
| **Attendance** | `person_id`, `date`, `status`, `minutes?`, `note?` (reason text: restricted), `reported_by`, `reported_at`, `channel: self/tl/ops` | Agent tap, or TL or ops mark |
| **Request** | `kind: leave/ot/swap/availability`, `person_id`, `dates`, `hours?`, `leave_type?`, `swap_with?`, `reason?` (restricted), `impact` (calculated at submit and again at decision), `status`, `decided_by`, `comment` | Agent submits; leader decides |
| **Notice / directive** | `from`, `audience {person, team, dept, scope}`, `title`, `body`, `requires_ack`, `send_at?`, `expires_at?` | Composer |
| **Acknowledgement** | `message_id`, `person_id`, `at` | Ack tap |
| **EOD report** | `team_id`, `date`, `author` (acting cover respected), frozen `metrics {scheduled, present, late, sick, leave, ot_hours, open_requests}`, `exceptions[]`, `wins`, `issues`, `needs`, `submitted_at` | TL presses Submit EOD |
| **Org change** | `kind: move/role/acting/join/leave`, `person_id`, `before`, `after`, `effective_from`, `actor`, `batch_id` | Any org edit (the audit log records it automatically) |

Requests, notices and EOD reports have a single author and are only ever added to, never changed.
Rows that several people edit (schedule, attendance, people, reporting lines) carry a `version`
number.

---

## 9. Collation

"Collation" means two separate mechanisms:

**1. Live collation (no one presses anything).**
- Bridge and Ops calculate the leader grid, coverage heatmap, RTA board and approvals on screen
  from live rows in scope.
- They are always current; no TL action is needed.

**2. Report collation (TLs push, Bridge merges).**
- TLs submit EOD reports.
- The Bridge digest shows `4/6 submitted`, names who is missing, and merges them into one daily
  view:
  - totals
  - exceptions grouped by type
  - issues and needs listed by team
- The cut-off time is set per department (default 19:30 SA).
- After the cut-off, missing reports show as overdue. The digest can still be exported
  (.xlsx or copy-as-text) with gaps marked.
- The weekly digest comes from EOD snapshots plus live history (reusing `genWeeklyDigest`).

**Across departments (Ops).**
- The Schedule Library feeds each department's published rows.
- The RTA board and Planning read across every department in the ops user's scope.
- Nothing is copied between departments; each keeps its own rows, and Ops reads the union.

---

## 10. Data model (Supabase)

This sits alongside the existing `workspaces` table, which stays as each person's private
workspace.

```
orgs                (id, name, default_tz)
departments         (id, org_id, name, eod_cutoff_local, early_mid_late_bands jsonb)
teams               (id, org_id, dept_id, name, leader_person_id, min_staffing jsonb, leave_cap_per_day)
people              (id, org_id, full_name, email, employee_no, dept_id, role_title, status,
                     start_date, end_date, version, updated_by, updated_at)
reporting_lines     (id, person_id, reports_to_id, kind: primary|co_leader,
                     effective_from, effective_to, version)
acting_assignments  (id, person_id, acting_role, for_person_id, label, starts, ends, version)
org_members         (org_id, user_id, person_id, app_role: agent|tl|manager|ops|hr|admin, status)
invites             (id, org_id, person_id, email, invited_by, accepted_at)
sources             (id, org_id, dept_id, file_name, authority_rank, file_hash, row_count,
                     imported_by, imported_at, quality jsonb)
schedule_rows       (id, org_id, person_id, date, start_local, end_local, tz, start_utc, end_utc,
                     code, status, leave_type, source, source_id, source_leader_id,
                     state: draft|published, version, updated_by, updated_at)
                     unique (person_id, date, state)
attendance          (id, person_id, date, status, minutes, note, reported_by, reported_at,
                     channel, version)
requests            (id, org_id, person_id, kind, payload jsonb, reason, impact jsonb, status,
                     decided_by, decided_at, comment, created_at)
messages            (id, org_id, from_person_id, audience jsonb, title, body, requires_ack,
                     send_at, expires_at, created_at)
message_acks        (message_id, person_id, at)
notes               (id, author_id, subject_person_id, body, visibility: private|manager|subject,
                     created_at, updated_at)
eod_reports         (id, team_id, date, author_id, metrics jsonb, exceptions jsonb,
                     wins, issues, needs, submitted_at)
audit_log           (id, org_id, table_name, row_id, actor_user_id, actor_person_id, action,
                     before jsonb, after jsonb, batch_id, at)
```

- **Row-level security (RLS).** Every table's read rule is
  `person_id in private.visible_people(auth.uid(), current_date)`, with role checks for writes.
  - Restricted text (attendance notes, request reasons) goes through a view that blanks it
    outside the TL chain and HR.
  - `notes` is readable by the author; by the manager chain when `visibility='manager'`; by the
    subject when `visibility='subject'`.
  - Agents read `schedule_rows` only where `state='published'` and the row is their own.
- **Versions.** A trigger bumps `version` on every update, the same pattern as
  `workspaces_bump_version`. Clients write `update … where version = :seen`; zero rows back means
  someone else changed it first, and the app shows a conflict screen instead of overwriting.
- **Audit.** One generic trigger on people, reporting_lines, acting_assignments, schedule_rows,
  attendance and requests writes `audit_log`. Revert means writing `before` back as a new
  audited edit.
- **Realtime.** Supabase realtime change feeds on schedule_rows (published), attendance, requests,
  messages, message_acks, people, reporting_lines and acting_assignments. Security rules apply to
  what each subscriber receives.
- **Scope cache.** `visible_people` uses a recursive query. At BPO scale (hundreds of people) it is
  cheap. If it ever becomes slow, cache the result per user per day.

---

## 11. Client engine and packaging

### How the existing Sync app joins the org
- A Sync project can be **linked to a team** (or teams).
- Importing a roster works as today: parse, preview gate, then the workspace.
- New step: **Publish to org** shows a change preview, then writes `schedule_rows`.
- On open, Desk pulls the linked team's published rows and marks rows edited elsewhere with
  provenance.
- Published rows: the org is the source of truth. The workspace holds drafts, analytics and
  private notes.
- Phase 4 changes one thing: editing a published cell in Desk saves straight to the org (live).
  Future periods not yet published stay drafts.

### Offline behaviour
- Each device keeps a copy of its scoped slice in IndexedDB. NorthStar's `sync-northstar`
  database already exists; add org stores to it.
- Edits made offline go into an outbox and are replayed with version checks on reconnect.
  Conflicts land in the Inbox, never silently.
- Sync Me offline: read-only, except that requests and sick or late reports queue with a loud
  "not delivered" state.

### Packaging
- `index.html` holds Desk, Bridge and Ops as role-based views. They need the heavy engines
  (parsing, analytics, exports).
- `me.html` is a separate build for agents, from its own manifest (`build/manifest.me.json`). It
  leaves out SheetJS, ExcelJS, html2canvas and the pack builder. Target: under 400 KB.
- `build/build.js` must build several outputs, and `--check` must verify all of them.
- `deploy.yml` must publish `me.html` next to `index.html`.
- **Content Security Policy (CSP).** Realtime needs `wss://ifeepocnixqqvayqnnxc.supabase.co`
  added to `connect-src` (`src/head/open.html`). Today only the `https://` origin is allowed, so
  realtime would be silently blocked.

### Sign-in
- Google sign-in (exists). On first sign-in, `org_members` is matched by email against
  `people.email`. If there is no match, the person sees "Ask your TL to add this email", with no
  data exposed.
- Several orgs per user are possible later. For now, one.

---

## 12. Phases

Each phase ships something usable on its own.

| Phase | Deliverable | Done when |
|---|---|---|
| **0: Local track** | The org features built inside Sync with no backend: the L1–L6 items in section 15. | Each L item's own exit test |
| **1: Org foundation** | Migrations: orgs, departments, teams, people, reporting_lines, acting_assignments, org_members, invites, audit_log, `visible_people`, security rules. Ops Org Builder plus organogram import. Invite by email; sign-in links to the person. Data quality list. | Two test users in different teams see only their scope. An org edit writes an audit row and can be reverted. |
| **2: Publish plus read surfaces** | `schedule_rows`, Publish to org with change preview. **Sync Me v1** (Today card, Schedule Window, published rows only). **Bridge v1** (leader grid, Schedule Window, read-only coverage). `me.html` build and deploy. | An agent signs in on a phone and sees their published month in SA time. A manager sees every team in their tree. |
| **3: Live layer** | attendance (sick / late / mark), requests with coverage impact and routing, messages plus acknowledgements, realtime subscriptions, Desk Day board and Inbox, Bridge approvals, escalation times, leave caps | A sick tap on phone A appears on the TL's Day board and the manager's grid within 5 seconds, with no refresh |
| **4: Edit everywhere plus collation** | Direct live edits to published rows by TL, manager and ops, with version conflicts and agent notifications. EOD submit plus the Bridge daily digest (cut-off, missing, merged export). Notes visibility switch. Outbox replay after offline. | Two editors changing the same cell get a conflict screen, not a lost edit. The digest shows 6/6 with the right totals. |
| **5: Ops depth** | Schedule Library across departments, RTA board, Planning (coverage against required staffing, leave caps, OT/VTO), HR lens (patterns, sick-note flags), holiday calendars, web push alerts | Ops sees every department's slot coverage and live attendance on one screen |

Why Sync Me appears in Phase 2 and not earlier: it needs sign-in and security rules to be safe. It
is also the adoption lever. Agents will open an app that shows their shift in SA time and
replaces WhatsApp sick messages.

---

## 13. Risks and open items

| Risk | Mitigation |
|---|---|
| Everyone from TL up editing the org chart causes drift | Effective dates, audit trail, one-click revert, notifications to the leaders affected, Ops data-quality list |
| Two editors change the same shift | Row versions plus a conflict screen, "edited by" stamps, realtime so screens rarely go stale |
| Personal Gmail accounts holding work data | Accepted for now (decision 3). Revisit if the client's policy requires a company account. |
| Absence reasons are health data (POPIA special personal information; UK GDPR special category) | Reason text is restricted to the TL chain and HR by a view; kept only for a set period; never in exports unless the exporter has HR rights |
| Refactoring NorthStar to read from the org | Incremental: new live entities first (attendance, requests, messages have no legacy code), then schedule publish, and live schedule edits last |
| Single-file size | Agent build split out; Desk, Bridge and Ops share `index.html` |
| Realtime blocked by the CSP | `wss://` added in Phase 3 (section 11) |

Open, to decide before the phase that needs them:
- Leave cap and minimum staffing numbers per team (Phase 3). Ops enters them; there is no default.
- Escalation times per request type (Phase 3). Proposed: sick reports immediately to the TL;
  leave 24 h; OT 12 h.
- Whether agents can see teammates' shift codes for swaps (Phase 3). Proposed: yes, codes only.
- How long attendance notes are kept (Phase 4). Proposed: 12 months, then blanked.

---

## 14. Build rules for the local track

Every org feature built inside Sync before the shared org layer follows four rules. They make the
later move to the cloud a change of where data is stored, not a rewrite.

1. **Key records on `person_id`, not on the name.** NorthStar already assigns IDs. New stores must
   not repeat the name-keyed pattern of `S.agentNotes` and `S.agentStatuses`, which only survive a
   rename because `_moveObjectKey` moves them by name.
2. **Give every record dates.** Reporting lines, acting cover and moves carry
   `effective_from/to` or `starts/ends`. Nothing about the org is true forever.
3. **Write into NorthStar's tables** (`people`, `roles`, `acting`, `teams`, `leave`), not into new
   `S.*` stores. Those tables map one-to-one to the tables in section 10.
4. **Send every change through one function per entity**, such as `orgMovePerson(...)` or
   `actingAssign(...)`. That function records the change in a local log (with undo) and, later,
   becomes the API call plus the server audit row.

## 15. Local track: what to build in Sync first

### Already in Sync (do not rebuild)

| Area | What exists |
|---|---|
| NorthStar Organisation page | People and roles table, an indented read-only organogram, person editor, acting editor (role, acting-for, start, end), coverage-ready leadership panel |
| Role labels | YAT, Acting Leader, Supervisor, Acting Supervisor, Senior Agent, Floor Support, Trainer, SME (`PEOPLE_ROLE_LABEL_OPTIONS`) |
| Agent drawer | Today's status buttons, **this week only** (following the TL's rota), notes |
| Time | `u2s` with correct UK clock-change handling; SA/UK setting (`S.tz`) |
| Holidays | SA public holiday engine, 2023–2030 |
| Departments | One workspace per department, plus a universal workspace that merges them |
| Exports | Schedule cards PNG/zip, TL Day Pack, EOD copy, weekly digest, "what changed since last time" |

### Gap found while checking: acting cover forgets its dates

- `nsOpenActingEditor` stores `starts` and `ends`.
- The step that copies acting cover into the runtime people records (`northstar.js.html`, around
  line 1393) keeps only a permanent `Acting Leader` label and `acting=true`.
- Result: anyone who acted once is labelled acting in every view, forever. Their team's leader
  never changes for the acting window.
- Fixed in L2: neither the editor save nor the runtime copy adds the label any more, and a stored
  one is hidden for anyone who has dated cover.

### L1: Schedule Window, plus sharing it with agents

**Status: built.** `src/app/views/schedule-window.js`, tested in `tests/schedule-window.spec.js`.
Found while building it:
- `u2s` compared the date's midnight with the 01:00 changeover, so every shift on the two
  changeover Sundays got the old offset (for example, 25 Oct 2026 at 09:00 UK showed 10:00 SA
  instead of 11:00). Fixed in `kernel.js`. Rows imported before the fix keep their stored
  `saS`/`saE` in the older views until they are re-imported; the Schedule Window always
  recalculates.
- The CSV parser turns a **blank** cell into `OFF`. So "No row" appears only where the source has
  no row at all: dates outside the roster, or people missing from it. Whether a blank cell should
  mean "no row" is a parser decision, left for later.

The stand-alone viewer for one person.

| Part | Spec |
|---|---|
| View | Any one person, any range (a month, several months, or custom dates). Columns: date · day · UK in/out · SA in/out · status · provenance. Next day off. SA public holidays marked. |
| Mini calendar | A month grid with a shift code per day, beside the table (from the prototype's `renderScheduleMonitor`) |
| Header | Name, team, **leader on that date** (acting-aware once L2 lands), role labels |
| Provenance | Source file · from TL rota · blueprint fix · manual edit. A date with no source row shows `No row` (grey and flagged), never a guessed shift. |
| Entry points | People row action, "Full schedule" in the agent drawer, command palette (`Schedule: <name>`), Day view person click |
| Compare | A second person side by side, for checking swaps and cover |
| Share | PNG of the month in SA time (reusing the `expSingleCardPNG` pipeline), copy-as-text for WhatsApp, zip for the whole team, stamped "Sent <date> by <TL>" |
| Changes since last send | Per agent, using `change-tracking.js`: "3 days changed since you last sent this" |
| Exit test | A Playwright spec covers: the 24/25/26 Oct 2026 clock change, a missing row, a row following the TL's rota, an overnight shift, the SA/UK setting, a PNG export |

Why first: it stands alone, it becomes the shared component for every later surface, and the Share
row gets agents their schedule in SA time before Sync Me exists. The change preview built here is
the same one Phase 2's cloud publish needs.

### L2: Acting cover and a YAT register, with dates

**Status: built.** Engine: `src/app/people/cover.js`. View: People → Cover (`src/app/views/cover.js`).
NorthStar exports `nsActingRows` and `nsSaveActingCover`. Tested in `tests/cover.spec.js`.
Decisions made while building it:
- An agent who follows their TL's rota does not inherit the TL's leave or sickness. Those dates
  show "TL away" (a gap), because the team still works but the source has no shift for them.
- "Needs cover" means a leader with a team is on leave, sick or training (roster marker, logged
  exception or People status) on a date with no active cover. Regular days off are not gaps.
- Suggestion rank = availability 45 + hours overlap with the leader's last shift 20 + fairness
  (fewest acting days in 6 months) 15 + on the team 10 + YAT/Senior Agent/Supervisor 10, minus
  10 for leading their own team and 30 if already booked on those dates.
- Undo is per record ("End today", "Cancel"), not a global undo. Every change is staged in
  NorthStar's publish queue.

| Part | Spec |
|---|---|
| Date-aware acting | `actingOn(person_id, date)` and `leaderOn(person_id, date)` replace the boolean flags. Labels show only inside the window. States: upcoming, active, ended. |
| Views follow cover | During the window, the Team view, Day view and Schedule Window header show "Led by X (acting for Y)" |
| Cover prompt | When a TL has leave or is off, show "Team 3 has no leader on Tue 13 Oct: assign cover?" |
| Cover suggestions | Rank YAT and senior agents by: shift overlap with the absent TL on those dates · not on leave or off · fewest acting days so far (spreading development fairly) · same department |
| YAT register | Pool list, days acted, teams covered, last acted, readiness notes |
| Clash rules | Two people acting for the same leader on the same dates · the acting person on leave or off inside the window · acting cover with no end date |
| Exit test | An acting window of 3–7 Oct: the label and leader change on 3 Oct and revert on 8 Oct; a clash is flagged |

### L3: Org Builder (visual) and org data quality

**Status: built.** People → Org (`src/app/views/org.js`), engine `src/app/people/org.js`. NorthStar
has two new department tables, `reportingLines` and `orgChanges`, and exports `nsOrgLines`,
`nsOrgChanges`, `nsOrgMove`, `nsOrgSetRole`, `nsOrgImport` and `nsOrgUndo`. Tested in
`tests/org.spec.js`. How it works:
- **Reporting lines are dated.** The first dated move writes a line for the leader someone had
  before (open start, ending the day before), so history before the move does not change. A
  move from today or earlier also updates the person record straight away. A future move leaves
  People on the old leader until that day; the NorthStar people sync switches it on the day.
- **Every change stores its own undo steps**, so a batch (a bulk move, an import) undoes as a
  unit. Undo is blocked while a newer, not-undone change touches the same people.
- **A leader change from the People views** (Team assign, add agents) on someone who already has
  dated lines becomes a dated move from today, logged as "People view", so the next sync does not
  put the old leader back.
- **Moves that would make a loop are refused.** Someone cannot report to a person already below
  them on that date.
- **Organogram import** reads the first sheet that looks like an org sheet: Name + Reports To
  (or Line manager / Team leader / Leader / Supervisor / Manager) + optional Role. It adds
  missing people, previews the changes, and applies them as one change from the chosen date. A
  blank "reports to" leaves that person's leader alone.
- **Lanes are decided by role:** General Manager, Head of or Director; then Manager or CCL; then
  Team Leader, Leader, Supervisor or TL, or anyone with reports; everyone else is an agent.

| Part | Spec |
|---|---|
| Lanes | GM → Manager/CCL → TL → Agents (from the prototype's `renderOrgBuilder`), next to the existing table and tree |
| Move | Select, then "Move to…" (drag and drop later), always with an **effective date**. Schedule history before that date stays with the old leader. |
| Bulk | Move several people at once (team split or merge) as one entry in the change log, undone as one |
| Structure | Span of control per TL (agents per leader), vacancies (a team with no TL), an unassigned tray |
| Organogram import | A plain sheet with Name / Role / Reports To columns (the prototype's `parseOrganogramWB`), alongside the existing peoplehub import |
| Data quality list | No leader · scheduled but missing from the org · in the org but never scheduled · near-duplicate names (NorthStar aliases) · TL with no team · leaver with future shifts |
| Change log | Every move and role change: who, when, the value before and after, the effective date, with undo |
| Exit test | Moving an agent from 1 Oct shows the old leader on 30 Sep and the new one on 1 Oct; bulk undo restores both |

### L4: Scope bar

**Status: built.** `src/app/people/scope.js`, tested in `tests/scope.spec.js`.
- **Where it sits:** in the toolbar, before the person pill. Department (only when the data has
  more than one), then leader as a tree (GM → managers → TLs, with how many people are under
  each; people acting that day are listed under their own leader, marked "acting"), then a
  "N in scope ✕" chip that clears it.
- **What it includes:** the leader plus everyone below them on the scope date, plus the team of
  anyone they are acting for that day. The scope date is today inside the month on screen,
  otherwise that month's first day, so a dated move shows up in the month it starts.
- **How views follow it:** it is applied in `activeLeaderFilter()`, so everything built on
  `gD` / `gE` / `gN` follows (Cards, Table, leader lists, exports), plus the calendar (month grid,
  Day and Week lists, Share day), People (Team, Agents) and Cover. The person pill narrows inside
  the scope.
- **Not scoped yet:** Ops analytics, Home intel and capacity history read entries directly and
  still show the whole project. The chip's tooltip says so. The Org builder shows the whole org on
  purpose.
- **Storage:** one scope per project in `sc_scope`, synced with the other local stores.

- One bar in the header: department · leader (includes everyone below them) · person · period.
- Every view respects it; it persists per workspace.
- It replaces the per-view team and person filters.
- The leader filter covers the whole tree: choosing a manager includes all their TLs and those TLs'
  agents.
- It is the local version of the server's `visible_people` function (section 4), with the same logic.

### L5: Leaders board (a local version of Bridge)

**Status: built.** People → Leaders (`src/app/views/leaders.js`), tested in
`tests/leaders.spec.js`.
- **Rows:** one per team on the chosen date: anyone leading at least one agent. Managers who lead
  only team leaders do not get a row.
- **Columns:** who leads the team that day (acting cover shown), headcount, working (with how
  many are marked present), sick, leave, off, no shift, leave in the next 7 days, open flags.
- **How each person's day is decided:** in order, sick (People status sick or AWOL, a sick or
  no-show exception, or a SICK roster marker); then leave (People status, a leave marker, or an
  annual-leave, family or training exception); then the rota (working or off); otherwise no
  shift.
- **Thin:** fewer than half the team, or fewer than the project's minimum coverage, is working.
- **No cover:** the leader is sick or on leave and nobody is acting for them.
- **Sort:** by needs attention (no cover, then thin, then sick, then no shift), by name, or by
  team size. The board follows the scope bar.
- **Actions:** the team name opens People → Team; **Day** opens the calendar Day view scoped to
  that leader.
- **Not tested yet:** the universal workspace (every TL's file loaded together). People there
  carry their department and the board adds a Dept column, but no spec exercises it.

- One row per leader who is **effective today** (acting cover included).
- Columns: headcount · working · leave · off · sick (from `agentStatuses`) · a thin-cover flag
  against the minimum set in `S.covMin` · leave in the next 7 days · open flags.
- Clicking a row opens that team's Day view.
- It works in the universal workspace, so a manager who loads every TL's file into Sync gets
  Bridge today, with no backend.
- This tests the Bridge design on real files before Phase 2.

### L6: Leave and absence register, plus UK bank holidays

| Part | Spec |
|---|---|
| Leave types | SA BCEA defaults: Annual, Sick, Family responsibility, Maternity/Parental, Unpaid, Study. Configurable. |
| Sick-note flags | More than 2 consecutive days, or a 3rd occasion within 8 weeks (BCEA s23). These are flags, not decisions. |
| Patterns | Absence next to a weekend or public holiday, Monday/Friday clustering (extending `patterns.js`) |
| UK bank holidays | Shown alongside SA public holidays: client demand in the UK against staff rights in SA |
| Access | Reasons and patterns sit behind a "sensitive" setting and are left out of exports unless explicitly included |

### Not built locally: wait for the org layer

Requests and approvals, notices and acknowledgements, self-reported attendance and EOD collation all
need a second person on another device. A local version would be a fake.

The universal workspace already covers collation across departments, so a separate file-pack
format is dropped.

### Order

| # | Item | Depends on | Size |
|---|---|---|---|
| 1 | L1 Schedule Window + Share | — | M |
| 2 | L2 Acting and YAT, with dates | — (L1's header uses it) | M |
| 3 | L3 Org Builder + data quality | L2 | L |
| 4 | L4 Scope bar | L3 (leader tree) | M |
| 5 | L5 Leaders board | L4 | S |
| 6 | L6 Leave/absence + UK holidays | — | M |
