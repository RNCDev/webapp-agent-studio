// @ts-check
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHistory, writeHistory } from '../src/report/history.mjs';

/** A minimal results.json shape — only what the history grid reads. */
const results = (
  /** @type {string} */ run,
  /** @type {Record<string, 'pass'|'fail'|'unknown'>} */ checks,
  /** @type {Partial<any>} */ extra = {},
) => ({
  schema: 'webapp-agent-studio/results@1',
  loop: '001-example',
  run,
  task: 'Drive the thing',
  startedAt: '2026-08-13T00:00:00.000Z',
  checks: Object.entries(checks).map(([name, status]) => ({ name, status, detail: '' })),
  tally: {
    pass: Object.values(checks).filter((s) => s === 'pass').length,
    fail: Object.values(checks).filter((s) => s === 'fail').length,
    unknown: Object.values(checks).filter((s) => s === 'unknown').length,
  },
  ...extra,
});

describe('renderHistory', () => {
  it('renders a check × run grid with every status as a word, not only a colour', () => {
    const html = renderHistory({
      loopName: '001-example',
      runs: [
        { run: '001', results: results('001', { alpha: 'pass', beta: 'fail' }) },
        { run: '002', results: results('002', { alpha: 'pass', beta: 'pass' }) },
      ],
      findings: [],
    });
    expect(html).toContain('001-example');
    // Both run numbers head a column.
    expect(html).toContain('>001<');
    expect(html).toContain('>002<');
    // Both check names label a row.
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
    // Statuses appear as words.
    expect(html).toContain('pass');
    expect(html).toContain('fail');
  });

  it('shows a check absent from an older run as an em dash, never as pass', () => {
    const html = renderHistory({
      loopName: '001-example',
      runs: [
        { run: '001', results: results('001', { alpha: 'pass' }) },
        { run: '002', results: results('002', { alpha: 'pass', 'new-check': 'pass' }) },
      ],
      findings: [],
    });
    expect(html).toContain('—');
  });

  it('orders rows by the newest run and appends checks only older runs had', () => {
    const html = renderHistory({
      loopName: '001-example',
      runs: [
        { run: '001', results: results('001', { retired: 'fail', alpha: 'pass' }) },
        { run: '002', results: results('002', { alpha: 'pass', beta: 'pass' }) },
      ],
      findings: [],
    });
    const alpha = html.indexOf('alpha');
    const beta = html.indexOf('beta');
    const retired = html.indexOf('retired');
    expect(alpha).toBeGreaterThan(-1);
    expect(alpha).toBeLessThan(beta);
    expect(beta).toBeLessThan(retired);
  });

  it('overlays findings with their lifecycle state', () => {
    const html = renderHistory({
      loopName: '001-example',
      runs: [{ run: '001', results: results('001', { alpha: 'fail' }) }],
      findings: [
        {
          slug: 'alpha',
          title: 'alpha broke',
          status: 'fix-directed',
          check: 'alpha',
          firstSeenRun: '001',
          directedRun: '001',
          history: [],
        },
      ],
    });
    expect(html).toContain('alpha broke');
    expect(html).toContain('fix-directed');
  });
});

describe('writeHistory', () => {
  /** @type {string[]} */
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it('rebuilds runs/history.html from the run directories on disk', () => {
    const loopDir = mkdtempSync(join(tmpdir(), 'was-history-'));
    dirs.push(loopDir);
    for (const [run, checks] of /** @type {const} */ ([
      ['001', { alpha: 'fail' }],
      ['002', { alpha: 'pass' }],
    ])) {
      const dir = join(loopDir, 'runs', run);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'results.json'), JSON.stringify(results(run, checks)));
    }
    const path = writeHistory(loopDir, { findings: [] });
    expect(path).toBe(join(loopDir, 'runs', 'history.html'));
    if (path === undefined) throw new Error('unreachable');
    const html = readFileSync(path, 'utf8');
    expect(html).toContain('alpha');
    expect(html).toContain('>001<');
    expect(html).toContain('>002<');
  });

  it('skips a run directory with no results.json rather than throwing', () => {
    const loopDir = mkdtempSync(join(tmpdir(), 'was-history-'));
    dirs.push(loopDir);
    const good = join(loopDir, 'runs', '001');
    mkdirSync(good, { recursive: true });
    writeFileSync(join(good, 'results.json'), JSON.stringify(results('001', { alpha: 'pass' })));
    mkdirSync(join(loopDir, 'runs', '002'), { recursive: true }); // aborted — no results
    const path = writeHistory(loopDir, { findings: [] });
    if (path === undefined) throw new Error('writeHistory returned no path');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('>001<');
  });

  it('writes nothing when the loop has no runs at all', () => {
    const loopDir = mkdtempSync(join(tmpdir(), 'was-history-'));
    dirs.push(loopDir);
    const path = writeHistory(loopDir, { findings: [] });
    expect(path).toBeUndefined();
  });
});
