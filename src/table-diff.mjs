// @ts-check
// Diffing a rendered table against expected figures.
//
// ROWS MATCH BY LABEL, NOT POSITION. A table that re-sorts is one change, not fifty
// differences, and a position-matched diff would bury a real regression in noise.

const DEFAULT_TOLERANCE = 0.05;

/**
 * @typedef {Record<string, Record<string, number>>} TableRows
 * @typedef {{
 *   rows: TableRows,
 *   tolerance?: number,
 *   exactColumns?: string[],
 *   knownDrift?: { label: string, column: string, reason: string }[],
 * }} TableFixture
 */

/**
 * TOLERANCE DEFAULTS TO 0.05, AND THE FIXTURE SHOULD SET IT DELIBERATELY. Whole currency
 * units tolerate +/-1 as rounding; percentages rendered to one or two decimals do not — a
 * tolerance of 1 would let 10.2 pass as 11.2, i.e. accept a wrong figure. Do not raise a
 * fixture's tolerance to silence a failure.
 *
 * Columns named in `exactColumns` compare EXACTLY, whatever the tolerance. A count is not
 * a rounded figure, and a count moving is precisely the signal that the data changed.
 *
 * @param {string} column
 * @param {number} expected
 * @param {number | undefined} actual
 * @param {number} tolerance
 * @param {Set<string>} exact
 */
function cellMatches(column, expected, actual, tolerance, exact) {
  if (actual === undefined || Number.isNaN(actual)) return false;
  if (exact.has(column)) return actual === expected;
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * @param {TableRows} actual
 * @param {TableFixture} fixture
 */
export function diffTable(actual, fixture) {
  const tolerance = fixture.tolerance ?? DEFAULT_TOLERANCE;
  const exact = new Set(fixture.exactColumns ?? ['n', 'count']);
  const drift = new Map(
    (fixture.knownDrift ?? []).map((d) => [`${d.label}|${d.column}`, d.reason]),
  );
  /** @type {{label: string, column: string, expected: unknown, actual: unknown, delta: number}[]} */
  const differences = [];
  /** @type {{label: string, column: string, expected: unknown, actual: unknown, delta: number, reason: string}[]} */
  const drifts = [];

  for (const [label, expectedRow] of Object.entries(fixture.rows)) {
    const actualRow = actual[label];
    if (actualRow === undefined) {
      // A missing row is a difference, never a silent pass: a table that failed to render
      // at all would otherwise read as agreement, which is the worst possible false green.
      differences.push({
        label,
        column: '*',
        expected: expectedRow,
        actual: undefined,
        delta: NaN,
      });
      continue;
    }
    for (const [column, expected] of Object.entries(expectedRow)) {
      const got = actualRow[column];
      if (cellMatches(column, expected, got, tolerance, exact)) continue;
      const entry = { label, column, expected, actual: got, delta: got - expected };
      const reason = drift.get(`${label}|${column}`);
      // A declared drift is labelled, kept out of the failure count — and STILL REPORTED.
      // Re-judge every drift each run; a drift that stops being printed becomes a drift
      // nobody re-judges.
      if (reason !== undefined) drifts.push({ ...entry, reason });
      else differences.push(entry);
    }
  }

  return { ok: differences.length === 0, differences, drifts };
}

/** @param {ReturnType<typeof diffTable>} result */
export function formatDiff(result) {
  const lines = [];
  for (const d of result.differences) {
    if (d.column === '*') {
      const columns = Object.entries(/** @type {object} */ (d.expected))
        .map(([col, val]) => `${col}=${String(val)}`)
        .join(', ');
      lines.push(
        `FAIL  ${d.label}: row absent from rendered table (expected: ${columns})`,
      );
    } else {
      lines.push(
        `FAIL  ${d.label} / ${d.column}: expected ${String(d.expected)}, got ${String(d.actual)}`,
      );
    }
  }
  for (const d of result.drifts) {
    lines.push(
      `DRIFT ${d.label} / ${d.column}: expected ${String(d.expected)}, got ${String(d.actual)} — ${d.reason}`,
    );
  }
  return lines.length > 0 ? lines.join('\n') : 'all figures match';
}
