// @ts-check
import { describe, expect, it } from 'vitest';
import {
  advanceFinding,
  draftFinding,
  openFindings,
  reconcileAfterRun,
  slugFor,
} from '../src/findings.mjs';

/** @returns {{findings: import('../src/findings.mjs').Finding[]}} */
const empty = () => ({ findings: [] });

describe('the findings lifecycle', () => {
  it('drafts a finding from a failing check', () => {
    const data = empty();
    const { created, finding } = draftFinding(data, {
      slug: 'docket-totality',
      title: 'a candidate went missing',
      check: 'docket-totality',
      run: '001',
    });
    expect(created).toBe(true);
    expect(finding.status).toBe('open');
    expect(finding.firstSeenRun).toBe('001');
  });

  it('does not draft a second finding for the same slug', () => {
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'a', run: '001' });
    const second = draftFinding(data, { slug: 'a', title: 'x', check: 'a', run: '002' });
    expect(second.created).toBe(false);
    expect(data.findings).toHaveLength(1);
    expect(data.findings[0].lastFailedRun).toBe('002');
  });

  it('advances open → fix-directed and records who directed it', () => {
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'a', run: '001' });
    const finding = advanceFinding(data, 'a', {
      status: 'fix-directed',
      by: 'ritu',
      note: 'fix the well grouping',
      run: '001',
    });
    expect(finding.status).toBe('fix-directed');
    expect(finding.directedRun).toBe('001');
    expect(finding.history.at(-1)).toMatchObject({ by: 'ritu', status: 'fix-directed' });
  });

  it('refuses an illegal move and says which are legal', () => {
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'a', run: '001' });
    // open → verified-fixed would mean a fix was verified that nobody ever directed.
    expect(() => advanceFinding(data, 'a', { status: 'verified-fixed' })).toThrow(
      /legal moves from here/,
    );
  });

  it('verifies a directed finding when its check passes', () => {
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'check-a', run: '001' });
    advanceFinding(data, 'a', { status: 'fix-directed', run: '001' });
    const result = reconcileAfterRun(data, [{ name: 'check-a', status: 'pass' }], '002');
    expect(result.verified.map((f) => f.slug)).toEqual(['a']);
    expect(data.findings[0].status).toBe('verified-fixed');
  });

  it('does NOT verify an undirected finding that merely stopped failing', () => {
    // Recovered by accident is not fixed: nobody decided anything, so the cause is still
    // unknown, and an unknown cause comes back.
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'check-a', run: '001' });
    const result = reconcileAfterRun(data, [{ name: 'check-a', status: 'pass' }], '002');
    expect(result.verified).toHaveLength(0);
    expect(result.recovered.map((f) => f.slug)).toEqual(['a']);
    expect(data.findings[0].status).toBe('open');
  });

  it('reopens a verified-fixed finding that fails again, keeping its history', () => {
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'check-a', run: '001' });
    advanceFinding(data, 'a', { status: 'fix-directed', run: '001' });
    reconcileAfterRun(data, [{ name: 'check-a', status: 'pass' }], '002');
    draftFinding(data, { slug: 'a', title: 'x', check: 'check-a', run: '003' });
    expect(data.findings[0].status).toBe('open');
    expect(data.findings[0].history.length).toBeGreaterThan(2);
    expect(data.findings).toHaveLength(1);
  });

  it('counts open and fix-directed as still open', () => {
    const data = empty();
    draftFinding(data, { slug: 'a', title: 'x', check: 'a', run: '001' });
    draftFinding(data, { slug: 'b', title: 'y', check: 'b', run: '001' });
    advanceFinding(data, 'b', { status: 'fix-directed' });
    draftFinding(data, { slug: 'c', title: 'z', check: 'c', run: '001' });
    advanceFinding(data, 'c', { status: 'accepted' });
    expect(openFindings(data).map((f) => f.slug)).toEqual(['a', 'b']);
  });

  it('slugs a check name', () => {
    expect(slugFor('docket SEC exact first!')).toBe('docket-sec-exact-first');
  });
});
