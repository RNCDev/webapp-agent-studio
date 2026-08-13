// @ts-check
import { describe, expect, it } from 'vitest';
import { createSequence, errorsInWindow, unattributedErrors } from '../src/errors.mjs';

/** @param {number} seq */
const err = (seq) => /** @type {any} */ ({ seq, kind: 'console', text: `e${seq}` });

describe('sequence-window attribution', () => {
  it('counts monotonically across sessions', () => {
    const seq = createSequence();
    expect(seq.next()).toBe(1);
    expect(seq.next()).toBe(2);
    expect(seq.current()).toBe(2);
  });

  it('attributes an error to the check it happened during', () => {
    const errors = [err(1), err(2), err(3), err(4)];
    // Check A ran while seq went 0 → 2; check B while it went 2 → 4.
    expect(errorsInWindow(errors, { from: 0, to: 2 }).map((e) => e.seq)).toEqual([1, 2]);
    expect(errorsInWindow(errors, { from: 2, to: 4 }).map((e) => e.seq)).toEqual([3, 4]);
  });

  it('is exclusive at the start and inclusive at the end, so no error lands in two checks', () => {
    const errors = [err(1), err(2)];
    const a = errorsInWindow(errors, { from: 0, to: 1 });
    const b = errorsInWindow(errors, { from: 1, to: 2 });
    expect(a.map((e) => e.seq)).toEqual([1]);
    expect(b.map((e) => e.seq)).toEqual([2]);
  });

  it('reports errors outside every window rather than dropping them', () => {
    // An error between two checks is still an error. Attribution is a view, never a filter.
    const errors = [err(1), err(2), err(3)];
    const windows = [
      { from: 0, to: 1 },
      { from: 2, to: 3 },
    ];
    expect(unattributedErrors(errors, windows).map((e) => e.seq)).toEqual([2]);
  });

  it('attributes nothing to a check during which nothing fired', () => {
    expect(errorsInWindow([err(5)], { from: 1, to: 3 })).toEqual([]);
  });
});
