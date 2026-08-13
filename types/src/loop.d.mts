/**
 * @typedef {object} CheckContext
 * @property {import('./harness.mjs').Studio} studio open more sessions from here
 * @property {import('./session.mjs').Session} session the loop's primary session
 * @property {import('playwright').Page} page shorthand for session.page
 * @property {import('./config.mjs').ResolvedConfig} config
 * @property {Record<string, unknown>} ctx shared across the loop's checks, set up by setup()
 * @property {import('./session.mjs').Session['capture']} capture
 * @property {import('./session.mjs').Session['axe']} axe
 *
 * @typedef {'pass' | 'fail' | 'unknown'} Status
 * @typedef {Status | {status: Status, detail?: string} | void} Verdict
 *
 * @typedef {object} Check
 * @property {string} name
 * @property {(context: CheckContext) => Promise<Verdict>} run
 *
 * @typedef {object} Judgment
 * @property {string} name
 * @property {string} instruction what the reader is being asked to decide
 * @property {string[]} [artifacts] the evidence — file names within the run dir
 *
 * @typedef {object} LoopDefinition
 * @property {string} task
 * @property {{identity?: string, colorScheme?: 'light'|'dark', signIn?: boolean} | null} [session]
 * @property {(context: Omit<CheckContext, 'capture'|'axe'>) => Promise<void>} [setup]
 * @property {(context: Omit<CheckContext, 'capture'|'axe'>) => Promise<void>} [teardown]
 * @property {{
 *   checks: Check[],
 *   axe?: {maxViolations: number},
 *   errorBudget?: number,
 *   judgments?: Judgment[],
 *   requireOnePass?: boolean,
 * }} eval
 * @property {{mode: 'human'}} [remediation]
 * @property {string} [supersedes]
 */
/** @param {LoopDefinition} definition */
export function defineLoop(definition: LoopDefinition): {
    remediation: {
        mode: "human";
    };
    eval: {
        axe: {
            maxViolations: number;
        } | null;
        errorBudget: number | null;
        judgments: Judgment[];
        requireOnePass: boolean;
        checks: Check[];
    };
    task: string;
    session?: {
        identity?: string;
        colorScheme?: "light" | "dark";
        signIn?: boolean;
    } | null | undefined;
    setup?: ((context: Omit<CheckContext, "capture" | "axe">) => Promise<void>) | undefined;
    teardown?: ((context: Omit<CheckContext, "capture" | "axe">) => Promise<void>) | undefined;
    supersedes?: string | undefined;
};
/** @typedef {ReturnType<typeof defineLoop>} Loop */
/**
 * Normalize whatever a check returned into a status and a detail.
 *
 * A check that returns NOTHING records `unknown`, never `pass`. A check whose body is
 * skipped by an early return, or whose assertions never ran, is indistinguishable from one
 * that succeeded — and the whole design rests on unknown never reading as pass.
 *
 * @param {Verdict} verdict
 * @returns {{status: Status, detail: string}}
 */
export function normalizeVerdict(verdict: Verdict): {
    status: Status;
    detail: string;
};
export type CheckContext = {
    /**
     * open more sessions from here
     */
    studio: import("./harness.mjs").Studio;
    /**
     * the loop's primary session
     */
    session: import("./session.mjs").Session;
    /**
     * shorthand for session.page
     */
    page: import("playwright").Page;
    config: import("./config.mjs").ResolvedConfig;
    /**
     * shared across the loop's checks, set up by setup()
     */
    ctx: Record<string, unknown>;
    capture: import("./session.mjs").Session["capture"];
    axe: import("./session.mjs").Session["axe"];
};
export type Status = "pass" | "fail" | "unknown";
export type Verdict = Status | {
    status: Status;
    detail?: string;
} | void;
export type Check = {
    name: string;
    run: (context: CheckContext) => Promise<Verdict>;
};
export type Judgment = {
    name: string;
    /**
     * what the reader is being asked to decide
     */
    instruction: string;
    /**
     * the evidence — file names within the run dir
     */
    artifacts?: string[] | undefined;
};
export type LoopDefinition = {
    task: string;
    session?: {
        identity?: string;
        colorScheme?: "light" | "dark";
        signIn?: boolean;
    } | null | undefined;
    setup?: ((context: Omit<CheckContext, "capture" | "axe">) => Promise<void>) | undefined;
    teardown?: ((context: Omit<CheckContext, "capture" | "axe">) => Promise<void>) | undefined;
    eval: {
        checks: Check[];
        axe?: {
            maxViolations: number;
        };
        errorBudget?: number;
        judgments?: Judgment[];
        requireOnePass?: boolean;
    };
    remediation?: {
        mode: "human";
    } | undefined;
    supersedes?: string | undefined;
};
export type Loop = ReturnType<typeof defineLoop>;
