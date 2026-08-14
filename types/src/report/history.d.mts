/**
 * @param {object} args
 * @param {string} args.loopName
 * @param {{run: string, results: any}[]} args.runs oldest first
 * @param {import('../findings.mjs').Finding[]} [args.findings]
 */
export function renderHistory(args: {
    loopName: string;
    runs: {
        run: string;
        results: any;
    }[];
    findings?: import("../findings.mjs").Finding[] | undefined;
}): string;
/**
 * Rebuild runs/history.html from the run directories on disk. A run directory with no
 * results.json (aborted before writing anything) is skipped rather than fatal — the grid
 * shows what exists. Returns the path, or undefined when the loop has no runs to show.
 *
 * @param {string} loopDir
 * @param {{findings?: import('../findings.mjs').Finding[]}} [options]
 */
export function writeHistory(loopDir: string, options?: {
    findings?: import("../findings.mjs").Finding[];
}): string | undefined;
