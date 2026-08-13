// @ts-check
import { describe, expect, it } from 'vitest';
import { diffTable, formatDiff } from '../src/table-diff.mjs';

describe('diffTable', () => {
  const fixture = {
    rows: { Alpha: { irr: 12.5, n: 30 }, Beta: { irr: 8.0, n: 12 } },
  };

  it('passes when every figure matches', () => {
    const result = diffTable({ Alpha: { irr: 12.5, n: 30 }, Beta: { irr: 8.0, n: 12 } }, fixture);
    expect(result.ok).toBe(true);
    expect(formatDiff(result)).toBe('all figures match');
  });

  it('matches rows by label, not position', () => {
    const result = diffTable({ Beta: { irr: 8.0, n: 12 }, Alpha: { irr: 12.5, n: 30 } }, fixture);
    expect(result.ok).toBe(true);
  });

  it('accepts drift inside the tolerance', () => {
    const result = diffTable({ Alpha: { irr: 12.54, n: 30 }, Beta: { irr: 8.0, n: 12 } }, fixture);
    expect(result.ok).toBe(true);
  });

  it('rejects drift outside the tolerance', () => {
    const result = diffTable({ Alpha: { irr: 13.5, n: 30 }, Beta: { irr: 8.0, n: 12 } }, fixture);
    expect(result.ok).toBe(false);
    expect(result.differences[0]).toMatchObject({ label: 'Alpha', column: 'irr' });
  });

  it('compares counts exactly, whatever the tolerance', () => {
    // A count is not a rounded figure, and n moving is the signal that the data changed.
    const result = diffTable({ Alpha: { irr: 12.5, n: 31 }, Beta: { irr: 8.0, n: 12 } }, fixture);
    expect(result.ok).toBe(false);
    expect(result.differences[0].column).toBe('n');
  });

  it('reports a missing row rather than passing it', () => {
    const result = diffTable({ Alpha: { irr: 12.5, n: 30 } }, fixture);
    expect(result.ok).toBe(false);
    expect(result.differences[0]).toMatchObject({ label: 'Beta', column: '*' });
    expect(formatDiff(result)).toContain('row absent');
  });

  it('keeps a declared drift out of the failures and still reports it', () => {
    const withDrift = {
      ...fixture,
      knownDrift: [{ label: 'Alpha', column: 'irr', reason: 'restated 2026-Q1' }],
    };
    const result = diffTable(
      { Alpha: { irr: 20, n: 30 }, Beta: { irr: 8.0, n: 12 } },
      withDrift,
    );
    expect(result.ok).toBe(true);
    expect(result.drifts).toHaveLength(1);
    expect(formatDiff(result)).toContain('DRIFT');
  });

  it('treats a NaN cell as a difference', () => {
    const result = diffTable({ Alpha: { irr: NaN, n: 30 }, Beta: { irr: 8.0, n: 12 } }, fixture);
    expect(result.ok).toBe(false);
  });
});
