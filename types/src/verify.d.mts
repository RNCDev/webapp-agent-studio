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
 * Do the configured mask selectors resolve at all?
 *
 * A selector the engine rejects is a broken config — it would throw on the first capture
 * that uses it, inside a loop, far from its cause. Zero matches is NOT a failure: a
 * secret-bearing selector is absent from most screens (that is why capture() has
 * `requireMask` for the screens where it must be present). The match count is reported so
 * a reader can see a selector that never matches anything and decide.
 *
 * @param {import('playwright').Page} page
 * @param {string[]} selectors
 * @returns {Promise<{selector: string, ok: boolean, matches?: number, error?: string}[]>}
 */
export function checkMaskSelectors(page: import("playwright").Page, selectors: string[]): Promise<{
    selector: string;
    ok: boolean;
    matches?: number;
    error?: string;
}[]>;
/**
 * Is the settle selector on the SIGNED-OUT screen?
 *
 * The settle selector must name something that exists only after the app has settled; a
 * selector that is already visible signed-out resolves on the flash and every screenshot
 * catches the wrong screen. waitForSettled uses Playwright's waitForSelector, whose
 * default state is 'visible' — so present-but-hidden still gates, and only
 * visible-signed-out is the foot-gun.
 *
 * @param {import('playwright').Page} page a page on the signed-out screen
 * @param {string} settle
 */
export function probeSettleSignedOut(page: import("playwright").Page, settle: string): Promise<{
    present: boolean;
    visible: boolean;
}>;
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
/**
 * A token-shaped string for this run, planted so its disappearance can be asserted.
 *
 * Shaped to match the `jwt` preset, which is on by default, so the check needs no
 * configuration. Freshly random every run, because the verify artifacts directory is
 * reused: a fixed canary would let a leak from a PREVIOUS run be read as this one's, and
 * — worse — a run that never planted anything could match an old file and pass.
 */
export function plantedCanary(): string;
