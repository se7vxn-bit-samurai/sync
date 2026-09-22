'use strict';
/**
 * Assemble src/ into index.html.
 *
 * This is a concatenator, not a bundler. It joins the parts named in
 * build/manifest.json, in order, with newlines. It does not minify, rename,
 * wrap, transform or reorder anything — and it must never start to.
 *
 * That restriction is not conservatism, it is a hard requirement of the code:
 *
 *   - the analytics Worker is built from Function.prototype.toString() of
 *     computeFlags, computeTeamHealthScore and _signalRankMeta, so renaming or
 *     wrapping those silently breaks it at runtime with no build-time error
 *   - the NorthStar block reassigns fourteen functions defined in the main
 *     script, and saveSettings is reassigned too; ES module bindings are
 *     immutable, so a module system cannot express this
 *   - 335 functions are referenced from inline onclick/onchange attributes
 *     across ~970 call sites, in one flat top-level scope where forward
 *     references resolve by hoisting
 *
 * See docs/ARCHITECTURE.md before changing any of this.
 *
 *   node build/build.js           write index.html
 *   node build/build.js --check   verify index.html matches src/ (exit 1 if not)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'index.html');
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));

const CHECK = process.argv.includes('--check');

const missing = [];
const pieces = manifest.parts.map(rel => {
  const p = path.join(ROOT, 'src', rel);
  if (!fs.existsSync(p)) { missing.push(rel); return ''; }
  return fs.readFileSync(p, 'utf8');
});

if (missing.length) {
  console.error('Missing source parts:\n  ' + missing.join('\n  '));
  process.exit(1);
}

const built = pieces.join(manifest.join === undefined ? '\n' : manifest.join);
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

if (CHECK) {
  if (!fs.existsSync(OUT)) {
    console.error('index.html does not exist — run: node build/build.js');
    process.exit(1);
  }
  const current = fs.readFileSync(OUT, 'utf8');
  if (current === built) {
    console.log('index.html matches src/  (' + manifest.parts.length + ' parts, sha256 ' +
      sha(built).slice(0, 16) + ')');
    return;
  }
  console.error('index.html does NOT match src/.');
  console.error('  committed: ' + sha(current).slice(0, 16) + '  (' + current.length + ' chars)');
  console.error('  from src/: ' + sha(built).slice(0, 16) + '  (' + built.length + ' chars)');
  console.error('\nsrc/ is the source of truth. Rebuild and commit the result:');
  console.error('  node build/build.js');
  // Point at the first divergence, which is usually enough to find the culprit.
  const a = current.split('\n'), b = built.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.error('\nFirst difference at line ' + (i + 1) + ':');
      console.error('  committed: ' + String(a[i]).slice(0, 120));
      console.error('  from src/: ' + String(b[i]).slice(0, 120));
      break;
    }
  }
  process.exit(1);
}

fs.writeFileSync(OUT, built);
console.log('Wrote index.html — ' + manifest.parts.length + ' parts, ' +
  built.length + ' chars, sha256 ' + sha(built).slice(0, 16));
