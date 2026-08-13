/**
 * @param {object} args
 * @param {string} args.runDir
 * @param {any} args.results
 * @param {any} args.diff
 * @param {import('../findings.mjs').Finding[]} [args.findings]
 * @param {{verified: any[], recovered: any[]}} [args.reconciled]
 * @param {string} [args.directives] contents of directives.md, if any
 */
export function renderReport(args: {
    runDir: string;
    results: any;
    diff: any;
    findings?: import("../findings.mjs").Finding[] | undefined;
    reconciled?: {
        verified: any[];
        recovered: any[];
    } | undefined;
    directives?: string | undefined;
}): string;
/**
 * Render and write report.html into a run directory.
 * @param {Parameters<typeof renderReport>[0]} args
 */
export function writeReport(args: Parameters<typeof renderReport>[0]): string;
/**
 * Re-render a run's report from the JSON already on disk.
 *
 * This is why the report is generated from files rather than from live objects: a run from
 * six months ago can be re-rendered by a newer version of the studio without re-running it.
 *
 * @param {string} runDir
 * @param {{findings?: import('../findings.mjs').Finding[]}} [options]
 */
export function rerenderReport(runDir: string, options?: {
    findings?: import("../findings.mjs").Finding[];
}): string;
