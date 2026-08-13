// @ts-check
import { describe, expect, it } from 'vitest';
import { diffRuns } from '../src/report/diff.mjs';

/** @param {string} label @param {[string, string, number?][]} checks */
const run = (label, checks) => ({
  run: label,
  checks: checks.map(([name, status, durationMs = 100]) => ({ name, status, durationMs })),
});

describe('run-over-run diff', () => {
  it('says so on a first run rather than inventing a comparison', () => {
    const diff = diffRuns(undefined, run('001', [['a', 'pass']]));
    expect(diff.previousRun).toBeNull();
    expect(diff.added).toEqual(['a']);
    expect(diff.note).toMatch(/first run/);
  });

  it('flags a check that went from pass to fail', () => {
    const diff = diffRuns(run('001', [['a', 'pass']]), run('002', [['a', 'fail']]));
    expect(diff.regressed).toEqual([{ name: 'a', from: 'pass', to: 'fail' }]);
  });

  it('treats pass → unknown as a regression, not a wash', () => {
    // Unknown is not a pass. A check that stopped being able to tell us anything lost us
    // something, and the diff must say so.
    const diff = diffRuns(run('001', [['a', 'pass']]), run('002', [['a', 'unknown']]));
    expect(diff.regressed).toEqual([{ name: 'a', from: 'pass', to: 'unknown' }]);
  });

  it('flags a recovery', () => {
    const diff = diffRuns(run('001', [['a', 'fail']]), run('002', [['a', 'pass']]));
    expect(diff.recovered).toEqual([{ name: 'a', from: 'fail', to: 'pass' }]);
  });

  it('reports added and removed checks', () => {
    const diff = diffRuns(run('001', [['a', 'pass']]), run('002', [['b', 'pass']]));
    expect(diff.added).toEqual(['b']);
    expect(diff.removed).toEqual(['a']);
  });

  it('flags a check that got markedly slower', () => {
    const diff = diffRuns(run('001', [['a', 'pass', 200]]), run('002', [['a', 'pass', 3000]]));
    expect(diff.slower).toEqual([{ name: 'a', was: 200, now: 3000 }]);
  });

  it('ignores small slowdowns, which are noise', () => {
    const diff = diffRuns(run('001', [['a', 'pass', 100]]), run('002', [['a', 'pass', 300]]));
    expect(diff.slower).toEqual([]);
  });

  it('reports nothing when nothing changed', () => {
    const diff = diffRuns(run('001', [['a', 'pass']]), run('002', [['a', 'pass']]));
    expect(diff.regressed).toEqual([]);
    expect(diff.recovered).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });
});
