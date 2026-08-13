/**
 * @param {object} args
 * @param {string} args.loopDir
 * @param {string} args.loopName
 * @param {import('./loop.mjs').Loop} args.loop
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {object} [args.options]
 * @param {string[]} [args.options.only] run just these checks; the rest record `unknown`
 * @param {string} [args.options.from] start at this check; earlier ones record `unknown`
 * @param {boolean} [args.options.trace]
 * @param {boolean} [args.options.requireJudgments] pending judgments fail the run
 * @param {(line: string) => void} [args.options.log]
 */
export function runLoop(args: {
    loopDir: string;
    loopName: string;
    loop: import("./loop.mjs").Loop;
    config: import("./config.mjs").ResolvedConfig;
    options?: {
        only?: string[] | undefined;
        from?: string | undefined;
        trace?: boolean | undefined;
        requireJudgments?: boolean | undefined;
        log?: ((line: string) => void) | undefined;
    } | undefined;
}): Promise<{
    run: string;
    runDir: string;
    reportPath: string;
    results: {
        schema: string;
        loop: string;
        run: string;
        task: string;
        startedAt: string;
        finishedAt: string;
        durationMs: number;
        baseURL: string;
        filter: {
            only: string[] | null;
            from: string | null;
        } | null;
        checks: any[];
        judgments: {
            name: string;
            instruction: string;
            artifacts: string[];
            verdict: "unknown";
        }[];
        unattributedErrors: any[];
        tally: {
            pass: number;
            fail: number;
            unknown: number;
        };
        pendingJudgments: number;
        exitCode: number;
        supersedes: string | null;
    };
    diff: {
        previousRun: null;
        regressed: never[];
        recovered: never[];
        added: any;
        removed: never[];
        slower: never[];
        screenshots: ReturnType<typeof diffScreenshots>;
        note: string;
    } | {
        previousRun: any;
        regressed: {
            name: string;
            from: string;
            to: string;
        }[];
        recovered: {
            name: string;
            from: string;
            to: string;
        }[];
        added: string[];
        removed: string[];
        slower: {
            name: string;
            was: number;
            now: number;
        }[];
        screenshots: ReturnType<typeof diffScreenshots>;
        note: string;
    };
    exitCode: number;
    pruned: string[];
}>;
import { diffScreenshots } from './report/diff.mjs';
