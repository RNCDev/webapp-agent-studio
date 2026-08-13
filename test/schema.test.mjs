// @ts-check
import { describe, expect, it } from 'vitest';
import { RESULTS_SCHEMA, assertResults, validateResults } from '../src/results-schema.mjs';

/** @param {Partial<any>} [overrides] */
function results(overrides = {}) {
  return {
    schema: RESULTS_SCHEMA,
    loop: '005-manager-docket',
    run: '002',
    task: 'drive the docket',
    startedAt: '2026-08-13T10:00:00.000Z',
    finishedAt: '2026-08-13T10:00:20.000Z',
    durationMs: 20000,
    checks: [
      {
        name: 'a',
        status: 'pass',
        detail: '',
        startedAt: '2026-08-13T10:00:01.000Z',
        durationMs: 120,
        screenshots: [],
        errors: [],
      },
    ],
    judgments: [],
    tally: { pass: 1, fail: 0, unknown: 0 },
    exitCode: 0,
    ...overrides,
  };
}

describe('results schema v1', () => {
  it('accepts a well-formed results object', () => {
    expect(validateResults(results())).toEqual({ ok: true });
  });

  it('rejects a different schema version, naming it', () => {
    const result = validateResults(results({ schema: 'something/else@9' }));
    expect(result.ok).toBe(false);
    expect(/** @type {any} */ (result).errors[0]).toMatch(/written by a different version/);
  });

  it('rejects a status that is not pass, fail or unknown', () => {
    const bad = results();
    bad.checks[0].status = 'skipped';
    const result = validateResults(bad);
    expect(result.ok).toBe(false);
    expect(/** @type {any} */ (result).errors[0]).toMatch(/must be pass, fail or unknown/);
  });

  it('rejects a judgment verdict that is not one of the three', () => {
    const bad = results({
      judgments: [{ name: 'j', instruction: 'look', artifacts: [], verdict: 'maybe' }],
    });
    const result = validateResults(bad);
    expect(result.ok).toBe(false);
    expect(/** @type {any} */ (result).errors[0]).toMatch(/unknown.*is a real state/s);
  });

  it('lists every problem at once rather than the first', () => {
    const bad = results({ loop: 5, run: 7, exitCode: 'zero' });
    const result = validateResults(bad);
    expect(/** @type {any} */ (result).errors.length).toBeGreaterThanOrEqual(3);
  });

  it('assertResults names the file it was reading', () => {
    expect(() => assertResults({ nope: true }, 'runs/003/results.json')).toThrow(
      /runs\/003\/results\.json/,
    );
  });
});
