// @ts-check
// Filing a verdict on a judgment.
//
// A judgment is the part of an eval a program cannot settle: whether the contrast is
// legible, whether the layout reads right, whether the empty state says something useful.
// The loop declares the question and names the evidence; a reader answers it.
//
// FILED WITH THE CLI, NOT BY HAND-EDITING JSON. Mechanical for agents, low-friction for
// humans, and it keeps results.json valid — a hand-edited verdict that misspells a status
// would render as neither pass nor fail.
//
// `--by` RECORDS WHO. Visual judgments are exactly what a vision-capable agent session can
// file, and it will; the record should say so rather than implying a person looked.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertResults } from './results-schema.mjs';

const VERDICTS = new Set(['pass', 'fail', 'unknown']);

/**
 * @param {string} runDir
 * @param {string} name
 * @param {{verdict: string, note?: string, by?: string}} args
 */
export function fileJudgment(runDir, name, args) {
  if (!VERDICTS.has(args.verdict)) {
    throw new Error(
      `verdict must be pass, fail or unknown (got '${args.verdict}') — 'unknown' is how a ` +
        'verdict is withdrawn, and is a real state',
    );
  }
  const path = join(runDir, 'results.json');
  if (!existsSync(path)) {
    throw new Error(`no results.json in ${runDir} — is that a run directory?`);
  }
  const results = assertResults(JSON.parse(readFileSync(path, 'utf8')), path);
  const judgment = results.judgments.find((/** @type {any} */ j) => j.name === name);
  if (judgment === undefined) {
    throw new Error(
      `run ${results.run} declares no judgment '${name}' — it has: ` +
        `${results.judgments.map((/** @type {any} */ j) => j.name).join(', ') || '(none)'}`,
    );
  }
  judgment.verdict = args.verdict;
  judgment.at = new Date().toISOString();
  if (args.note !== undefined) judgment.note = args.note;
  if (args.by !== undefined) judgment.by = args.by;

  results.pendingJudgments = results.judgments.filter(
    (/** @type {any} */ j) => j.verdict === 'unknown',
  ).length;

  assertResults(results, path);
  writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
  return { results, judgment };
}
