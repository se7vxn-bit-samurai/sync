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
 *   node build/build.js                       write index.html (the live build)
 *   node build/build.js --check               verify index.html matches src/ (exit 1 if not), and
 *                                             that every environment assembles and stays on its
 *                                             own server
 *   node build/build.js --env dev [--out F]   write the dev build (default: manifest envs.dev.out)
 *
 * Environments: the live build is the manifest's parts as listed. Another environment swaps each
 * env/live/ part for its env/<name>/ twin and changes nothing else, so the builds differ only in
 * which server they talk to and how people sign in (see src/env/).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'index.html');
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const LIVE = 'live';
const ENVS = [LIVE, ...Object.keys(manifest.envs || {})];

function partsFor(env) {
  if (env === LIVE) return manifest.parts;
  if (!(manifest.envs || {})[env]) throw new Error('Unknown environment "' + env + '". Known: ' + ENVS.join(', '));
  return manifest.parts.map(rel => rel.startsWith('env/live/') ? 'env/' + env + '/' + rel.slice('env/live/'.length) : rel);
}

/** The single-file app for an environment, or { missing } naming the parts that do not exist. */
function assemble(env = LIVE) {
  const missing = [];
  const pieces = partsFor(env).map(rel => {
    const p = path.join(ROOT, 'src', rel);
    if (!fs.existsSync(p)) { missing.push(rel); return ''; }
    return fs.readFileSync(p, 'utf8');
  });
  if (missing.length) return { missing };
  return { html: pieces.join(manifest.join === undefined ? '\n' : manifest.join) };
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

module.exports = { assemble, partsFor, serverOf, leaks, ENVS };
if (require.main === module) main();

function main() {
  const CHECK = process.argv.includes('--check');
  const argOf = flag => { const i = process.argv.indexOf(flag); return i > 0 ? process.argv[i + 1] : null; };
  const ENV = argOf('--env') || LIVE;
  const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

  function build(env) {
    let out;
    try { out = assemble(env); } catch (err) { console.error(err.message); process.exit(1); }
    if (out.missing) {
      console.error('Missing source parts for the ' + env + ' build:\n  ' + out.missing.join('\n  '));
      process.exit(1);
    }
    const problems = leaks(env, out.html);
    if (problems.length) {
      console.error('Refusing to build: ' + problems.join('; '));
      process.exit(1);
    }
    return out.html;
  }

  const built = build(CHECK ? LIVE : ENV);

  if (CHECK) {
    if (!fs.existsSync(OUT)) {
      console.error('index.html does not exist — run: node build/build.js');
      process.exit(1);
    }
    const current = fs.readFileSync(OUT, 'utf8');
    if (current === built) {
      console.log('index.html matches src/  (' + manifest.parts.length + ' parts, sha256 ' +
        sha(built).slice(0, 16) + ')');
      for (const env of ENVS.filter(e => e !== LIVE)) {
        const html = build(env);
        console.log(env + ' build assembles  (' + html.length + ' chars, server ' + serverOf(env) + ')');
      }
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

  const target = ENV === LIVE ? OUT : path.resolve(ROOT, argOf('--out') || manifest.envs[ENV].out);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, built);
  console.log('Wrote ' + path.relative(ROOT, target) + ' (' + ENV + ') — ' + manifest.parts.length + ' parts, ' +
    built.length + ' chars, sha256 ' + sha(built).slice(0, 16));
}
