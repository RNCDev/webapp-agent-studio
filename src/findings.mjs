// @ts-check
// Structured findings, and the directive lifecycle.
//
// FOUND → DIRECTED → VERIFIED IS THE PRODUCT. A test runner tells you what is failing now.
// This tells you what was failing, what someone decided to do about it, and whether the
// next run bore that out. The states are:
//
//   open           a finding exists and nothing has been decided about it
//   fix-directed   a human wrote a directive; the next run is expected to clear it
//   verified-fixed the check that produced it passed on a later run, AFTER being directed
//   accepted       judged not worth fixing; it stays visible, and stays counted
//
// A finding that starts passing again while still `open` is NOT verified-fixed — it
// recovered by accident, and the report says so. The distinction is the whole point: a
// failure that healed without anyone deciding anything is a failure that will come back.
//
// Findings survive run pruning. They live beside loop.mjs, not inside a run directory.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FINDINGS_SCHEMA = 'webapp-agent-studio/findings@1';

/** @typedef {'open' | 'fix-directed' | 'verified-fixed' | 'accepted'} FindingStatus */

/**
 * @typedef {object} Finding
 * @property {string} slug
 * @property {string} title
 * @property {FindingStatus} status
 * @property {string} [check] the check whose failure produced it
 * @property {string} firstSeenRun
 * @property {string} [lastFailedRun]
 * @property {string} [directedRun] the run in force when a fix was directed
 * @property {{at: string, status: FindingStatus, by?: string, note?: string, run?: string}[]} history
 */

/** Legal moves. Anything else is refused, with the reason. */
const TRANSITIONS = /** @type {Record<FindingStatus, FindingStatus[]>} */ ({
  open: ['fix-directed', 'accepted'],
  'fix-directed': ['verified-fixed', 'accepted', 'open'],
  // A verified-fixed finding that fails again reopens — same slug, so the history shows
  // the regression rather than starting a fresh finding that looks like a new problem.
  'verified-fixed': ['open'],
  accepted: ['open', 'fix-directed'],
});

/** @param {string} loopDir */
export function findingsPath(loopDir) {
  return join(loopDir, 'findings.json');
}

/**
 * @param {string} loopDir
 * @returns {{schema: string, findings: Finding[]}}
 */
export function loadFindings(loopDir) {
  const path = findingsPath(loopDir);
  if (!existsSync(path)) return { schema: FINDINGS_SCHEMA, findings: [] };
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(parsed.findings)) {
    throw new Error(`${path} has no findings array — it may have been edited by hand`);
  }
  return parsed;
}

/**
 * @param {string} loopDir
 * @param {{schema?: string, findings: Finding[]}} data
 */
export function saveFindings(loopDir, data) {
  const path = findingsPath(loopDir);
  writeFileSync(
    path,
    `${JSON.stringify({ schema: FINDINGS_SCHEMA, findings: data.findings }, null, 2)}\n`,
  );
  return path;
}

/**
 * A slug from a check name, so the runner can draft a finding without being told one.
 * @param {string} checkName
 */
export function slugFor(checkName) {
  return checkName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Open a finding for a failing check, unless one already carries that slug.
 *
 * DRAFTED BY THE RUNNER, CURATED BY A HUMAN. Hand-authoring a finding per failure is
 * friction that gets skipped, and a lifecycle nobody files into is worse than none.
 *
 * @param {{schema?: string, findings: Finding[]}} data
 * @param {{slug: string, title: string, check?: string, run: string}} args
 */
export function draftFinding(data, args) {
  const existing = data.findings.find((f) => f.slug === args.slug);
  const now = new Date().toISOString();
  if (existing !== undefined) {
    existing.lastFailedRun = args.run;
    // A finding that was verified fixed and is failing again reopens, carrying its history.
    if (existing.status === 'verified-fixed') {
      existing.status = 'open';
      existing.history.push({
        at: now,
        status: 'open',
        run: args.run,
        note: 'reopened — the check failed again after being verified fixed',
      });
    }
    return { finding: existing, created: false };
  }
  /** @type {Finding} */
  const finding = {
    slug: args.slug,
    title: args.title,
    status: 'open',
    ...(args.check !== undefined ? { check: args.check } : {}),
    firstSeenRun: args.run,
    lastFailedRun: args.run,
    history: [{ at: now, status: 'open', run: args.run, note: 'drafted from a failing check' }],
  };
  data.findings.push(finding);
  return { finding, created: true };
}

/**
 * Move a finding to a new state.
 *
 * @param {{schema?: string, findings: Finding[]}} data
 * @param {string} slug
 * @param {{status: FindingStatus, by?: string, note?: string, run?: string}} move
 */
export function advanceFinding(data, slug, move) {
  const finding = data.findings.find((f) => f.slug === slug);
  if (finding === undefined) {
    throw new Error(
      `no finding '${slug}' in this loop — known: ` +
        `${data.findings.map((f) => f.slug).join(', ') || '(none)'}`,
    );
  }
  const legal = TRANSITIONS[finding.status] ?? [];
  if (finding.status !== move.status && !legal.includes(move.status)) {
    throw new Error(
      `a finding cannot go from '${finding.status}' to '${move.status}' — legal moves ` +
        `from here: ${legal.join(', ')}`,
    );
  }
  finding.status = move.status;
  if (move.status === 'fix-directed' && move.run !== undefined) {
    finding.directedRun = move.run;
  }
  finding.history.push({
    at: new Date().toISOString(),
    status: move.status,
    ...(move.by !== undefined ? { by: move.by } : {}),
    ...(move.note !== undefined ? { note: move.note } : {}),
    ...(move.run !== undefined ? { run: move.run } : {}),
  });
  return finding;
}

/**
 * After a run: advance anything that was directed and now passes, and report what
 * recovered without ever being directed.
 *
 * @param {{schema?: string, findings: Finding[]}} data
 * @param {{name: string, status: string}[]} checks
 * @param {string} run
 */
export function reconcileAfterRun(data, checks, run) {
  const passing = new Set(
    checks.filter((c) => c.status === 'pass').map((c) => c.name),
  );
  /** @type {Finding[]} */
  const verified = [];
  /** @type {Finding[]} */
  const recovered = [];

  for (const finding of data.findings) {
    if (finding.check === undefined || !passing.has(finding.check)) continue;
    if (finding.status === 'fix-directed') {
      advanceFinding(data, finding.slug, {
        status: 'verified-fixed',
        run,
        note: `the check '${finding.check}' passed on run ${run} after a fix was directed`,
      });
      verified.push(finding);
    } else if (finding.status === 'open') {
      // Deliberately NOT advanced. Nobody decided anything; the check simply stopped
      // failing. Surfacing it is the point — an undirected recovery is a failure whose
      // cause is still unknown.
      recovered.push(finding);
    }
  }
  return { verified, recovered };
}

/** @param {{findings: Finding[]}} data */
export function openFindings(data) {
  return data.findings.filter(
    (f) => f.status === 'open' || f.status === 'fix-directed',
  );
}
