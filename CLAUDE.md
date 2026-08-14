# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node ESM library + CLI (`bin/webapp-agent-studio.mjs`) that a *consuming* project installs to drive its web app in real Chromium (Playwright, peer dependency), write evidence artifacts to disk, and keep a cross-run record of findings and judgments. It is not itself a webapp, and it uses no LLM SDK — the "agent" angle is that its artifacts are designed to be read by an agent session with only Bash + Read. `AGENT-GUIDE.md` is the manual for those *downstream* sessions, not for developing this repo.

Plain `.mjs` with `// @ts-check` + JSDoc, no build step. Node ≥22. Distributed via git tags only — no npm publish.

## Commands

- `npm run check` — typecheck + unit tests; the full local gate
- `npx vitest run test/redact.test.mjs` — one test file; `npx vitest run -t "<name>"` — one test by name
- `npm run typecheck` — the only static gate (there is no linter, on purpose)
- `npm run types` — regenerate `types/*.d.mts`. **The output is committed; any signature change in `src/` requires running this and committing the result, or CI fails** (`git diff --exit-code types/`)
- `npm run fixture:e2e` — the e2e (needs `npx playwright install chromium` once); `npm run fixture` serves the fixture app alone
- `test/e2e/fixture-run.mjs` is deliberately **not** named `*.test.mjs` — that naming rule is all that keeps `npm test` free of browser launches. Keep it that way.

## Architecture

`run <loop>` flow (`src/runner.mjs`): `loadConfig()` (`src/config.mjs`, lazy `env()` getters) → import `loops/<name>/loop.mjs` (validated by `defineLoop`, `src/loop.mjs`) → `assertReachable(baseURL)` → `mintRun()` → `startStudio()` (`src/harness.mjs`, one Chromium) → sessions per identity (`src/session.mjs`, axe injected, four error collectors attached, auth provider signs in, waits for `settle`) → checks run **serially**, each in a sequence window `[from, to)` for error attribution → budgets appended as pseudo-checks → `results.json` (validated against `src/results-schema.mjs` on write and re-read) → findings drafted/reconciled (`src/findings.mjs`) → `diff.json` vs previous run → `report.html` (`src/report/`) → `runs/latest.json` → prune.

The filesystem is the state — no database, no server:

- `loops/<NNN-name>/loop.mjs`, `findings.json`, `directives.md` — committed, survive pruning
- `loops/<NNN-name>/runs/NNN/` — artifacts, gitignored
- `runs/latest.json` — rebuilt convenience pointer; the directory listing is the source of truth

Domain concepts: **Loop** (a stable question: task + checks; `src/loop.mjs`) · **Check** (returns pass/fail/unknown; its name is the diff key) · **Run** (one iteration, numbered not timestamped; `src/runs.mjs`) · **Finding** (`open → fix-directed → verified-fixed | accepted`; `src/findings.mjs`) · **Judgment** (what a program can't settle; `src/judgments.mjs`) · **Studio/Session** (one browser / one context; `src/harness.mjs`, `src/session.mjs`). Auth is a provider interface (`src/auth/provider.mjs`): `form`, `better-auth`, `nextauth`, `supabase`, `clerk`, `token`, `fragment-token`, `custom`. `src/start.mjs` boots the app when nothing answers at `baseURL` (config `start` / CLI `--start`) and only ever stops what it started. `src/env.mjs` loads the config's `envFile` before anything reads a credential.

## Adoption surface — the three things that make a swap-in hard

Changing any of these is changing how a *consuming* project adopts the package, so weigh it accordingly.

1. **`envFile` (`src/env.mjs`, `loadConfig`).** Sign-in nearly always needs a secret, and without this the consumer must bypass the CLI entirely (`node --env-file=.env node_modules/...`). `loadConfig` imports the config module a SECOND time, cache-busted, when the config declares its own `envFile` — the declaration lives inside the very module whose import it must inform, and a config reading `process.env` at top level is a common shape. Node never lets an env file overwrite an already-set variable; the CLI reports which names were shadowed, because otherwise that surfaces as an authentication failure pointing at nothing.
2. **`init` is re-runnable and derives every path from the config** (`ignoreLinesFor`, `pointerBlock`). It necessarily runs before anyone has customised `loopsDir`, so hardcoded ignore rules leave a project that later moved its loops with run artifacts untracked but NOT ignored — screenshots of a signed-in app one `git add .` from being committed. `--sync` reconciles without touching the config; `--dry-run` writes nothing.
3. **A provider that navigates declares `navigates: true`** (`shouldVisitFirst` in `src/harness.mjs`). Otherwise the harness's visit to `baseURL` is cancelled by the provider's own, and that cancelled request is collected as a real failed request scored against `errorBudget` — a failure caused by the test, in a package that never filters errors. Only a session that is signing in may skip the visit; a signed-out one would settle against `about:blank`.

Run numbering invariant: a run that never drove anything must not burn a number. Reachability is asserted *before* `mintRun`; an aborted run whose dir is empty is removed — but a run that captured anything is evidence and is never auto-removed (`src/runner.mjs`).

## Invariants — do not violate

1. **`unknown` never reads as pass.** A check returning nothing records `unknown`; a filtered-out check is recorded as `unknown`, never omitted.
2. **Exit 1 ≠ exit 2** (`src/exit.mjs`): app broken vs studio broken. Anything meaning "the studio couldn't run" must be a `StudioError` → exit 2.
3. **Mask before the pixel.** Secrets are masked via Playwright's native `mask` so they never enter the PNG; `redactJson` (`src/redact.mjs`) is a second layer for text artifacts. Custom redact patterns must carry `/g`.
4. **Log every error, filter none.** Collectors (`src/errors.mjs`) don't filter "expected" 4xx; attribution is a view, never a filter; `errorBudget` scores against every error.
5. **Check names are stable and unique** — renaming one is renaming the question.
6. **The diff never affects the exit code.**
7. **A finding that starts passing while still `open` is "recovered without being directed", not `verified-fixed`.** Only `fix-directed` → passing verifies.
8. **No fixed sleeps** — use the named waits in `src/waits.mjs`. The `settle` selector must name something that exists *only after* the app has settled.
9. **No per-check retries and no quarantine/known-fail state** — explicit non-goals. Checks stay serial for readable failure ordering.
10. **`env()` getters stay lazy** — some paths load config for `baseURL` alone; throwing at import breaks them.
11. **Assert on artifacts, never on "it didn't throw."**
12. **`verify` proves redaction with no configuration.** It plants a fresh token-shaped canary every run, asserts it is gone from the artifacts, AND asserts it reached `errors.json` in the first place — absence alone is also what a dropped collector looks like. `verify.plantedSecret` remains the way to cover the capture-time mask, which needs a project-specific selector.
