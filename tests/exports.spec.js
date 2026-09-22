const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Pure static analysis, no browser — checks index.html's source text directly.
 *
 * northstar-core.js is wrapped in its own top-level IIFE, invisible by bare name from the rest of
 * the app; every function the main script needs to call across that boundary must be explicitly
 * re-exported as `window.X=X` inside northstar-core.js. Every call site guards with
 * `typeof X==='function'`, which fails SILENTLY (not a ReferenceError) when the export is missing —
 * so a forgotten export line doesn't throw, doesn't log, and doesn't show up until a feature quietly
 * never works. This exact gap once took out view-state save/restore, "last opened" tracking,
 * delete-from-picker, backup export, and the sign-in cloud pull all at once (see the comment block
 * right above the window.X=X export list in index.html) — found by a test, not by reading the code.
 * This test is that check, kept permanent so the next missing export fails CI instead of shipping.
 */

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// String anchors, not line numbers — index.html is a single generated file that reflows on every
// edit, so anything line-based here would silently drift out of sync with the code it's checking.
const CORE_START = 'const NS_STORAGE_KEY="sc_northstar_canonical_v1"';
const CORE_END = 'window.SYNC_V31_TEMPLATE_ASSETS=';

function northstarCoreBoundaries() {
  const start = SOURCE.indexOf(CORE_START);
  const end = SOURCE.indexOf(CORE_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `Could not locate northstar-core.js's boundaries in index.html — one of the anchor strings ` +
        `("${CORE_START}", "${CORE_END}") no longer appears exactly where this test expects. ` +
        `Update the anchors in tests/exports.spec.js to match the current source.`
    );
  }
  return { core: SOURCE.slice(start, end), before: SOURCE.slice(0, start), after: SOURCE.slice(end) };
}

test('every northstar-core.js function referenced via a typeof guard elsewhere is window-exported', () => {
  const { core, before, after } = northstarCoreBoundaries();

  const definedInCore = new Set([...core.matchAll(/function ([A-Za-z_$][A-Za-z0-9_$]*)\(/g)].map((m) => m[1]));
  const exportedFromCore = new Set([...core.matchAll(/^window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/gm)].map((m) => m[1]));
  const referencedFromOutside = new Set(
    [...(before + after).matchAll(/typeof ([A-Za-z_$][A-Za-z0-9_$]*)\s*===?\s*['"]function['"]/g)].map((m) => m[1])
  );

  const missing = [...referencedFromOutside]
    .filter((name) => definedInCore.has(name) && !exportedFromCore.has(name))
    .sort();

  expect(
    missing,
    missing.length
      ? `These northstar-core.js functions are called from outside it via a typeof guard, which is ` +
        `currently silently failing — add "window.${missing[0]}=${missing[0]};" (one such line per ` +
        `name below) next to the existing export list in northstar-core.js: ${missing.join(', ')}`
      : undefined
  ).toEqual([]);
});
