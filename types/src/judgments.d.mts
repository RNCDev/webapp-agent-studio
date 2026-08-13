/**
 * @param {string} runDir
 * @param {string} name
 * @param {{verdict: string, note?: string, by?: string}} args
 */
export function fileJudgment(runDir: string, name: string, args: {
    verdict: string;
    note?: string;
    by?: string;
}): {
    results: any;
    judgment: any;
};
