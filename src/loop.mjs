// @ts-check
// A loop is a declared contract: a task, an eval, and a remediation mode.
//
// ITERATIONS ARE RUNS OF THE SAME LOOP, NOT NEW LOOPS. A new loop number is minted only
// when the task or the eval changes — when the QUESTION changes. Everything else is
// another run of the same question, which is what makes run-over-run comparison mean
// anything at all.

/**
 * @typedef {object} CheckContext
 * @property {import('./harness.mjs').Studio} studio open more sessions from here
 * @property {import('./session.mjs').Session} session the loop's primary session
 * @property {import('playwright').Page} page shorthand for session.page
 * @property {import('./config.mjs').ResolvedConfig} config
 * @property {Record<string, unknown>} ctx shared across the loop's checks, set up by setup()
 * @property {import('./session.mjs').Session['capture']} capture
 * @property {import('./session.mjs').Session['axe']} axe
 *
 * @typedef {'pass' | 'fail' | 'unknown'} Status
 * @typedef {Status | {status: Status, detail?: string} | void} Verdict
 *
 * @typedef {object} Check
 * @property {string} name
 * @property {(context: CheckContext) => Promise<Verdict>} run
 *
 * @typedef {object} Judgment
 * @property {string} name
 * @property {string} instruction what the reader is being asked to decide
 * @property {string[]} [artifacts] the evidence — file names within the run dir
 *
 * @typedef {object} LoopDefinition
 * @property {string} task
 * @property {{identity?: string, colorScheme?: 'light'|'dark', signIn?: boolean} | null} [session]
 * @property {(context: Omit<CheckContext, 'capture'|'axe'>) => Promise<void>} [setup]
 * @property {(context: Omit<CheckContext, 'capture'|'axe'>) => Promise<void>} [teardown]
 * @property {{
 *   checks: Check[],
 *   axe?: {maxViolations: number},
 *   errorBudget?: number,
 *   judgments?: Judgment[],
 *   requireOnePass?: boolean,
 * }} eval
 * @property {{mode: 'human'}} [remediation]
 * @property {string} [supersedes]
 */

/** @param {LoopDefinition} definition */
export function defineLoop(definition) {
  if (typeof definition.task !== 'string' || definition.task.trim() === '') {
    throw new Error('a loop needs a `task` — one sentence saying what it drives and why');
  }
  const evaluation = definition.eval;
  if (typeof evaluation !== 'object' || evaluation === null) {
    throw new Error(`loop '${definition.task}' has no \`eval\``);
  }
  if (!Array.isArray(evaluation.checks) || evaluation.checks.length === 0) {
    throw new Error(
      `loop '${definition.task}' declares no checks — a loop with no machine checks ` +
        'cannot report anything a person did not already have to look at',
    );
  }
  const seen = new Set();
  for (const check of evaluation.checks) {
    if (typeof check.name !== 'string' || check.name === '') {
      throw new Error('every check needs a name — the diff is keyed by it');
    }
    if (seen.has(check.name)) {
      // Two checks with one name make the run-over-run diff ambiguous and silently drop
      // one of them from the report, which is worse than refusing to run.
      throw new Error(`two checks are both named '${check.name}' — names must be unique`);
    }
    seen.add(check.name);
    if (typeof check.run !== 'function') {
      throw new Error(`check '${check.name}' has no run function`);
    }
  }
  for (const judgment of evaluation.judgments ?? []) {
    if (typeof judgment.name !== 'string' || judgment.name === '') {
      throw new Error('every judgment needs a name — `judge` files a verdict against it');
    }
    if (typeof judgment.instruction !== 'string' || judgment.instruction === '') {
      throw new Error(
        `judgment '${judgment.name}' has no instruction — say what is being decided, or ` +
          'nobody can file a verdict on it',
      );
    }
  }
  const mode = definition.remediation?.mode ?? 'human';
  if (mode !== 'human') {
    throw new Error(
      `remediation mode '${mode}' is not supported — v1 keeps a human in the loop, and ` +
        'self-driving remediation is a stated non-goal',
    );
  }
  return {
    ...definition,
    remediation: { mode },
    eval: {
      ...evaluation,
      axe: evaluation.axe ?? null,
      errorBudget: evaluation.errorBudget ?? null,
      judgments: evaluation.judgments ?? [],
      // A run with zero passes asserted NOTHING. Where checks look for shapes that may not
      // be present, an all-unknown run is the likely way a loop lies: it exits green having
      // looked at data that happened to hold none of the shapes it checks. On by default.
      requireOnePass: evaluation.requireOnePass ?? true,
    },
  };
}

/** @typedef {ReturnType<typeof defineLoop>} Loop */

/**
 * Normalize whatever a check returned into a status and a detail.
 *
 * A check that returns NOTHING records `unknown`, never `pass`. A check whose body is
 * skipped by an early return, or whose assertions never ran, is indistinguishable from one
 * that succeeded — and the whole design rests on unknown never reading as pass.
 *
 * @param {Verdict} verdict
 * @returns {{status: Status, detail: string}}
 */
export function normalizeVerdict(verdict) {
  if (verdict === undefined || verdict === null) {
    return {
      status: 'unknown',
      detail:
        'the check returned no verdict — return a status, or `unknown` with a reason, so ' +
        'a check that quietly did nothing cannot read as a pass',
    };
  }
  if (typeof verdict === 'string') return { status: verdict, detail: '' };
  return { status: verdict.status, detail: verdict.detail ?? '' };
}
