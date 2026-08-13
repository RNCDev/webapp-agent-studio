// @ts-check
// report.html — generated from the JSON on disk, so any run can be re-rendered later.
//
// SCREENSHOTS ON DISK REMAIN THE PRIMARY ARTIFACT. This page is a reading aid that puts
// them next to the check that took them, the errors that fired during it, and the finding
// it belongs to. Nothing here is the only copy of anything.
//
// The page is written to be read by a person AND by an agent with only Bash and Read:
// every status is a word, not only a colour; every number is in the text; nothing that
// matters is conveyed by layout alone.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml, page } from './template.mjs';
import { assertResults } from '../results-schema.mjs';

/**
 * @param {object} args
 * @param {string} args.runDir
 * @param {any} args.results
 * @param {any} args.diff
 * @param {import('../findings.mjs').Finding[]} [args.findings]
 * @param {{verified: any[], recovered: any[]}} [args.reconciled]
 * @param {string} [args.directives] contents of directives.md, if any
 */
export function renderReport(args) {
  const { results, diff } = args;
  const findings = args.findings ?? [];
  const reconciled = args.reconciled ?? { verified: [], recovered: [] };

  /** @type {Map<string, import('../findings.mjs').Finding>} */
  const byCheck = new Map();
  for (const f of findings) if (f.check !== undefined) byCheck.set(f.check, f);

  const body = [
    header(results),
    diffSection(diff, reconciled, args.directives),
    checksSection(results, byCheck),
    judgmentsSection(results),
    findingsSection(findings),
    unattributedSection(results),
    footer(results),
  ].join('\n');

  return page({ title: `${results.loop} run ${results.run}`, body });
}

/** @param {any} r */
function header(r) {
  const t = r.tally;
  const filter =
    r.filter === null
      ? ''
      : `<div class="banner warn"><strong>Partial run.</strong> Only some checks ran ` +
        `(${escapeHtml(JSON.stringify(r.filter))}); the rest are recorded as unknown and ` +
        `this run is not comparable to a full one.</div>`;
  return `
<h1>${escapeHtml(r.loop)} — run ${escapeHtml(r.run)}</h1>
<p class="task">${escapeHtml(r.task)}</p>
<p class="meta">
  ${escapeHtml(r.startedAt)} · ${escapeHtml(String(Math.round(r.durationMs / 100) / 10))}s ·
  ${escapeHtml(r.baseURL ?? '')} · exit code ${escapeHtml(String(r.exitCode))}
</p>
<div class="tally">
  <span class="pill pass">${t.pass} pass</span>
  <span class="pill fail">${t.fail} fail</span>
  <span class="pill unknown">${t.unknown} unknown</span>
  ${r.pendingJudgments > 0 ? `<span class="pill unknown">${r.pendingJudgments} judgment(s) pending</span>` : ''}
</div>
${filter}`;
}

/**
 * The diff goes at the TOP, against the directives, because it answers the question a
 * person opens the report to ask: did what we directed actually get fixed?
 *
 * @param {any} diff
 * @param {{verified: any[], recovered: any[]}} reconciled
 * @param {string} [directives]
 */
function diffSection(diff, reconciled, directives) {
  if (diff.previousRun === null) {
    return `<h2>Since the last run</h2><p class="empty">${escapeHtml(diff.note)}</p>`;
  }
  const rows = [];
  if (diff.regressed.length > 0) {
    rows.push(
      `<div class="banner bad"><strong>Regressed since run ${escapeHtml(diff.previousRun)}:</strong> ` +
        diff.regressed
          .map((/** @type {any} */ d) => `${escapeHtml(d.name)} (${escapeHtml(d.from)} → ${escapeHtml(d.to)})`)
          .join(', ') +
        `</div>`,
    );
  }
  if (reconciled.verified.length > 0) {
    rows.push(
      `<div class="banner good"><strong>Verified fixed:</strong> ` +
        reconciled.verified.map((/** @type {any} */ f) => escapeHtml(f.slug)).join(', ') +
        ` — directed, then passed.</div>`,
    );
  }
  if (reconciled.recovered.length > 0) {
    rows.push(
      `<div class="banner warn"><strong>Recovered without being directed:</strong> ` +
        reconciled.recovered.map((/** @type {any} */ f) => escapeHtml(f.slug)).join(', ') +
        ` — nobody decided anything and these stopped failing, so the cause is still ` +
        `unknown. A cause nobody found comes back.</div>`,
    );
  }
  if (diff.slower.length > 0) {
    rows.push(
      `<div class="banner warn"><strong>Markedly slower:</strong> ` +
        diff.slower
          .map((/** @type {any} */ s) => `${escapeHtml(s.name)} (${s.was}ms → ${s.now}ms)`)
          .join(', ') +
        ` — slow-then-pass is what flakiness looks like before it fails.</div>`,
    );
  }
  const changedShots = (diff.screenshots ?? []).filter(
    (/** @type {any} */ s) => s.status === 'changed',
  );
  if (changedShots.length > 0) {
    rows.push(
      `<div class="banner warn"><strong>${changedShots.length} screenshot(s) changed:</strong> ` +
        changedShots
          .map(
            (/** @type {any} */ s) =>
              `<a href="${escapeHtml(s.file)}">${escapeHtml(s.file)}</a>` +
              (s.sizeDeltaPct === undefined ? '' : ` (${s.sizeDeltaPct > 0 ? '+' : ''}${s.sizeDeltaPct}% bytes)`),
          )
          .join(', ') +
        ` — a byte comparison, not a perceptual one, so small rendering differences count. ` +
        `A pointer for a human, never a verdict.</div>`,
    );
  }
  if (diff.added.length > 0 || diff.removed.length > 0) {
    rows.push(
      `<p class="meta">Added: ${diff.added.map(escapeHtml).join(', ') || '—'} · ` +
        `Removed: ${diff.removed.map(escapeHtml).join(', ') || '—'}</p>`,
    );
  }
  if (rows.length === 0) {
    rows.push(
      `<p class="empty">No change in any check's status since run ${escapeHtml(diff.previousRun)}.</p>`,
    );
  }
  const directiveBlock =
    directives === undefined || directives.trim() === ''
      ? ''
      : `<details class="errs" open><summary>directives.md</summary><pre class="mono">${escapeHtml(directives)}</pre></details>`;
  return `<h2>Since the last run</h2>\n${rows.join('\n')}\n${directiveBlock}`;
}

/**
 * @param {any} r
 * @param {Map<string, import('../findings.mjs').Finding>} byCheck
 */
function checksSection(r, byCheck) {
  const cards = r.checks
    .map((/** @type {any} */ c) => {
      const finding = byCheck.get(c.name);
      const shots =
        c.screenshots.length === 0
          ? ''
          : `<div class="shots">${c.screenshots
              .map(
                (/** @type {string} */ s) =>
                  `<figure><a href="${escapeHtml(s)}"><img src="${escapeHtml(s)}" alt="${escapeHtml(s)}" loading="lazy"></a>` +
                  `<figcaption>${escapeHtml(s)}</figcaption></figure>`,
              )
              .join('')}</div>`;
      const errs =
        c.errors.length === 0
          ? ''
          : `<details class="errs"><summary>${c.errors.length} error(s) during this check</summary>` +
            `<pre class="mono">${escapeHtml(JSON.stringify(c.errors, null, 2))}</pre></details>`;
      const findingCard =
        finding === undefined
          ? ''
          : `<p class="meta">finding <code>${escapeHtml(finding.slug)}</code> ` +
            `<span class="tag ${escapeHtml(finding.status)}">${escapeHtml(finding.status)}</span></p>`;
      return `
<div class="check ${escapeHtml(c.status)}">
  <div class="check-head">
    <span class="status ${escapeHtml(c.status)}">${escapeHtml(c.status)}</span>
    <h3>${escapeHtml(c.name)}</h3>
    <span class="dur">${escapeHtml(String(c.durationMs))}ms</span>
  </div>
  ${c.detail === '' ? '' : `<p class="detail">${escapeHtml(c.detail)}</p>`}
  ${findingCard}
  ${shots}
  ${errs}
</div>`;
    })
    .join('\n');
  return `<h2>Checks</h2>\n${cards}`;
}

/** @param {any} r */
function judgmentsSection(r) {
  if (r.judgments.length === 0) return '';
  const cards = r.judgments
    .map((/** @type {any} */ j) => {
      const evidence =
        j.artifacts.length === 0
          ? '<span class="empty">no artifacts named — the judgment should name its evidence</span>'
          : j.artifacts
              .map(
                (/** @type {string} */ a) =>
                  `<a href="${escapeHtml(a)}"><code>${escapeHtml(a)}</code></a>`,
              )
              .join(', ');
      const by =
        j.by === undefined || j.by === null
          ? ''
          : ` <span class="meta">filed by ${escapeHtml(j.by)}${j.at === undefined ? '' : ` at ${escapeHtml(j.at)}`}</span>`;
      return `
<div class="card">
  <div class="check-head">
    <span class="status ${escapeHtml(j.verdict)}">${escapeHtml(j.verdict)}</span>
    <h3>${escapeHtml(j.name)}</h3>
  </div>
  <p class="detail">${escapeHtml(j.instruction)}</p>
  <p class="meta">evidence: ${evidence}</p>
  ${j.note === undefined || j.note === null ? '' : `<p class="detail">${escapeHtml(j.note)}</p>`}${by}
  ${j.verdict === 'unknown' ? `<p class="meta">file a verdict: <code>webapp-agent-studio judge ${escapeHtml(r.loop)}/${escapeHtml(r.run)} ${escapeHtml(j.name)} pass|fail --by you</code></p>` : ''}
</div>`;
    })
    .join('\n');
  return `<h2>Judgments</h2>
<p class="meta">Judged by a reader, not a program. Pending judgments are <strong>unknown</strong>, which is a state, not a pass.</p>
${cards}`;
}

/** @param {import('../findings.mjs').Finding[]} findings */
function findingsSection(findings) {
  if (findings.length === 0) return '';
  const rows = findings
    .map(
      (f) => `<tr>
  <td><code>${escapeHtml(f.slug)}</code></td>
  <td><span class="tag ${escapeHtml(f.status)}">${escapeHtml(f.status)}</span></td>
  <td>${escapeHtml(f.title)}</td>
  <td class="meta">first seen ${escapeHtml(f.firstSeenRun)}${f.directedRun === undefined ? '' : `, directed at ${escapeHtml(f.directedRun)}`}</td>
</tr>`,
    )
    .join('\n');
  return `<h2>Findings</h2>
<table><thead><tr><th>slug</th><th>state</th><th>title</th><th>history</th></tr></thead>
<tbody>${rows}</tbody></table>`;
}

/** @param {any} r */
function unattributedSection(r) {
  const errors = r.unattributedErrors ?? [];
  if (errors.length === 0) return '';
  return `<h2>Errors between checks</h2>
<p class="meta">Real errors that fell outside every check's window — nobody's check, and still the app's problem. The full unfiltered list is <code>errors.json</code>; attribution is a view, never a filter.</p>
<details class="errs" open><summary>${errors.length} error(s)</summary>
<pre class="mono">${escapeHtml(JSON.stringify(errors, null, 2))}</pre></details>`;
}

/** @param {any} r */
function footer(r) {
  return `<h2>This run on disk</h2>
<p class="meta">
  <code>results.json</code> — every check, machine-readable ·
  <code>errors.json</code> — every collected error, unfiltered ·
  <code>diff.json</code> — the comparison above ·
  <code>axe-*.json</code> — accessibility scans ·
  the screenshots, which are the primary artifact.
</p>
<p class="meta">Schema ${escapeHtml(r.schema)}.</p>`;
}

/**
 * Render and write report.html into a run directory.
 * @param {Parameters<typeof renderReport>[0]} args
 */
export function writeReport(args) {
  const directivesPath = join(args.runDir, '..', '..', 'directives.md');
  const directives = existsSync(directivesPath)
    ? readFileSync(directivesPath, 'utf8')
    : undefined;
  const html = renderReport({ ...args, directives });
  const path = join(args.runDir, 'report.html');
  writeFileSync(path, html);
  return path;
}

/**
 * Re-render a run's report from the JSON already on disk.
 *
 * This is why the report is generated from files rather than from live objects: a run from
 * six months ago can be re-rendered by a newer version of the studio without re-running it.
 *
 * @param {string} runDir
 * @param {{findings?: import('../findings.mjs').Finding[]}} [options]
 */
export function rerenderReport(runDir, options = {}) {
  const resultsPath = join(runDir, 'results.json');
  if (!existsSync(resultsPath)) {
    throw new Error(`no results.json in ${runDir} — nothing to render`);
  }
  const results = assertResults(JSON.parse(readFileSync(resultsPath, 'utf8')), resultsPath);
  const diffPath = join(runDir, 'diff.json');
  const diff = existsSync(diffPath)
    ? JSON.parse(readFileSync(diffPath, 'utf8'))
    : { previousRun: null, regressed: [], recovered: [], added: [], removed: [], slower: [], screenshots: [], note: 'no diff.json in this run directory' };
  return writeReport({ runDir, results, diff, findings: options.findings ?? [] });
}
