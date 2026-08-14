// @ts-check
// runs/history.html — every kept run of one loop on a single page.
//
// THE QUESTION IT ANSWERS IS "IS THIS LOOP CONVERGING?". A per-run report compares one run
// to the one before it; this is the longer view: a check × run grid of the runs still on
// disk, with the findings lifecycle underneath. Rebuilt from the JSON on disk after every
// run — like report.html it is derived, disposable, and lives inside the gitignored runs/
// directory.
//
// Absent is not pass. A check a run did not have renders as an em dash with its own word,
// because a grid where a gap looks like a green cell would let a renamed check read as a
// fixed one.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml, page } from './template.mjs';
import { listRuns, readResults, runsDir } from '../runs.mjs';

/**
 * @param {object} args
 * @param {string} args.loopName
 * @param {{run: string, results: any}[]} args.runs oldest first
 * @param {import('../findings.mjs').Finding[]} [args.findings]
 */
export function renderHistory(args) {
  const { loopName, runs } = args;
  const findings = args.findings ?? [];
  const newest = runs[runs.length - 1]?.results;

  // Row order follows the NEWEST run — that is the current shape of the question — with
  // checks only older runs had appended at the bottom, still visible because a check that
  // vanished is information, not noise.
  /** @type {string[]} */
  const names = [];
  for (const c of newest?.checks ?? []) names.push(c.name);
  for (const { results } of [...runs].reverse()) {
    for (const c of results.checks ?? []) {
      if (!names.includes(c.name)) names.push(c.name);
    }
  }

  /** @type {Map<string, Map<string, string>>} run -> (check -> status) */
  const byRun = new Map();
  for (const { run, results } of runs) {
    byRun.set(run, new Map((results.checks ?? []).map((/** @type {any} */ c) => [c.name, c.status])));
  }

  const head = runs.map(({ run }) => `<th class="run-col">${escapeHtml(run)}</th>`).join('');
  const rows = names
    .map((name) => {
      const cells = runs
        .map(({ run }) => {
          const status = byRun.get(run)?.get(name);
          if (status === undefined) {
            return `<td class="cell absent" title="${escapeHtml(name)} did not exist on run ${escapeHtml(run)}">—</td>`;
          }
          return `<td class="cell ${escapeHtml(status)}"><span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span></td>`;
        })
        .join('');
      return `<tr><th class="check-name"><code>${escapeHtml(name)}</code></th>${cells}</tr>`;
    })
    .join('\n');

  const grid = `<h2>Checks over runs</h2>
<p class="meta">Oldest run on the left. An em dash means the run did not have that check — absent, which is not a pass. Pruned runs are gone from this view; findings below survive pruning.</p>
<div style="overflow-x:auto"><table class="grid">
<thead><tr><th></th>${head}</tr></thead>
<tbody>${rows}</tbody>
</table></div>`;

  const findingsBlock =
    findings.length === 0
      ? ''
      : `<h2>Findings</h2>
<table><thead><tr><th>slug</th><th>state</th><th>title</th><th>history</th></tr></thead>
<tbody>${findings
          .map(
            (f) => `<tr>
  <td><code>${escapeHtml(f.slug)}</code></td>
  <td><span class="tag ${escapeHtml(f.status)}">${escapeHtml(f.status)}</span></td>
  <td>${escapeHtml(f.title)}</td>
  <td class="meta">first seen ${escapeHtml(f.firstSeenRun)}${f.directedRun === undefined ? '' : `, directed at ${escapeHtml(f.directedRun)}`}${f.lastFailedRun === undefined ? '' : `, last failed ${escapeHtml(f.lastFailedRun)}`}</td>
</tr>`,
          )
          .join('\n')}</tbody></table>`;

  const body = `
<h1>${escapeHtml(loopName)} — history</h1>
${newest === undefined ? '' : `<p class="task">${escapeHtml(newest.task)}</p>`}
<p class="meta">${runs.length} run(s) on disk${newest === undefined ? '' : ` · newest ${escapeHtml(newest.run)}`}</p>
${grid}
${findingsBlock}`;

  return page({ title: `${loopName} history`, body });
}

/**
 * Rebuild runs/history.html from the run directories on disk. A run directory with no
 * results.json (aborted before writing anything) is skipped rather than fatal — the grid
 * shows what exists. Returns the path, or undefined when the loop has no runs to show.
 *
 * @param {string} loopDir
 * @param {{findings?: import('../findings.mjs').Finding[]}} [options]
 */
export function writeHistory(loopDir, options = {}) {
  const loopName = loopDir.split(/[\\/]/).filter(Boolean).pop() ?? loopDir;
  const runs = listRuns(loopDir)
    .map((run) => ({ run, results: readResults(join(runsDir(loopDir), run)) }))
    .filter((r) => r.results !== undefined);
  if (runs.length === 0) return undefined;
  const html = renderHistory({ loopName, runs, findings: options.findings });
  const path = join(runsDir(loopDir), 'history.html');
  writeFileSync(path, html);
  return path;
}
