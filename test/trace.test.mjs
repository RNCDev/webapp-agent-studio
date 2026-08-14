// @ts-check
import { describe, expect, it } from 'vitest';
import { shouldKeepTraces } from '../src/runner.mjs';

describe('shouldKeepTraces', () => {
  it('keeps traces on a failing run in the default on-fail mode', () => {
    expect(shouldKeepTraces('on-fail', true)).toBe(true);
  });

  it('discards traces on a green run in the default on-fail mode', () => {
    expect(shouldKeepTraces('on-fail', false)).toBe(false);
  });

  it('always keeps traces when tracing was forced with --trace', () => {
    expect(shouldKeepTraces(true, false)).toBe(true);
    expect(shouldKeepTraces(true, true)).toBe(true);
  });

  it('never keeps traces when tracing was disabled with --no-trace', () => {
    expect(shouldKeepTraces(false, true)).toBe(false);
    expect(shouldKeepTraces(false, false)).toBe(false);
  });
});
