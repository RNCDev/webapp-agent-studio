// @ts-check
// results.json, version 1 — and a hand-written validator.
//
// Hand-written rather than ajv because the shape is small, the dependency budget is one
// runtime package, and a schema library's error messages are worse than the ones below for
// the reader who actually hits them: someone whose run just failed to write a valid file.
//
// The validator exists so that a report generated from an old run, or a results.json a
// person edited by hand, fails legibly instead of rendering half a page.

export const RESULTS_SCHEMA = 'webapp-agent-studio/results@1';

const STATUSES = new Set(['pass', 'fail', 'unknown']);
const VERDICTS = new Set(['pass', 'fail', 'unknown']);

/**
 * @param {unknown} value
 * @returns {{ok: true} | {ok: false, errors: string[]}}
 */
export function validateResults(value) {
  /** @type {string[]} */
  const errors = [];

  /** @param {unknown} v @param {string} path */
  function isObject(v, path) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push(`${path} must be an object`);
      return false;
    }
    return true;
  }
  /** @param {unknown} v @param {string} path */
  function isString(v, path) {
    if (typeof v !== 'string') errors.push(`${path} must be a string`);
  }
  /** @param {unknown} v @param {string} path */
  function isNumber(v, path) {
    if (typeof v !== 'number' || Number.isNaN(v)) errors.push(`${path} must be a number`);
  }

  if (!isObject(value, 'results')) return { ok: false, errors };
  const r = /** @type {Record<string, any>} */ (value);

  if (r.schema !== RESULTS_SCHEMA) {
    errors.push(
      `results.schema must be '${RESULTS_SCHEMA}' (got ${JSON.stringify(r.schema)}) — ` +
        'this file was written by a different version of the studio',
    );
  }
  isString(r.loop, 'results.loop');
  isString(r.run, 'results.run');
  isString(r.task, 'results.task');
  isString(r.startedAt, 'results.startedAt');
  isString(r.finishedAt, 'results.finishedAt');
  isNumber(r.durationMs, 'results.durationMs');

  if (!Array.isArray(r.checks)) {
    errors.push('results.checks must be an array');
  } else {
    r.checks.forEach((/** @type {any} */ c, /** @type {number} */ i) => {
      const path = `results.checks[${i}]`;
      if (!isObject(c, path)) return;
      isString(c.name, `${path}.name`);
      if (!STATUSES.has(c.status)) {
        errors.push(`${path}.status must be pass, fail or unknown (got ${String(c.status)})`);
      }
      isString(c.detail, `${path}.detail`);
      isNumber(c.durationMs, `${path}.durationMs`);
      if (!Array.isArray(c.screenshots)) errors.push(`${path}.screenshots must be an array`);
      if (!Array.isArray(c.errors)) errors.push(`${path}.errors must be an array`);
    });
  }

  if (!Array.isArray(r.judgments)) {
    errors.push('results.judgments must be an array');
  } else {
    r.judgments.forEach((/** @type {any} */ j, /** @type {number} */ i) => {
      const path = `results.judgments[${i}]`;
      if (!isObject(j, path)) return;
      isString(j.name, `${path}.name`);
      isString(j.instruction, `${path}.instruction`);
      if (!VERDICTS.has(j.verdict)) {
        errors.push(
          `${path}.verdict must be pass, fail or unknown (got ${String(j.verdict)}) — ` +
            'a judgment nobody has filed is `unknown`, which is a real state, not a gap',
        );
      }
    });
  }

  if (isObject(r.tally, 'results.tally')) {
    isNumber(r.tally.pass, 'results.tally.pass');
    isNumber(r.tally.fail, 'results.tally.fail');
    isNumber(r.tally.unknown, 'results.tally.unknown');
  }
  isNumber(r.exitCode, 'results.exitCode');

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Validate or throw, with every problem listed at once rather than the first.
 * @param {unknown} value
 * @param {string} [source] file path, for the message
 */
export function assertResults(value, source = 'results.json') {
  const result = validateResults(value);
  if (!result.ok) {
    throw new Error(
      `${source} is not valid ${RESULTS_SCHEMA}:\n  - ${result.errors.join('\n  - ')}`,
    );
  }
  return /** @type {any} */ (value);
}
