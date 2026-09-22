'use strict';
/**
 * One-time splitter: cuts index.html into src/ and writes build/manifest.json.
 *
 * This runs once to perform the restructure. After that, src/ is the source of
 * truth and build/build.js is what you use; this file is kept so the boundaries
 * are reproducible and reviewable rather than arbitrary.
 *
 * Boundaries are found by anchor — a literal line of the current file — rather
 * than by line number, so the cut points are described by what is at them.
 *
 * The split is pure: concatenating every emitted file in manifest order
 * reproduces index.html byte for byte. build.js --check enforces that forever.
 *
 *   node build/split.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

// src/ is the source of truth once it exists. Re-splitting would silently overwrite every edit made
// there with whatever index.html holds, so refuse unless explicitly asked.
if (fs.existsSync(SRC) && !process.argv.includes('--force')) {
  console.error('src/ already exists and is the source of truth. Edit src/ and run node build/build.js.');
  console.error('Re-split from index.html only if you mean to discard src/: node build/split.js --force');
  process.exit(1);
}

const lines = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('\n');

// Structural boundaries, located by exact line content.
function lineOf(exact, from) {
  const i = lines.indexOf(exact, from || 0);
  if (i < 0) throw new Error('Structural anchor not found: ' + JSON.stringify(exact));
  return i;
}

const headOpen      = lineOf('<head>');
const vendorStart   = lineOf('<script id="sync-xlsx-parser">');
const h2cStart      = lineOf('<script id="sync-html2canvas">');
const exceljsStart  = lineOf('<script id="sync-exceljs">');
const jszipStart    = lineOf('<script id="sync-jszip">');
const jszipEnd      = lineOf('</script>', jszipStart);
const styleStart    = lineOf('<style>', jszipEnd);
const styleEnd      = lineOf('</style>', styleStart);
const style2Start   = lineOf('<style id="sync-dashboard-workspace-styles">');
const style2End     = lineOf('</style>', style2Start);
const bodyOpen      = lineOf('<body>');
const appOpen       = lineOf('<script>', bodyOpen);
const appClose      = lineOf('</script>', appOpen);
const nsOpen        = lineOf('<script>', appClose);
const nsClose       = lineOf('</script>', nsOpen);
const assetsOpen    = lineOf('<script>', nsClose);
const assetsClose   = lineOf('</script>', assetsOpen);
const signalOpen    = lineOf('<script>', assetsClose);
const signalClose   = lineOf('</script>', signalOpen);
const packOpen      = lineOf('<script>', signalClose);
const packClose     = lineOf('</script>', packOpen);
const identityOpen  = lineOf('<script>', packClose);
const identityClose = lineOf('</script>', identityOpen);

/**
 * Module boundaries inside the main app script, in file order.
 * Each anchor is a literal line that begins the module.
 */
const APP_MODULES = [
  ['app/state/store.js',                null],  // from the start of the script
  ['app/state/exceptions-leave.js',     '/* ═══ LEAVE REQUESTS LEDGER'],
  ['app/state/undo.js',                 'function _isPlainObject('],
  ['app/state/selectors.js',            'function _rebuildMonthsFromEntries('],
  ['app/render/scheduler.js',           'function domKey('],
  ['app/views/dashboard.js',            'function rSyncDashboardLegacy('],
  ['app/views/ops.js',                  'function _opsScope('],
  ['app/app/navigation.js',             'function _rerenderCurrentSurfaceNow('],
  ['app/qol/shared-state.js',           'const QOL_SCHEMA'],
  ['app/ui/command-palette.js',         'function setTab('],
  ['app/ui/controls.js',                'const NAV_KEYS'],
  ['app/state/persist-queue.js',        'let _persistTimer'],
  ['app/theme/tokens.js',               'const TH={'],
  ['app/core/kernel.js',                'const MO=['],
  ['app/parse/rotation-detect.js',      '// ═══ ROTATION DEFINITION SCANNER'],
  ['app/parse/engines.js',              '// ═══ PARSERS (unchanged logic'],
  ['app/parse/file-routing.js',         'LANDING MODE — dual-mode routing'],
  ['app/wfm/engine.js',                 'WFM ENGINE v2 — NICE WFM'],
  ['app/parse/preview-gate.js',         'PARSE PREVIEW — data safety gate'],
  ['app/io/save-file.js',               'const APP_STATE_CHUNK_SHEET'],
  ['app/workspace/departments.js',      'DEPARTMENT WORKSPACE'],
  ['app/ui/display-helpers.js',         'DISPLAY HELPERS'],
  ['app/ui/chrome.js',                  'UI RENDERING'],
  ['app/views/calendar.js',             '/* ═══ CALENDAR ═══'],
  ['app/domain/day-stores.js',          '/* ═══ ATTENDANCE TRACKING'],
  ['app/people/registry.js',            'PEOPLE REGISTRY v44.3'],
  ['app/ot/engine.js',                  'OT PLANNER ENGINE v52'],
  ['app/domain/shift-library.js',       'SHIFT LIBRARY v44.3'],
  ['app/settings/drawer.js',            'UNIFIED SETTINGS DRAWER v48'],
  ['app/build-wizard.js',               'BUILD WIZARD v45.0'],
  ['app/coverage/forecast.js',          'COVERAGE INTELLIGENCE ENGINE v45.1'],
  ['app/coaching/quality.js',           'COACHING QUALITY ENGINE v45.1'],
  ['app/rules/validation.js',           'RULES VALIDATION ENGINE v45.1'],
  ['app/exceptions/day-ops.js',         '/* ═══ EXCEPTIONS ENGINE'],
  ['app/views/cards.js',                '/* ═══ CARDS ═══'],
  ['app/views/table.js',                '/* ═══ TABLE ═══'],
  ['app/views/analytics.js',            '/* ═══ ANALYTICS ═══'],
  ['app/views/capacity-history.js',     '// ═══ CAPACITY WATERFALL'],
  ['app/views/flags.js',                'FLAGS VIEW — v43.3'],
  ['app/planner/engine.js',             '/* ═══ PLANNER — Rotation Detection'],
  ['app/planner/blueprint.js',          '// ═══ BLUEPRINT + POSITION + MONTH GENERATOR'],
  ['app/planner/coverage-drift.js',     '// ═══ COVERAGE INTELLIGENCE (Phase 4)'],
  ['app/coaching/scheduler.js',         '/* ═══ COACHING SCHEDULER ENGINE'],
  ['app/ot/view.js',                    'OT PLANNER UI — v52'],
  ['app/planner/leader-planner.js',     'function ensureLeaderPlanner('],
  ['app/views/planner.js',              'function rPlanner('],
  ['app/domain/swaps.js',               'SHIFT SWAP ENGINE — v41'],
  ['app/analytics/signals.js',          'v57 SIGNAL ENGINE — Team Leader'],
  ['app/analytics/risk-fairness.js',    'TEAM RISK ENGINE — cross-person'],
  ['app/analytics/flags-engine.js',     'FLAGS ENGINE — v43.3'],
  ['app/analytics/patterns.js',         'PATTERN CATEGORISATION ENGINE'],
  ['app/analytics/health.js',           'MONTH HEALTH SCORE ENGINE'],
  ['app/views/intel-summary.js',        'INTEL TAB — Team Leader Dashboard'],
  ['app/views/raw.js',                  '/* ═══ RAW DATA (with sheet tabs)'],
  ['app/export/simple.js',              '/* ═══ EXPORTS ═══'],
  ['app/theme/apply.js',                '/* ═══ THEME (multi-variant)'],
  ['app/io/keyboard.js',                '/* ═══ KEYBOARD ═══'],
  ['app/io/dnd-paste.js',               '/* ═══ DRAG & DROP ═══'],
  ['app/export/digest.js',              '/* ═══ EMAIL ROSTER GENERATOR'],
  ['app/export/weekly-digest.js',       'WEEKLY DIGEST GENERATOR'],
  ['app/exceptions/bulk.js',            'BULK EXCEPTION LOGGING'],
  ['app/export/exceljs.js',             '/* ═══ SAVE+ EXPORT SYSTEM (ExcelJS)'],
  ['app/state/settings-persistence.js', '/* ═══ SETTINGS PERSISTENCE (localStorage)'],
  ['app/ui/notifications.js',           '/* ═══ TOAST NOTIFICATIONS'],
  ['app/change-tracking.js',            'CHANGE TRACKING ENGINE'],
  ['app/storage/clear-all.js',          '/* ═══ CLEAR ALL STORED DATA'],
  ['app/ui/help.js',                    'HELP SYSTEM v43'],
  ['app/people/ops-surface.js',         'PHASE A — PEOPLE OPS SURFACE v50'],
  ['app/export/cards-png-zip.js',       'function _captureCssVarMap('],
  ['app/views/people.js',               'function rPeopleAgentsView(']
];

// Resolve every anchored module to its starting line inside the app script.
const appStart = appOpen + 1;
const appEnd = appClose;          // exclusive

const bannerStarts = [];
for (let i = 0; i < APP_MODULES.length; i++) {
  const [file, anchor] = APP_MODULES[i];
  if (anchor === null) { bannerStarts.push(null); continue; }
  const from = bannerStarts.filter(v => v !== null).slice(-1)[0] || appStart;
  let at = -1;
  for (let j = from; j < appEnd; j++) {
    if (lines[j] === anchor || lines[j].trimStart().startsWith(anchor)) { at = j; break; }
  }
  // Banner titles sit on the line after the opening rule; start at the rule so
  // the comment block stays with the module it introduces.
  while (at > appStart && /^\s*\/\*\s*═+\s*$/.test(lines[at - 1])) at--;
  if (at < 0 || at >= appEnd) {
    throw new Error('App module anchor not found in script: ' + file + '\n  ' + anchor.slice(0, 90));
  }
  bannerStarts.push(at);
}

// Modules with a null anchor keep whatever the previous resolved module used as
// its end — i.e. they were merged into the preceding one. Drop them so the
// remaining boundaries are exactly the anchors that resolved.
const resolved = [];
for (let i = 0; i < APP_MODULES.length; i++) {
  if (i === 0) { resolved.push({ file: APP_MODULES[i][0], start: appStart }); continue; }
  if (bannerStarts[i] === null) continue;
  resolved.push({ file: APP_MODULES[i][0], start: bannerStarts[i] });
}
resolved.sort((a, b) => a.start - b.start);
for (let i = 0; i < resolved.length; i++) {
  resolved[i].end = (i + 1 < resolved.length) ? resolved[i + 1].start : appEnd;
}

// ---- assemble the full ordered part list -------------------------------

const parts = [];
const add = (file, from, to) => parts.push({ file, from, to });

add('head/open.html',            0, vendorStart);
add('vendor/xlsx.js',            vendorStart, h2cStart);
add('vendor/html2canvas.js',     h2cStart, exceljsStart);
add('vendor/exceljs.js',         exceljsStart, jszipStart);
add('vendor/jszip.js',           jszipStart, styleStart);
add('styles/app.css.html',       styleStart, style2Start);
add('styles/dashboard.css.html', style2Start, bodyOpen);
add('body/markup.html',          bodyOpen, appOpen);
add('app/_open.html',            appOpen, appStart);
for (const r of resolved) add(r.file, r.start, r.end);
add('app/_close.html',           appEnd, nsOpen);
add('northstar/northstar.js.html',   nsOpen, assetsOpen);
add('assets/v31-templates.js.html',  assetsOpen, signalOpen);
add('signal-field/signal-field.js.html', signalOpen, packOpen);
add('packbuilder/pack-builder.js.html',  packOpen, identityOpen);
add('boot/identity.js.html',     identityOpen, lines.length);

// ---- write ------------------------------------------------------------

let written = 0;
const manifest = [];
for (const p of parts) {
  const body = lines.slice(p.from, p.to).join('\n');
  const target = path.join(SRC, p.file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  manifest.push(p.file);
  written += body.length;
  console.log(String(p.to - p.from).padStart(6) + ' lines  ' + p.file);
}

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'build', 'manifest.json'),
  JSON.stringify({
    note: 'Ordered source parts. build.js joins them with "\\n" to produce index.html. Order is the file order of the original single-file build and must not be rearranged - see docs/ARCHITECTURE.md.',
    join: '\n',
    parts: manifest
  }, null, 2) + '\n');

console.log('\n' + parts.length + ' parts, ' + written + ' chars');
