# Contributing

## Before anything else

```
npm test
```

Both suites drive the real `index.html` in headless Chromium. They should be
green before you start, so you know what you broke.

## The loop

1. Edit under `src/` — never `index.html`, which is generated.
2. `node build/build.js`
3. `npm test`
4. Commit `src/` and `index.html` together.

## Read first, depending on what you are touching

| Working on | Read |
|---|---|
| the build, or moving code between modules | `docs/ARCHITECTURE.md` |
| a roster that imports wrongly, or a new layout | `docs/PARSERS.md` |
| storage, session resume, Save+ | `docs/PERSISTENCE.md` |
| anything in `build/` | `docs/BUILD.md` |

## Three things that will bite you

**Do not "modernise" the build.** It is a plain concatenation because the
analytics Worker stringifies its own functions, fourteen globals are reassigned
at runtime, and 335 functions are bound to inline DOM handlers. A bundler breaks
these at runtime with no build-time error. `docs/ARCHITECTURE.md` has the
detail.

**Do not rename a function without grepping for it.** It may be named in an
inline `onclick`, in the worker source, or in NorthStar's reassignment list.

**Do not reorder `build/manifest.json`.** The main script is one flat scope and
order is execution order.

## Changing behaviour deliberately

Expected results live in `tests/fixtures/expected.json` and
`tests/fixtures/smoke-expected.json`. When a change is meant to alter behaviour:

```
node tests/parser.test.js --update
node tests/smoke.test.js --update
```

Then **read the diff**. It should contain exactly what you intended and nothing
else. That diff belongs in the commit — it is the record of what changed and the
evidence you did not break the rest.

## Fixtures

Adding a roster layout means adding a fixture. Anonymise real names first;
fixtures are committed. Keep the structure exactly as it arrived — the structure
is the thing under test.

## Commits

Explain the cause, not just the change. Every defect fixed in v65 was invisible
from the UI: the app reported success while discarding most of a roster. A
commit message that says what was actually happening is worth more than one that
says which line moved.
