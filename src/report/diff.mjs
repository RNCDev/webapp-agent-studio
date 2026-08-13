// @ts-check
// Run over run: did what we directed actually get fixed?
//
// Keyed by CHECK NAME, which is why check names must be unique and stable. Renaming a
// check is renaming the question, and the diff will correctly show the old one removed and
// a new one added rather than pretending they are the same thing.
//
// THE DIFF NEVER AFFECTS THE EXIT CODE. It is a reading aid for a person comparing this
// run to the last; an exit code that moved because of history would make the same app
// state exit differently depending on what happened yesterday.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** A check taking this much longer than last time is worth mentioning. */
const SLOWER_FACTOR = 2;
const SLOWER_FLOOR_MS = 500;

/**
 * @param {any} previous results.json of the previous run, or undefined for a first run
 * @param {any} current
 */
export function diffRuns(previous, current) {
  if (previous === undefined) {
    return {
      previousRun: null,
      regressed: [],
      recovered: [],
      added: current.checks.map((/** @type {any} */ c) => c.name),
      removed: [],
      slower: [],
      screenshots: /** @type {ReturnType<typeof diffScreenshots>} */ ([]),
      note: 'first run of this loop — nothing to compare against',
    };
  }

  /** @type {Map<string, any>} */
  const before = new Map(previous.checks.map((/** @type {any} */ c) => [c.name, c]));
  /** @type {Map<string, any>} */
  const after = new Map(current.checks.map((/** @type {any} */ c) => [c.name, c]));

  /** @type {{name: string, from: string, to: string}[]} */
  const regressed = [];
  /** @type {{name: string, from: string, to: string}[]} */
  const recovered = [];
  /** @type {{name: string, was: number, now: number}[]} */
  const slower = [];

  for (const [name, now] of after) {
    const was = before.get(name);
    if (was === undefined) continue;
    if (was.status === 'pass' && now.status !== 'pass') {
      regressed.push({ name, from: was.status, to: now.status });
    } else if (was.status !== 'pass' && now.status === 'pass') {
      recovered.push({ name, from: was.status, to: now.status });
    }
    // Slow-then-pass is the precursor to flaky, and this package deliberately does not
    // retry flakiness away — so the only way it surfaces is by being measured.
    if (
      typeof was.durationMs === 'number' &&
      typeof now.durationMs === 'number' &&
      was.durationMs > 0 &&
      now.durationMs > was.durationMs * SLOWER_FACTOR &&
      now.durationMs - was.durationMs > SLOWER_FLOOR_MS
    ) {
      slower.push({ name, was: was.durationMs, now: now.durationMs });
    }
  }

  const added = [...after.keys()].filter((n) => !before.has(n));
  const removed = [...before.keys()].filter((n) => !after.has(n));

  return {
    previousRun: previous.run,
    regressed,
    recovered,
    added,
    removed,
    slower,
    screenshots: /** @type {ReturnType<typeof diffScreenshots>} */ ([]),
    note: '',
  };
}

/**
 * Which screenshots changed since the previous run.
 *
 * COARSE ON PURPOSE, AND HONEST ABOUT IT. This compares file bytes, not perception: two
 * images that differ by one antialiased pixel count as changed. It exists to turn "look at
 * everything" into "look at these four" for a UI regression that breaks no check and no
 * axe rule — it is a pointer for a human, never a verdict, and it never touches the exit
 * code. A true perceptual hash needs a PNG decoder, which would cost a dependency this
 * package does not spend.
 *
 * @param {string} previousDir
 * @param {string} currentDir
 * @param {{name: string, file: string}[]} files
 */
export function diffScreenshots(previousDir, currentDir, files) {
  /** @type {{file: string, status: 'changed' | 'same' | 'new', sizeDeltaPct?: number}[]} */
  const out = [];
  for (const { file } of files) {
    const a = join(previousDir, file);
    const b = join(currentDir, file);
    if (!existsSync(b)) continue;
    if (!existsSync(a)) {
      out.push({ file, status: 'new' });
      continue;
    }
    const hashA = createHash('sha256').update(readFileSync(a)).digest('hex');
    const hashB = createHash('sha256').update(readFileSync(b)).digest('hex');
    if (hashA === hashB) {
      out.push({ file, status: 'same' });
      continue;
    }
    const sizeA = statSync(a).size;
    const sizeB = statSync(b).size;
    out.push({
      file,
      status: 'changed',
      sizeDeltaPct: sizeA === 0 ? 0 : Math.round(((sizeB - sizeA) / sizeA) * 1000) / 10,
    });
  }
  return out;
}
