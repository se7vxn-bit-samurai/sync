const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

/**
 * Static analysis over src/, no browser.
 *
 * The NorthStar core (src/northstar/northstar.js.html) runs inside its own IIFE, so the rest of the
 * app cannot see its functions by bare name. Anything called across that boundary has to be
 * re-exported as `window.X=X`. Every call site guards with `typeof X==='function'`, which fails
 * silently when the export is missing: no throw, no log, the feature just never runs. That gap has
 * taken out view-state restore, "last opened", delete-from-picker, backup export and the sign-in
 * cloud pull at once before. This keeps a forgotten export from shipping.
 */

const ROOT = path.join(__dirname, '..', 'src');
const CORE = 'northstar/northstar.js.html';
const { parts } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'manifest.json'), 'utf8'));

test('every core function referenced through a typeof guard outside the core is window-exported', () => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'static check; one project is enough');
  expect(parts, 'build/manifest.json no longer lists the NorthStar core part').toContain(CORE);
  const core = fs.readFileSync(path.join(ROOT, CORE), 'utf8');
  const outside = parts.filter((p) => p !== CORE && !p.startsWith('vendor/'))
    .map((p) => fs.readFileSync(path.join(ROOT, p), 'utf8')).join('\n');

  const defined = new Set([...core.matchAll(/function ([A-Za-z_$][\w$]*)\(/g)].map((m) => m[1]));
  const exported = new Set([...core.matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]));
  const guarded = new Set([...outside.matchAll(/typeof ([A-Za-z_$][\w$]*)\s*===?\s*['"]function['"]/g)].map((m) => m[1]));

  const missing = [...guarded].filter((name) => defined.has(name) && !exported.has(name)).sort();
  expect(missing, missing.length
    ? `Called from outside the NorthStar core behind a typeof guard, so currently a silent no-op. ` +
      `Add "window.${missing[0]}=${missing[0]};" (one per name) to the core's export list: ${missing.join(', ')}`
    : undefined).toEqual([]);
});
