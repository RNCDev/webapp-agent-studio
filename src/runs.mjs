// @ts-check
// Run directories: minting the next one, finding the newest, pruning the old.
//
// NOBODY COMPUTES THE HIGHEST RUN NUMBER. Every command that writes a run also writes
// `runs/latest.json`, so a fresh agent session finds the newest run by reading one file
// rather than listing a directory and sorting strings. (The listing is still the source of
// truth — latest.json is rebuilt from it — because a hand-deleted run must not leave the
// pointer dangling.)
//
// Runs are NUMBERED, not timestamped. `002` can be read, said aloud, and compared; the
// timestamp lives inside results.json where it belongs.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string} loopDir */
export function runsDir(loopDir) {
  return join(loopDir, 'runs');
}

/**
 * Every run directory that exists, in order.
 * @param {string} loopDir
 */
export function listRuns(loopDir) {
  const dir = runsDir(loopDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(a) - Number(b));
}

/**
 * Mint the next run directory. Zero-padded to three so `010` sorts after `009` in every
 * listing a person or a tool will ever do.
 * @param {string} loopDir
 */
export function mintRun(loopDir) {
  const existing = listRuns(loopDir);
  const next = existing.length === 0 ? 1 : Number(existing[existing.length - 1]) + 1;
  const run = String(next).padStart(3, '0');
  const path = join(runsDir(loopDir), run);
  mkdirSync(path, { recursive: true });
  return { run, path };
}

/** @param {string} loopDir */
export function latestRun(loopDir) {
  const runs = listRuns(loopDir);
  if (runs.length === 0) return undefined;
  const run = runs[runs.length - 1];
  return { run, path: join(runsDir(loopDir), run) };
}

/** The run before this one — what a diff compares against. @param {string} loopDir @param {string} run */
export function previousRun(loopDir, run) {
  const runs = listRuns(loopDir);
  const index = runs.indexOf(run);
  if (index <= 0) return undefined;
  const previous = runs[index - 1];
  return { run: previous, path: join(runsDir(loopDir), previous) };
}

/** @param {string} loopDir @param {{run: string, path: string}} current */
export function writeLatest(loopDir, current) {
  const dir = runsDir(loopDir);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'latest.json');
  writeFileSync(
    file,
    `${JSON.stringify({ run: current.run, path: current.path, at: new Date().toISOString() }, null, 2)}\n`,
  );
  return file;
}

/**
 * Keep the last N runs. FINDINGS AND DIRECTIVES SURVIVE THIS — they live beside loop.mjs,
 * not inside a run — which is what makes pruning safe to do without asking.
 *
 * @param {string} loopDir
 * @param {number} keep
 */
export function pruneRuns(loopDir, keep) {
  if (!Number.isFinite(keep) || keep <= 0) return [];
  const runs = listRuns(loopDir);
  const doomed = runs.slice(0, Math.max(0, runs.length - keep));
  for (const run of doomed) {
    rmSync(join(runsDir(loopDir), run), { recursive: true, force: true });
  }
  return doomed;
}

/** @param {string} runDir */
export function readResults(runDir) {
  const file = join(runDir, 'results.json');
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8'));
}
