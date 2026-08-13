/**
 * @typedef {object} CollectedError
 * @property {'console' | 'pageerror' | 'requestfailed' | 'response'} kind
 * @property {number} seq monotonic across the whole studio, all sessions
 * @property {string} ts ISO timestamp
 * @property {string} session which session produced it
 * @property {string} [text]
 * @property {string} [message]
 * @property {string} [stack]
 * @property {string} [url]
 * @property {string} [method]
 * @property {string} [failure]
 * @property {number} [status]
 * @property {string} [statusText]
 * @property {unknown} [location]
 */
/**
 * A counter shared by every session in one studio, so the ordering of two sessions'
 * errors against each other is real and not an artifact of which array they landed in.
 */
export function createSequence(): {
    next: () => number;
    /** The current high-water mark, for opening and closing an attribution window. */
    current: () => number;
};
/**
 * Attach the four collectors to a page. Returns the array they push into.
 *
 * @param {import('playwright').Page} page
 * @param {{ sequence: ReturnType<typeof createSequence>, sessionName: string, sink?: CollectedError[] }} options
 */
export function collectErrors(page: import("playwright").Page, options: {
    sequence: ReturnType<typeof createSequence>;
    sessionName: string;
    sink?: CollectedError[];
}): CollectedError[];
/**
 * The errors that fell inside a check's sequence window.
 *
 * @param {CollectedError[]} errors
 * @param {{ from: number, to: number }} window
 */
export function errorsInWindow(errors: CollectedError[], window: {
    from: number;
    to: number;
}): CollectedError[];
/**
 * Errors that fell outside every check's window — real, and nobody's check.
 *
 * @param {CollectedError[]} errors
 * @param {{ from: number, to: number }[]} windows
 */
export function unattributedErrors(errors: CollectedError[], windows: {
    from: number;
    to: number;
}[]): CollectedError[];
export type CollectedError = {
    kind: "console" | "pageerror" | "requestfailed" | "response";
    /**
     * monotonic across the whole studio, all sessions
     */
    seq: number;
    /**
     * ISO timestamp
     */
    ts: string;
    /**
     * which session produced it
     */
    session: string;
    text?: string | undefined;
    message?: string | undefined;
    stack?: string | undefined;
    url?: string | undefined;
    method?: string | undefined;
    failure?: string | undefined;
    status?: number | undefined;
    statusText?: string | undefined;
    location?: unknown;
};
