/**
 * Is the app answering at all?
 *
 * A plain `run` against a dead dev server would otherwise burn a full Playwright
 * navigation timeout before failing, and fail with a message about a selector rather than
 * about the port. One cheap request turns that into an instant, legible exit 2.
 *
 * Any HTTP answer counts, including a 404 or a 500: something is listening, and what it
 * serves is the app's business. Only a connection failure or a timeout is a dead app.
 *
 * @param {string} baseURL
 * @param {{ timeoutMs?: number }} [options]
 */
export function assertReachable(baseURL: string, options?: {
    timeoutMs?: number;
}): Promise<{
    ok: boolean;
    status: number;
}>;
export const EXIT_OK: 0;
export const EXIT_CHECKS_FAILED: 1;
export const EXIT_STUDIO_BROKEN: 2;
/** Anything that means the studio itself could not run. Always exit 2. */
export class StudioError extends Error {
    /** @param {string} message @param {{cause?: unknown}} [options] */
    constructor(message: string, options?: {
        cause?: unknown;
    });
    exitCode: number;
}
