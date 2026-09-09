# Build

```
node build/build.js           assemble src/ into index.html
node build/build.js --check   verify index.html matches src/ (exit 1 if not)
npm test                      parser suite + smoke suite
```

`index.html` is a build output **and is committed**, because GitHub Pages serves
it directly from the repository root. `src/` is the source of truth; the two
must never diverge, which is what `--check` enforces and CI runs on every push.

## Normal workflow

1. Edit files under `src/`.
2. `node build/build.js`
3. `npm test`
4. Commit `src/` and `index.html` together.

Committing a change to `src/` without rebuilding will fail CI. So will editing
`index.html` directly — do not; the next build overwrites it.

## What the build does

It concatenates the parts listed in `build/manifest.json`, in order, with
newlines. Nothing else. No minification, no renaming, no module wrapping, no
reordering.

That is a hard constraint imposed by the code — the analytics Worker is built
from `Function.prototype.toString()`, fourteen functions are reassigned at
runtime, and 335 functions are bound to inline DOM handlers in one flat scope.
`docs/ARCHITECTURE.md` explains each in full. Read it before changing anything
in `build/`.

## Adding a module

1. Create the file under `src/app/…`.
2. Add its path to `build/manifest.json` **at the position matching where its
   code must execute**. The main script is one flat scope, so order determines
   the order of top-level statements. Function declarations hoist; `const`/`let`
   at top level do not.
3. Rebuild, test, commit.

## Moving code between modules

Safe, as long as the concatenated result is unchanged or the move respects
execution order. Cutting a block from one file and pasting it into another at
the same manifest position is a no-op to the build — `--check` will confirm it.

Renaming a function is **not** automatically safe: check first whether it
appears in an inline `onclick`/`onchange`, in the analytics worker source, or in
NorthStar's reassignment list.

```
grep -rn "yourFunctionName" src/
```

## Re-splitting

`build/split.js` performed the original split and is kept for reference. It cuts
`index.html` at anchors — literal lines such as banner titles and function
signatures — and regenerates both `src/` and the manifest.

You should not normally need it. If you do run it, the invariant to check
immediately afterwards is that the output is byte-identical to what you started
with:

```
sha256sum index.html            # before
node build/split.js
node build/build.js --check     # must pass
```

That check is what made the original restructure provably behaviour-neutral.

## CI

`.github/workflows/ci.yml` runs on push and pull request:

1. `node build/build.js --check` — src/ and index.html agree
2. `node tests/parser.test.js` — parser selection per fixture
3. `node tests/smoke.test.js` — boot, navigation, injection, viewports,
   analytics worker, persistence
