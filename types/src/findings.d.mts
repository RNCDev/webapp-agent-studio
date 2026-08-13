/** @param {string} loopDir */
export function findingsPath(loopDir: string): string;
/**
 * @param {string} loopDir
 * @returns {{schema: string, findings: Finding[]}}
 */
export function loadFindings(loopDir: string): {
    schema: string;
    findings: Finding[];
};
/**
 * @param {string} loopDir
 * @param {{schema?: string, findings: Finding[]}} data
 */
export function saveFindings(loopDir: string, data: {
    schema?: string;
    findings: Finding[];
}): string;
/**
 * A slug from a check name, so the runner can draft a finding without being told one.
 * @param {string} checkName
 */
export function slugFor(checkName: string): string;
/**
 * Open a finding for a failing check, unless one already carries that slug.
 *
 * DRAFTED BY THE RUNNER, CURATED BY A HUMAN. Hand-authoring a finding per failure is
 * friction that gets skipped, and a lifecycle nobody files into is worse than none.
 *
 * @param {{schema?: string, findings: Finding[]}} data
 * @param {{slug: string, title: string, check?: string, run: string}} args
 */
export function draftFinding(data: {
    schema?: string;
    findings: Finding[];
}, args: {
    slug: string;
    title: string;
    check?: string;
    run: string;
}): {
    finding: Finding;
    created: boolean;
};
/**
 * Move a finding to a new state.
 *
 * @param {{schema?: string, findings: Finding[]}} data
 * @param {string} slug
 * @param {{status: FindingStatus, by?: string, note?: string, run?: string}} move
 */
export function advanceFinding(data: {
    schema?: string;
    findings: Finding[];
}, slug: string, move: {
    status: FindingStatus;
    by?: string;
    note?: string;
    run?: string;
}): Finding;
/**
 * After a run: advance anything that was directed and now passes, and report what
 * recovered without ever being directed.
 *
 * @param {{schema?: string, findings: Finding[]}} data
 * @param {{name: string, status: string}[]} checks
 * @param {string} run
 */
export function reconcileAfterRun(data: {
    schema?: string;
    findings: Finding[];
}, checks: {
    name: string;
    status: string;
}[], run: string): {
    verified: Finding[];
    recovered: Finding[];
};
/** @param {{findings: Finding[]}} data */
export function openFindings(data: {
    findings: Finding[];
}): Finding[];
export const FINDINGS_SCHEMA: "webapp-agent-studio/findings@1";
export type FindingStatus = "open" | "fix-directed" | "verified-fixed" | "accepted";
export type Finding = {
    slug: string;
    title: string;
    status: FindingStatus;
    /**
     * the check whose failure produced it
     */
    check?: string | undefined;
    firstSeenRun: string;
    lastFailedRun?: string | undefined;
    /**
     * the run in force when a fix was directed
     */
    directedRun?: string | undefined;
    history: {
        at: string;
        status: FindingStatus;
        by?: string;
        note?: string;
        run?: string;
    }[];
};
