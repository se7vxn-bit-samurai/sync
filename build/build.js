'use strict';
/**
 * Assemble src/ into index.html and me.html.
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
 *   node build/build.js                       write index.html and me.html (the live build)
 *   node build/build.js --check               verify both match src/ (exit 1 if not), and that
 *                                             every environment assembles and stays on its own
 *                                             server
 *   node build/build.js --env dev [--out DIR] write the dev build of both into DIR (default:
 *                                             manifest.json envs.dev.out)
 *
 * Environments: the live build is the manifest's parts as listed. Another environment swaps each
 * env/live/ part for its env/<name>/ twin and changes nothing else, so the builds differ only in
 * which server they talk to and how people sign in (see src/env/).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// One output per manifest: index.html is Desk, Bridge and Ops; me.html is Sync Me, the agents' page,
// which leaves out the spreadsheet and export engines so it stays small on a phone.
const TARGETS = {
  index: { manifest: 'manifest.json', file: 'index.html' },
  me: { manifest: 'manifest.me.json', file: 'me.html' },
};
const manifests = {};
function manifestOf(target) {
  if (!TARGETS[target]) throw new Error('Unknown output "' + target + '". Known: ' + Object.keys(TARGETS).join(', '));
  if (!manifests[target]) manifests[target] = JSON.parse(fs.readFileSync(path.join(__dirname, TARGETS[target].manifest), 'utf8'));
  return manifests[target];
}
// Environments are declared once, in manifest.json, and apply to every output.
const ENV_CONFIG = manifestOf('index').envs || {};
const LIVE = 'live';
const ENVS = [LIVE, ...Object.keys(ENV_CONFIG)];

function partsFor(env, target = 'index') {
  const parts = manifestOf(target).parts;
  if (env === LIVE) return parts;
  if (!ENV_CONFIG[env]) throw new Error('Unknown environment "' + env + '". Known: ' + ENVS.join(', '));
  return parts.map(rel => rel.startsWith('env/live/') ? 'env/' + env + '/' + rel.slice('env/live/'.length) : rel);
}

/** One output for one environment, or { missing } naming the parts that do not exist. */
function assemble(env = LIVE, target = 'index') {
  const m = manifestOf(target);
  const missing = [];
  const pieces = partsFor(env, target).map(rel => {
    const p = path.join(ROOT, 'src', rel);
    if (!fs.existsSync(p)) { missing.push(rel); return ''; }
    return fs.readFileSync(p, 'utf8');
  });
  if (missing.length) return { missing };
  return { html: pieces.join(m.join === undefined ? '\n' : m.join) };
}

/** The Supabase URL an environment's env.js names. */
function serverOf(env) {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'env', env, 'env.js'), 'utf8');
  const m = /supabaseUrl:\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error('src/env/' + env + '/env.js has no supabaseUrl');
  return new URL(m[1]).host;
}

/** Problems that make an environment's build unsafe to ship: another environment's server in it. */
function leaks(env, html) {
  return ENVS.filter(other => other !== env && serverOf(other) !== serverOf(env))
    .filter(other => html.includes(serverOf(other)))
    .map(other => 'the ' + env + ' build mentions the ' + other + ' server (' + serverOf(other) + ')');
}

module.exports = { assemble, partsFor, serverOf, leaks, ENVS, TARGETS };
if (require.main === module) main();

function main() {
  const CHECK = process.argv.includes('--check');
  const argOf = flag => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
  const ENV = argOf('--env') || LIVE;
  const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
  const partsCount = target => manifestOf(target).parts.length;

  function build(env, target) {
    let out;
    try { out = assemble(env, target); } catch (err) { console.error(err.message); process.exit(1); }
    if (out.missing) {
      console.error('Missing source parts for the ' + env + ' ' + TARGETS[target].file + ':\n  ' + out.missing.join('\n  '));
      process.exit(1);
    }
    const problems = leaks(env, out.html);
    if (problems.length) {
      console.error('Refusing to build ' + TARGETS[target].file + ': ' + problems.join('; '));
      process.exit(1);
    }
    return out.html;
  }

  if (CHECK) {
    let failed = false;
    for (const target of Object.keys(TARGETS)) {
      const file = TARGETS[target].file, OUT = path.join(ROOT, file);
      const built = build(LIVE, target);
      if (!fs.existsSync(OUT)) {
        console.error(file + ' does not exist — run: node build/build.js');
        failed = true;
        continue;
      }
      const current = fs.readFileSync(OUT, 'utf8');
      if (current === built) {
        console.log(file + ' matches src/  (' + partsCount(target) + ' parts, sha256 ' + sha(built).slice(0, 16) + ')');
        continue;
      }
      failed = true;
      console.error(file + ' does NOT match src/.');
      console.error('  committed: ' + sha(current).slice(0, 16) + '  (' + current.length + ' chars)');
      console.error('  from src/: ' + sha(built).slice(0, 16) + '  (' + built.length + ' chars)');
      // Point at the first divergence, which is usually enough to find the culprit.
      const a = current.split('\n'), b = built.split('\n');
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
          console.error('  first difference at line ' + (i + 1) + ':');
          console.error('    committed: ' + String(a[i]).slice(0, 120));
          console.error('    from src/: ' + String(b[i]).slice(0, 120));
          break;
        }
      }
    }
    if (failed) {
      console.error('\nsrc/ is the source of truth. Rebuild and commit the result:\n  node build/build.js');
      process.exit(1);
    }
    for (const env of ENVS.filter(e => e !== LIVE)) {
      for (const target of Object.keys(TARGETS)) {
        const html = build(env, target);
        console.log(env + ' ' + TARGETS[target].file + ' assembles  (' + html.length + ' chars, server ' + serverOf(env) + ')');
      }
    }
    return;
  }

  const dir = ENV === LIVE ? ROOT : path.resolve(ROOT, argOf('--out') || (ENV_CONFIG[ENV] || {}).out || path.join('dist', ENV));
  fs.mkdirSync(dir, { recursive: true });
  for (const target of Object.keys(TARGETS)) {
    const html = build(ENV, target), file = path.join(dir, TARGETS[target].file);
    fs.writeFileSync(file, html);
    console.log('Wrote ' + (path.relative(ROOT, file) || file) + ' (' + ENV + ') — ' + partsCount(target) + ' parts, ' +
      html.length + ' chars, sha256 ' + sha(html).slice(0, 16));
  }
}
