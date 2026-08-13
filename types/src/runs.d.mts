/** @param {string} loopDir */
export function runsDir(loopDir: string): string;
/**
 * Every run directory that exists, in order.
 * @param {string} loopDir
 */
export function listRuns(loopDir: string): string[];
/**
 * Mint the next run directory. Zero-padded to three so `010` sorts after `009` in every
 * listing a person or a tool will ever do.
 * @param {string} loopDir
 */
export function mintRun(loopDir: string): {
    run: string;
    path: string;
};
/** @param {string} loopDir */
export function latestRun(loopDir: string): {
    run: string;
    path: string;
} | undefined;
/** The run before this one — what a diff compares against. @param {string} loopDir @param {string} run */
export function previousRun(loopDir: string, run: string): {
    run: string;
    path: string;
} | undefined;
/** @param {string} loopDir @param {{run: string, path: string}} current */
export function writeLatest(loopDir: string, current: {
    run: string;
    path: string;
}): string;
/**
 * Keep the last N runs. FINDINGS AND DIRECTIVES SURVIVE THIS — they live beside loop.mjs,
 * not inside a run — which is what makes pruning safe to do without asking.
 *
 * @param {string} loopDir
 * @param {number} keep
 */
export function pruneRuns(loopDir: string, keep: number): string[];
/** @param {string} runDir */
export function readResults(runDir: string): any;
