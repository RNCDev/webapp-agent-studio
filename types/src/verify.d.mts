/**
 * Is the installed Playwright inside the range this package supports, and is the browser
 * actually there?
 *
 * VERSION SKEW IS AN EXIT-2 PROBLEM, NOT A FAILING CHECK. Playwright is a peer dependency,
 * so every consumer picks its own; chromium behaviour drifts between versions, and the
 * resulting weirdness would otherwise be read as a regression in the app.
 */
export function checkEnvironment(): {
    ok: boolean;
    label: string;
}[];
/** Where chromium should be, and whether it is. Separate so `verify` can report it. */
export function checkBrowserInstalled(): Promise<{
    ok: boolean;
    label: string;
}>;
/**
 * A deliberately small range check, for the one shape this package's peer range uses:
 * `>=A.B.C <D`. Not a semver implementation — a dependency for this would be absurd, and a
 * wrong answer here is caught by the message naming both versions.
 *
 * @param {string} version
 * @param {string} range
 */
export function satisfiesRange(version: string, range: string): boolean;
/**
 * Drive the configured app once and assert on what came out.
 *
 * @param {object} args
 * @param {import('./config.mjs').ResolvedConfig} args.config
 * @param {(line: string) => void} [args.log]
 */
export function verify(args: {
    config: import("./config.mjs").ResolvedConfig;
    log?: ((line: string) => void) | undefined;
}): Promise<{
    ok: boolean;
    exitCode: number;
    failures: string[];
}>;
