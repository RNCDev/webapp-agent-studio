/**
 * @param {object} args
 * @param {import('playwright').BrowserContext} args.context
 * @param {import('playwright').Page} args.page
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {string} args.name
 * @param {string} args.outDir
 * @param {ReturnType<import('./errors.mjs').createSequence>} args.sequence
 * @param {import('./errors.mjs').CollectedError[]} args.errors
 * @param {{name: string, path: string, seq: number, ts: string}[]} args.screenshots
 * @param {{file: string, violations: string[], session: string}[]} args.axeRuns
 */
export function createSession(args: {
    context: import("playwright").BrowserContext;
    page: import("playwright").Page;
    config: import("./config.mjs").ResolvedConfig;
    name: string;
    outDir: string;
    sequence: ReturnType<typeof import("./errors.mjs").createSequence>;
    errors: import("./errors.mjs").CollectedError[];
    screenshots: {
        name: string;
        path: string;
        seq: number;
        ts: string;
    }[];
    axeRuns: {
        file: string;
        violations: string[];
        session: string;
    }[];
}): {
    name: string;
    page: import("playwright").Page;
    context: import("playwright").BrowserContext;
    errors: import("./errors.mjs").CollectedError[];
    screenshots: {
        name: string;
        path: string;
        seq: number;
        ts: string;
    }[];
    outDir: string;
    capture: (shotName: string, options?: {
        mask?: string[] | undefined;
        fullPage?: boolean | undefined;
        requireMask?: boolean | undefined;
        clip?: {
            x: number;
            y: number;
            width: number;
            height: number;
        } | undefined;
        element?: string | undefined;
        scale?: number | undefined;
        type?: "png" | "jpeg" | undefined;
        quality?: number | undefined;
    }) => Promise<string>;
    axe: (options?: {
        selector?: string;
    }) => Promise<{
        violations: {
            id: string;
        }[];
    }>;
    report: () => Promise<string>;
    close: () => Promise<void>;
    /** @param {string} label exact accessible name of a nav link */
    navTo: (label: string) => Promise<void>;
    /** @param {{timeout?: number}} [options] */
    settle: (options?: {
        timeout?: number;
    }) => Promise<void>;
};
/** @typedef {ReturnType<typeof createSession>} Session */
/** @param {string} dir */
export function ensureDir(dir: string): string;
export { collectErrors };
export type Session = ReturnType<typeof createSession>;
import { collectErrors } from './errors.mjs';
