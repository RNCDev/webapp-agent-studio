/**
 * @param {object} args
 * @param {string} args.loopDir
 * @param {string} args.loopName
 * @param {import('./loop.mjs').Loop} args.loop
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {object} [args.options]
 * @param {string[]} [args.options.only] run just these checks; the rest record `unknown`
 * @param {string} [args.options.from] start at this check; earlier ones record `unknown`
 * @param {boolean | 'on-fail'} [args.options.trace] default 'on-fail': traces are recorded
 *   on every run and kept only when the run failed — the failing case is maximally
 *   debuggable and the green case costs no disk. `true` always keeps, `false` never records.
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
        trace?: boolean | "on-fail" | undefined;
        requireJudgments?: boolean | undefined;
        log?: ((line: string) => void) | undefined;
    } | undefined;
}): Promise<{
    run: string;
    runDir: string;
    reportPath: string;
    historyPath: string | undefined;
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
/**
 * Whether a run's traces are written to disk when the studio closes.
 *
 * The default mode is 'on-fail': tracing is always RECORDED (the decision to keep a trace
 * can only be made after the run, and a trace not recorded cannot be kept), and written
 * only when the run failed. `--trace` forces keeping; `--no-trace` skips recording.
 *
 * @param {boolean | 'on-fail'} traceMode
 * @param {boolean} failed
 */
export function shouldKeepTraces(traceMode: boolean | "on-fail", failed: boolean): boolean;
import { diffScreenshots } from './report/diff.mjs';
