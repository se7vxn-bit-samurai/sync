# Porting these fixes to the real source

**Read this first.** This repository holds a build output. The source lives in
the main project workspace (`7os-sync-northstar.html`, `northstar-core.js`,
`sync-signal-field.js`, `syncsheets-v31.js`, built by
`tests/build_standalone.js`). Anything changed only here is overwritten by the
next deploy.

The fixes below were developed and verified against this repo's `index.html`
before that was understood. They are correct, and **every bug they address is
still live in the deployed app** — verified against `main` at `d086548`. They
need applying to the source files, not here.

Each patch is keyed to a function name rather than a line number, because those
names survive the build. Search the source files for the function; whichever
file contains it is the one to edit.

Full reasoning for each, with measurements, is in `CHANGELOG.md` (v65, v66) and
`docs/OPERATIONS-AUDIT.md`.

---

## 1. Rosters over 13 people collapse to one person

**Impact:** a roster of 14+ people on a calendar month imports as a single
fabricated person — the team header cell — at `confidence:"high"` with no
warnings. 150 people × 90 days loads 59 of 13,500 rows. Threshold is exactly
`people > (days − 5) / 2`.

The parsers are not at fault. `parseWideHoriz` extracts every row and then loses
the scoring vote. Two independent causes, either of which alone is sufficient.

### 1a — `_sheetParserFeatures`: orientation from evidence, not aspect ratio

Find:

```js
const orientation=cols>=Math.max(12,rows*2)?"horizontal":rows>=Math.max(12,cols*2)?"vertical":"";
```

Replace with:

```js
// Orientation says which axis the dates run along. Deciding that from the
// sheet's aspect ratio is wrong: a 31-day month is 32 columns, so a roster of
// more than ~13 people is taller than half its width and gets called
// "vertical" despite every date sitting in a header row. That misread costs
// the horizontal parsers their affinity bonus and hands the file to a parser
// that reads one person. Decide from where the dates actually are, and keep
// the aspect-ratio rule only for sheets that show no date evidence either way.
const horizDateEvidence=maxDatesInRow>=5;
const vertDateEvidence=(firstColDates>=5||firstColDays>=5);
const orientation=(horizDateEvidence&&!vertDateEvidence)?"horizontal"
  :(vertDateEvidence&&!horizDateEvidence)?"vertical"
  :cols>=Math.max(12,rows*2)?"horizontal":rows>=Math.max(12,cols*2)?"vertical":"";
// How many rows look like they belong to a person. Used by _entrySetQuality
// to tell "parsed the whole roster" apart from "parsed one row of it".
let plausibleNameRows=0;
for(let r=0;r<Math.min(rows,400);r++){
  try{if(extractRowPeopleNames(data[r]||[],1).length)plausibleNameRows++;}catch(e){}
}
```

Then add `plausibleNameRows` to the object the function returns, alongside
`orientation`.

### 1b — `_entrySetQuality`: a coverage term

The score has no term for how much of the sheet a parse consumed. Its only size
term saturates near 316 entries, so 59 rows scored within 1.4 points of 13,500 —
a parse finding one person could outrank one finding a hundred and fifty.

Change the signature to accept features:

```js
function _entrySetQuality(entries,features){
```

Find:

```js
const score=completeRatio*35+(1-duplicateRatio)*10+balance*10+(names.size?5:0)+Math.min(5,dates.size/7*5)+Math.min(5,Math.log10(list.length+1)*2)+plausibleRatio*5;
```

Replace with:

```js
const coverage=(features&&features.plausibleNameRows)?Math.min(1,names.size/features.plausibleNameRows):1;
const score=completeRatio*20+coverage*15+(1-duplicateRatio)*10+balance*10+(names.size?5:0)+Math.min(5,dates.size/7*5)+Math.min(5,Math.log10(list.length+1)*2)+plausibleRatio*5;
```

Add `coverage` to the returned object. Weight comes out of `completeRatio`, so
the 75-point ceiling is unchanged and the 82/62/52 confidence bands and the
margin threshold of 4 stay calibrated.

In `_runParserCandidate`, pass features through — it already has them in scope:

```js
const quality=_entrySetQuality(entries,features),affinity=_parserAffinity(parser,features);
```

`features` is optional, so any other caller keeps working.

### 1c — `autoParse`: refuse to call a lossy parse trustworthy

A backstop, so a future scoring change cannot reintroduce this silently. Find
the confidence line and replace:

```js
// Backstop against the failure this scoring layer has already had once: a
// parse that reads a fraction of the people another parser found must never
// be presented as trustworthy, whatever it scored.
const richest=candidates.reduce((a,b)=>b.quality.names>a.quality.names?b:a,best);
const lossy=richest!==best&&best.quality.names*2<=richest.quality.names;
let confidence=best.score>=82&&margin>=4?"high":best.score>=62?"medium":"low";
if(lossy)confidence="low";
const warnings=[];
if(lossy)warnings.push(`${best.parser} read ${best.quality.names} ${best.quality.names===1?"person":"people"} but ${richest.parser} found ${richest.quality.names} on this sheet — most of the roster may be missing`);
```

Note `confidence` becomes `let`.

**Known limitation:** `autoParse` pre-filters candidates with `affinity >= 8`, so
a parser whose affinity is misjudged never runs and this guard cannot see it. The
guard covers mis-ranking among parsers that ran, which is the failure that
actually occurred.

---

## 2. dd/mm/yyyy CSVs are read as American dates

**Impact:** a 28-day September rota imports across twelve months — `01/09/2026`
through `12/09/2026` become January..December the 9th.

CSV carries no cell types, so SheetJS interprets date-looking text itself and
resolves the ambiguity month-first. `pDt()` reads day-first correctly but never
sees the text: it short-circuits on `v instanceof Date`.

Add near `XLSX_STANDARD_READ_OPTS`:

```js
function _isCsvFile(f){
  if(!f)return false;
  const name=String(f.name||f||"");
  if(/\.csv$/i.test(name))return true;
  return /^text\/csv$/i.test(String(f.type||""));
}
function _readOptsForFile(f){
  return _isCsvFile(f)?Object.assign({},XLSX_STANDARD_READ_OPTS,{cellDates:false,raw:true}):XLSX_STANDARD_READ_OPTS;
}
```

In `proc(f,opts)`, change the read:

```js
const wb=XLSX.read(new Uint8Array(e.target.result),_readOptsForFile(f)),sourceMeta=...
```

**`raw:true` is the setting that matters.** `cellDates:false` alone is not
enough — SheetJS's CSV reader still returns `Date` objects. Do not edit
`XLSX_STANDARD_READ_OPTS` itself; that would change the `.xlsx` path, which is
unaffected because its dates are real serials.

---

## 3. Absence ignores every absence already in the roster

**Impact:** on an 80-person roster carrying 305 SICK and 324 LEAVE days, the
Absence view reports "0 events · 0h lost" and tells the user to log them by hand.

`rAbsenceBreakdown(y,m,monthEnt)` builds its view from `effExc()` only and
**never uses its `monthEnt` parameter** — the unused parameter is the tell.

Add before the function:

```js
// The parser already classifies every off-day it reads. Only manually logged
// exceptions used to reach this view, so a month with hundreds of sick and
// leave days reported "0 events". OFF is a scheduled rest day and PH/WFH are
// not absences, so none of those carry over.
const ROSTER_ABSENCE_TYPES={SICK:"sick",LEAVE:"annual_leave",TRAINING:"training"};

// A derived absence has no recorded duration, so charge it the person's usual
// working day rather than zero, which would report the events but leave
// "hours lost" wrong.
function _typicalShiftHours(name){
  const cache=ensureCache();
  cache._typicalHrs=cache._typicalHrs||{};
  if(cache._typicalHrs[name]!==undefined)return cache._typicalHrs[name];
  const hrs=(S.entries||[])
    .filter(e=>e&&e.name===name&&!e.isOff&&e.ukS&&e.ukE)
    .map(e=>calcHrs(e.ukS,e.ukE))
    .filter(n=>n>0&&n<=16)
    .sort((a,b)=>a-b);
  const val=hrs.length?hrs[Math.floor(hrs.length/2)]:8;
  cache._typicalHrs[name]=val;
  return val;
}

function deriveRosterAbsences(monthEnt){
  const out=[];
  (monthEnt||[]).forEach(e=>{
    if(!e||!e.isOff||!e.date)return;
    const type=ROSTER_ABSENCE_TYPES[String(e.offL||"").toUpperCase()];
    if(!type)return;
    const d=e.date instanceof Date?e.date:new Date(e.date);
    if(isNaN(d))return;
    const name=e.name||"";
    out.push({
      date:d.getFullYear()+"-"+P(d.getMonth()+1)+"-"+P(d.getDate()),
      type,person:name,agentName:"",
      hoursLost:_typicalShiftHours(name),
      derived:true,
      note:"Read from the schedule ("+(e.raw||e.offL)+")"
    });
  });
  return out;
}
```

Inside `rAbsenceBreakdown`, replace the `monthExcs` derivation:

```js
const logged=effExc().filter(x=>{
  if(!x.date)return false;
  return x.date.startsWith(monthKey);
});
// A manually logged exception is the better record of the same absence — it
// carries the real duration and any note — so it wins over the derived one
// for that person and date instead of both being counted.
const claimed=new Set(logged.map(x=>(x.person||"")+"|"+x.date));
const derived=deriveRosterAbsences(monthEnt).filter(x=>{
  const key=x.person+"|"+x.date;
  if(claimed.has(key))return false;
  claimed.add(key);
  return true;
});
const monthExcs=logged.concat(derived);
const derivedCount=derived.length;
```

Then state provenance in the subtitle so derived rows are visibly distinct:

```js
const provenance=derivedCount
  ?` · ${derivedCount} read from the schedule${logged.length?", "+logged.length+" logged by hand":""}`
  :(logged.length?" · all logged by hand":"");
```

and append `${provenance}` to the `… events · …h lost` line. The empty state
should also stop telling the user to log absences that are read automatically.

Verified result on an 80×31 roster: **614 events, 5219h lost**, split Leave 315×
/ Sick 299×. (614 September + 15 October = the 629 in the file; the view shows
the selected month.)

---

## 4. Persistence: two of three causes are still live

Upstream has `nsRestoreEntriesFromCanonical()`, which is a cleaner approach than
the one I wrote — it restores whenever `S.entries` is empty rather than
depending on an adoption branch. Keep it. But two gaps remain underneath it:

**4a — `nsIsNewerTimestamp` is strictly-newer.** The IndexedDB and localStorage
copies are written by the same `nsPersist` call and therefore carry the *same*
`updated_at`, so `ta > tb` is false and the database copy is never adopted.
Since the localStorage copy deliberately stores `schedule:[]`, memory then holds
no schedule and `nsRestoreEntriesFromCanonical()` has nothing to restore. In
`nsHydrateDatabase`, also adopt when the stored copy has the rows and the live
one does not:

```js
const current=nsCanonical();
const storedNewer=stored&&nsIsNewerTimestamp(stored.updated_at,current.updated_at);
const storedHasScheduleWeLack=stored&&(stored.schedule||[]).length&&!(current.schedule||[]).length;
if(storedNewer||storedHasScheduleWeLack){S.nsCanonical=nsNormalizeCanonical(stored);nsSanitizeCanonicalIdentities();nsSyncPeopleToRuntime();}
```

*Worth verifying on your side:* the cloud-pull path may set a newer timestamp and
mask this in practice. The mechanism is real either way.

**4b — startup can erase the stored schedule.** `nsQueueDatabaseWrite` has no
guard, and the block's own startup calls `nsPersist()` with a model seeded from
localStorage — i.e. `schedule:[]`. That write lands 180ms into every reload and
overwrites the database record before hydration reads it. Inside the timeout,
before `nsDatabaseWrite`:

```js
// Never let a boot-time write erase a stored schedule before we have read it
// back. A model that actually carries rows always writes.
if(!NS.hydrated&&!(snapshot.schedule||[]).length)return;
```

Set `NS.hydrated=true` in `nsHydrateDatabase`'s `finally` block, so a failed
hydrate does not block writes forever.

**4c — flush on the way out** (optional but cheap). The write is debounced, so a
tab closed just after an import loses it:

```js
function nsFlushDatabaseWrite(){
  if(!NS.dbWriteTimer)return;
  clearTimeout(NS.dbWriteTimer);NS.dbWriteTimer=null;
  try{
    const current=nsCanonical(),snapshot=typeof structuredClone==="function"?structuredClone(current):JSON.parse(JSON.stringify(current));
    if(!NS.hydrated&&!(snapshot.schedule||[]).length)return;
    nsDatabaseWrite(snapshot).catch(()=>{});
  }catch(err){}
}
window.addEventListener("pagehide",nsFlushDatabaseWrite);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")nsFlushDatabaseWrite();});
```

**Also worth knowing:** `_captureUndoSnapshot` deep-clones all of `S` including
`entries`, ×20 restore points. Once sessions resume on load that is live from
page open, not just after an import. Capping the stack on large rosters is
prudent:

```js
const entryCount=(S.entries&&S.entries.length)||0;
const cap=entryCount>20000?3:entryCount>8000?5:entryCount>3000?10:_UNDO_MAX;
while(_undoStack.length>cap)_undoStack.shift();
```

---

## 5. `nsExportCsv('person')` downloads a 0-byte file

With no person selected the control is labelled "No person selected", yet
clicking it still downloads a CSV containing **zero bytes** — no header, no rows,
no warning. `nsCsv([])` returns an empty string and the blob is written
unconditionally. Before the `nsDownloadBlob` call:

```js
if(!rows.length){
  toast(kind==="person"&&!S.nsSchedulePerson
    ?"Choose a person on the Schedule Window first — nothing to export yet."
    :"Nothing to export for "+name.replace(/_/g," ")+".","info",4200);
  return;
}
```

---

## 6. Storage failures are silent

Every `localStorage` write sits in a `try{…}catch(e){}` with an empty catch, so a
full quota discards the write with no toast, no console line, and no indication
anything happened. Add a reporter and call it from the catch blocks in
`_persistSet`, `_persistRemove` and `_flushPersistQueue`:

```js
let _persistQuotaWarned=false;
function _noteStorageFailure(key,err){
  const quota=err&&(err.name==="QuotaExceededError"||err.name==="NS_ERROR_DOM_QUOTA_REACHED"||err.code===22);
  try{console.warn("Could not save \""+key+"\" to local storage:",err);}catch(e){}
  if(_persistQuotaWarned)return;
  _persistQuotaWarned=true;
  try{
    toast(quota
      ?"Browser storage is full — recent changes could not be saved. Export a Save+ file to keep this work."
      :"Local storage is unavailable — recent changes could not be saved. Export a Save+ file to keep this work.",
      "err",8000);
  }catch(e){}
}
```

Once per session rather than per key — a full quota fails on every write and a
toast for each would be unusable.

---

## Fixtures worth taking

`tests/fixtures/` on this branch holds 17 roster fixtures that are build-agnostic
and would drop into the Playwright suite with only the loader changed:

- `t_12` … `t_20` — a people-count sweep across the 13/14 boundary. `t_13` must
  parse fully and `t_14` must too; before the fix `t_14` collapsed to one person.
- `r_20x31`, `r_40x31`, `r_80x31`, `r_40x90`, `r_80x90`, `roster_big` (150×90)
- `x_12x30.xlsx`, `x_80x31.xlsx` — the same failure reproduces in `.xlsx`
- `roster.csv` — dd/mm/yyyy, must import as one month
- `roster_iso.csv` — ISO dates, control
- `roster_xss.csv` — person names containing `<script>` and `<img onerror>`

`tests/fixtures/expected.json` records winning parser, people, entries,
confidence and month span per fixture. `tests/parse-report.js` prints a
per-engine scorecard for any roster and is the tool for diagnosing a layout that
imports wrongly — it distinguishes "the right engine lost the vote" from "no
engine understood the file".

**Record each fixture's expectation against the broken behaviour first**, then
apply the fix and watch exactly the intended fixtures flip. A suite written after
the fix only restates whatever the code does.

---

## Verification

After porting, on a roster of 14+ people for a calendar month:

| Check | Expected |
|---|---|
| 80 × 31 import | 80 people, 2480 entries, high confidence |
| 150 × 90 import | 150 people, 13,500 entries |
| dd/mm/yyyy CSV | one month, not twelve |
| Absence view | non-zero events when the roster has SICK/LEAVE |
| Reload after import | resumes into the workspace |
| Person CSV, nobody selected | no file, a toast saying why |
