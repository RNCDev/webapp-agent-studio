// @ts-check
// Everything the loops used to copy-paste: record, the check wrapper, results.json, the
// tally, the exit code — plus run directories, error attribution, findings, and the diff.
//
// CHECKS STAY SERIAL. A readable failure order is worth more than the seconds parallelism
// would save: when check 4 fails, what happened in checks 1-3 is the context for reading
// it, and interleaved output destroys that.

import { readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { normalizeVerdict } from './loop.mjs';
import { startStudio } from './harness.mjs';
import { errorsInWindow, unattributedErrors } from './errors.mjs';
import { RESULTS_SCHEMA, assertResults } from './results-schema.mjs';
import { mintRun, previousRun, pruneRuns, readResults, writeLatest } from './runs.mjs';
import {
  draftFinding,
  loadFindings,
  reconcileAfterRun,
  saveFindings,
  slugFor,
} from './findings.mjs';
import { EXIT_CHECKS_FAILED, EXIT_OK, StudioError, assertReachable } from './exit.mjs';
import { diffRuns, diffScreenshots } from './report/diff.mjs';
import { writeReport } from './report/html.mjs';
import { writeHistory } from './report/history.mjs';

/**
 * @param {object} args
 * @param {string} args.loopDir
 * @param {string} args.loopName
 * @param {import('./loop.mjs').Loop} args.loop
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {object} [args.options]
 * @param {string[]} [args.options.only] run just these checks; the rest record `unknown`
 * @param {string} [args.options.from] start at this check; earlier ones record `unknown`
 * @param {boolean | 'on-fail'} [args.options.trace] default 'on-fail': traces are recorded
 *   on every run and kept only when the run failed — the failing case is maximally
 *   debuggable and the green case costs no disk. `true` always keeps, `false` never records.
 * @param {boolean} [args.options.requireJudgments] pending judgments fail the run
 * @param {(line: string) => void} [args.options.log]
 */
export async function runLoop(args) {
  const { loopDir, loopName, loop, config } = args;
  const options = args.options ?? {};
  const log = options.log ?? ((/** @type {string} */ line) => console.log(line));

  const startedAt = new Date();

  // Reachability BEFORE the run directory is minted. A dead port must be exit 2
  // immediately, and a run that never drove anything must not consume a run number — the
  // numbering is how iterations of a question are compared, and a gap in it that means
  // "the studio failed to start" is noise in that record.
  await assertReachable(config.baseURL);

  const { run, path: runDir } = mintRun(loopDir);
  log(`${loopName} run ${run} — ${loop.task}`);

  const checks = loop.eval.checks;
  const selected = selectChecks(checks, options);
  const traceMode = options.trace ?? 'on-fail';

  /** @type {any[]} */
  const checkResults = [];
  /** @type {{from: number, to: number}[]} */
  const windows = [];
  /** @type {import('./harness.mjs').Studio | undefined} */
  let studio;
  /** @type {import('./session.mjs').Session | undefined} */
  let session;
  /** @type {Record<string, unknown>} */
  const ctx = {};
  let aborted = false;

  try {
    if (typeof config.hooks.beforeRun === 'function') {
      // Provisioning is project code, called through here rather than imported by the
      // package — the studio has no idea what this project's fixtures are.
      log('  hook beforeRun');
      await config.hooks.beforeRun({ config, runDir, loop: loopName, run });
    }

    studio = await startStudio({ config, outDir: runDir, trace: traceMode !== false });

    if (loop.session !== null) {
      session = await studio.session({
        ...(loop.session ?? {}),
        name: loop.session?.identity ?? 'main',
      });
    }

    const base = {
      studio,
      session: /** @type {import('./session.mjs').Session} */ (session),
      page: session?.page,
      config,
      ctx,
    };

    if (typeof loop.setup === 'function') {
      await loop.setup(/** @type {any} */ (base));
    }

    for (const check of checks) {
      if (!selected.has(check.name)) {
        // A FILTERED-OUT CHECK IS `unknown`, NEVER SILENTLY ABSENT. That is what keeps a
        // partial run from reading as a green full one — the report shows the same list of
        // checks either way, and the ones that did not run say so.
        checkResults.push(
          skipped(check.name, 'not selected by --only/--from on this run'),
        );
        continue;
      }

      const from = studio.sequence.current();
      const shotsBefore = studio.screenshots.length;
      const checkStarted = Date.now();
      let verdict;
      try {
        verdict = normalizeVerdict(
          await check.run(
            /** @type {any} */ ({
              ...base,
              capture: session?.capture,
              axe: session?.axe,
            }),
          ),
        );
      } catch (err) {
        // ONE FAILURE COSTS ONE CHECK. A throw in check 2 of 7 must not cost the other
        // five their evidence — that is exactly when the evidence is worth most.
        verdict = {
          status: /** @type {const} */ ('fail'),
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      const durationMs = Date.now() - checkStarted;
      const to = studio.sequence.current();
      windows.push({ from, to });

      const attributed = errorsInWindow(studio.errors, { from, to });
      checkResults.push({
        name: check.name,
        status: verdict.status,
        detail: verdict.detail,
        startedAt: new Date(checkStarted).toISOString(),
        durationMs,
        seqWindow: { from, to },
        screenshots: studio.screenshots
          .slice(shotsBefore)
          .map((s) => relative(runDir, s.path)),
        errors: /** @type {any[]} */ (config.redactJson(attributed)),
      });
      log(
        `  ${verdict.status.toUpperCase().padEnd(7)} ${check.name}` +
          `${verdict.detail === '' ? '' : ` — ${verdict.detail}`}`,
      );
    }

    if (typeof loop.teardown === 'function') {
      await loop.teardown(/** @type {any} */ (base));
    }

    // Budgets are scored as checks so they appear in the tally, the diff, and the exit
    // code like everything else — a budget that only printed a warning would be a budget
    // nobody notices breaking.
    if (loop.eval.axe !== null) {
      checkResults.push(scoreAxe(studio.axeRuns, loop.eval.axe));
    }
    if (loop.eval.errorBudget !== null) {
      checkResults.push(scoreErrors(studio.errors, windows, loop.eval.errorBudget));
    }
  } catch (err) {
    aborted = true;
    throw err;
  } finally {
    // errors.json must be written even when a check threw — that is when it is worth most.
    // Each guarded independently: a failure in report() must not stop close() from running
    // and leaking the browser, and vice versa.
    await session?.report().catch(() => {});
    // Vacuous counts as failed here even though its pseudo-check is appended later — a run
    // that asserted nothing is exactly one whose trace is worth reading.
    const failed =
      aborted ||
      checkResults.some((c) => c.status === 'fail') ||
      (loop.eval.requireOnePass === true && !checkResults.some((c) => c.status === 'pass'));
    await studio?.close({ keepTraces: shouldKeepTraces(traceMode, failed) }).catch(() => {});
    if (typeof config.hooks.afterRun === 'function') {
      await Promise.resolve(
        config.hooks.afterRun({ config, runDir, loop: loopName, run }),
      ).catch((/** @type {unknown} */ err) => {
        log(`  hook afterRun failed — ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    // A run that died before producing ANYTHING — a provisioning hook that threw, a
    // browser that would not launch — leaves an empty directory and burns a run number.
    // Remove it, but only when it is genuinely empty: a run that captured something before
    // dying is evidence, and evidence is never cleaned up automatically.
    if (aborted && readdirSync(runDir).length === 0) {
      rmSync(runDir, { recursive: true, force: true });
      log(`  removed the empty run directory — run ${run} was never used`);
    }
  }

  const unattributed = unattributedErrors(studio?.errors ?? [], windows);
  const tally = { pass: 0, fail: 0, unknown: 0 };
  for (const c of checkResults) {
    tally[/** @type {'pass'|'fail'|'unknown'} */ (c.status)] += 1;
  }

  // A run with zero passes asserted NOTHING, and an all-unknown run is the likeliest way a
  // loop lies: it exits green having looked at a page that happened to hold none of the
  // shapes it checks.
  const vacuous = loop.eval.requireOnePass && tally.pass === 0;
  if (vacuous) {
    checkResults.push({
      name: 'loop-asserted-something',
      status: 'fail',
      detail:
        'no check passed on this run — the loop asserted nothing. Either the app is ' +
        'broken, or every shape these checks look for was absent and the run is vacuous.',
      startedAt: new Date().toISOString(),
      durationMs: 0,
      seqWindow: { from: 0, to: 0 },
      screenshots: [],
      errors: [],
    });
    tally.fail += 1;
  }

  const judgments = loop.eval.judgments.map((j) => ({
    name: j.name,
    instruction: j.instruction,
    artifacts: j.artifacts ?? [],
    // Recorded as unknown until someone files a verdict. Unknown is a real state, not a
    // gap: the report must never let it read as a pass.
    verdict: /** @type {'unknown'} */ ('unknown'),
  }));
  const pendingJudgments = judgments.length;

  const finishedAt = new Date();
  const exitCode =
    tally.fail > 0 || (options.requireJudgments === true && pendingJudgments > 0)
      ? EXIT_CHECKS_FAILED
      : EXIT_OK;

  const results = {
    schema: RESULTS_SCHEMA,
    loop: loopName,
    run,
    task: loop.task,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    baseURL: config.baseURL,
    filter:
      options.only !== undefined || options.from !== undefined
        ? { only: options.only ?? null, from: options.from ?? null }
        : null,
    checks: checkResults,
    judgments,
    unattributedErrors: /** @type {any[]} */ (config.redactJson(unattributed)),
    tally,
    pendingJudgments,
    exitCode,
    supersedes: loop.supersedes ?? null,
  };
  assertResults(results, join(runDir, 'results.json'));
  writeFileSync(join(runDir, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);

  // Findings: draft one per failing check that has none, then advance anything that was
  // directed and now passes.
  const findings = loadFindings(loopDir);
  for (const c of checkResults) {
    if (c.status !== 'fail') continue;
    draftFinding(findings, {
      slug: slugFor(c.name),
      title: c.detail === '' ? c.name : `${c.name}: ${c.detail}`.slice(0, 200),
      check: c.name,
      run,
    });
  }
  const reconciled = reconcileAfterRun(findings, checkResults, run);
  saveFindings(loopDir, findings);

  const previous = previousRun(loopDir, run);
  const diff = diffRuns(previous === undefined ? undefined : readResults(previous.path), results);
  if (previous !== undefined) {
    // A UI regression that breaks no check and no accessibility rule is otherwise
    // invisible. This turns "look at everything" into "look at these four".
    diff.screenshots = diffScreenshots(
      previous.path,
      runDir,
      checkResults.flatMap((c) => c.screenshots).map((/** @type {string} */ f) => ({ name: f, file: f })),
    );
  }
  writeFileSync(join(runDir, 'diff.json'), `${JSON.stringify(diff, null, 2)}\n`);

  const reportPath = writeReport({
    runDir,
    results,
    diff,
    findings: findings.findings,
    reconciled,
  });

  writeLatest(loopDir, { run, path: runDir });
  const pruned = pruneRuns(loopDir, config.history.keepRuns ?? 10);
  // After pruning, so the grid never references a run that was just deleted.
  const historyPath = writeHistory(loopDir, { findings: findings.findings });

  log('');
  log(
    `${tally.pass} pass, ${tally.fail} fail, ${tally.unknown} unknown` +
      (pendingJudgments > 0
        ? ` — ${pendingJudgments} judgment(s) pending a verdict`
        : ''),
  );
  if (reconciled.verified.length > 0) {
    log(`verified fixed: ${reconciled.verified.map((f) => f.slug).join(', ')}`);
  }
  if (reconciled.recovered.length > 0) {
    // Not a celebration. Nobody directed these, so nothing is known about why they stopped
    // failing, and a cause that was never found comes back.
    log(
      `recovered without being directed (cause unknown): ` +
        `${reconciled.recovered.map((f) => f.slug).join(', ')}`,
    );
  }
  if (pruned.length > 0) log(`pruned run(s): ${pruned.join(', ')}`);
  log(`run dir: ${runDir}`);
  log(`report:  ${reportPath}`);
  if (historyPath !== undefined) log(`history: ${historyPath}`);

  return { run, runDir, reportPath, historyPath, results, diff, exitCode, pruned };
}

/**
 * Whether a run's traces are written to disk when the studio closes.
 *
 * The default mode is 'on-fail': tracing is always RECORDED (the decision to keep a trace
 * can only be made after the run, and a trace not recorded cannot be kept), and written
 * only when the run failed. `--trace` forces keeping; `--no-trace` skips recording.
 *
 * @param {boolean | 'on-fail'} traceMode
 * @param {boolean} failed
 */
export function shouldKeepTraces(traceMode, failed) {
  if (traceMode === true) return true;
  if (traceMode === false) return false;
  return failed;
}

/**
 * Which checks actually run. `--only` names them; `--from` starts at one and runs the rest.
 *
 * @param {import('./loop.mjs').Check[]} checks
 * @param {{only?: string[], from?: string}} options
 */
function selectChecks(checks, options) {
  const names = checks.map((c) => c.name);
  if (options.only !== undefined && options.only.length > 0) {
    const unknown = options.only.filter((n) => !names.includes(n));
    if (unknown.length > 0) {
      throw new StudioError(
        `--only names checks this loop does not have: ${unknown.join(', ')} — it has: ` +
          names.join(', '),
      );
    }
    return new Set(options.only);
  }
  if (options.from !== undefined) {
    const index = names.indexOf(options.from);
    if (index === -1) {
      throw new StudioError(
        `--from names a check this loop does not have: ${options.from} — it has: ` +
          names.join(', '),
      );
    }
    return new Set(names.slice(index));
  }
  return new Set(names);
}

/** @param {string} name @param {string} detail */
function skipped(name, detail) {
  return {
    name,
    status: /** @type {const} */ ('unknown'),
    detail,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    seqWindow: { from: 0, to: 0 },
    screenshots: [],
    errors: [],
    skipped: true,
  };
}

/**
 * @param {{file: string, violations: string[]}[]} axeRuns
 * @param {{maxViolations: number}} budget
 */
function scoreAxe(axeRuns, budget) {
  const all = axeRuns.flatMap((r) => r.violations);
  const unique = [...new Set(all)];
  if (axeRuns.length === 0) {
    return {
      ...skipped(
        'axe-budget',
        'the loop declares an axe budget but no check ran axe() — nothing was scanned',
      ),
      skipped: false,
    };
  }
  return {
    name: 'axe-budget',
    status: /** @type {'pass'|'fail'} */ (
      all.length <= budget.maxViolations ? 'pass' : 'fail'
    ),
    detail:
      `${all.length} violation(s) across ${axeRuns.length} scan(s), budget ` +
      `${budget.maxViolations}` +
      (unique.length === 0 ? '' : ` — ${unique.join(', ')}`),
    startedAt: new Date().toISOString(),
    durationMs: 0,
    seqWindow: { from: 0, to: 0 },
    screenshots: [],
    errors: [],
  };
}

/**
 * @param {import('./errors.mjs').CollectedError[]} errors
 * @param {{from: number, to: number}[]} windows
 * @param {number} budget
 */
function scoreErrors(errors, windows, budget) {
  // Scored against EVERY error the run collected, not only the attributed ones. Attribution
  // is a reading aid; an error that landed between two checks is still an error, and
  // budgeting only the attributed ones would reward a loop for having gaps.
  const attributed = errors.length - unattributedErrors(errors, windows).length;
  return {
    name: 'error-budget',
    status: /** @type {'pass'|'fail'} */ (errors.length <= budget ? 'pass' : 'fail'),
    detail:
      `${errors.length} error(s) collected (${attributed} attributed to a check), budget ` +
      `${budget}`,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    seqWindow: { from: 0, to: 0 },
    screenshots: [],
    errors: [],
  };
}
