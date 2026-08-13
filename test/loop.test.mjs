// @ts-check
import { describe, expect, it } from 'vitest';
import { defineLoop, normalizeVerdict } from '../src/loop.mjs';

const minimal = {
  task: 'drive something',
  eval: { checks: [{ name: 'a', run: async () => /** @type {const} */ ('pass') }] },
};

describe('defineLoop', () => {
  it('accepts a minimal loop and defaults the rest', () => {
    const loop = defineLoop(minimal);
    expect(loop.remediation.mode).toBe('human');
    expect(loop.eval.requireOnePass).toBe(true);
    expect(loop.eval.judgments).toEqual([]);
  });

  it('refuses a loop with no task', () => {
    expect(() => defineLoop(/** @type {any} */ ({ eval: minimal.eval }))).toThrow(/task/);
  });

  it('refuses a loop with no checks', () => {
    expect(() => defineLoop(/** @type {any} */ ({ task: 't', eval: { checks: [] } }))).toThrow(
      /declares no checks/,
    );
  });

  it('refuses two checks with the same name', () => {
    // The diff is keyed by check name; duplicates would silently drop one from the report.
    expect(() =>
      defineLoop({
        task: 't',
        eval: {
          checks: [
            { name: 'a', run: async () => /** @type {const} */ ('pass') },
            { name: 'a', run: async () => /** @type {const} */ ('pass') },
          ],
        },
      }),
    ).toThrow(/must be unique/);
  });

  it('refuses a judgment with no instruction', () => {
    expect(() =>
      defineLoop({
        ...minimal,
        eval: { ...minimal.eval, judgments: [/** @type {any} */ ({ name: 'j' })] },
      }),
    ).toThrow(/no instruction/);
  });

  it('refuses a remediation mode other than human', () => {
    expect(() =>
      defineLoop({ ...minimal, remediation: /** @type {any} */ ({ mode: 'auto' }) }),
    ).toThrow(/self-driving remediation is a stated non-goal/);
  });
});

describe('normalizeVerdict', () => {
  it('records `unknown` when a check returns nothing', () => {
    // A check whose body was skipped, or whose assertions never ran, is indistinguishable
    // from one that succeeded — so nothing is never a pass.
    const verdict = normalizeVerdict(undefined);
    expect(verdict.status).toBe('unknown');
    expect(verdict.detail).toMatch(/no verdict/);
  });

  it('accepts a bare status string', () => {
    expect(normalizeVerdict('pass')).toEqual({ status: 'pass', detail: '' });
  });

  it('accepts a status with a detail', () => {
    expect(normalizeVerdict({ status: 'unknown', detail: 'docket was empty' })).toEqual({
      status: 'unknown',
      detail: 'docket was empty',
    });
  });
});
