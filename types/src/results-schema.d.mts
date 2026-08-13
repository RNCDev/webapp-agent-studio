/**
 * @param {unknown} value
 * @returns {{ok: true} | {ok: false, errors: string[]}}
 */
export function validateResults(value: unknown): {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
/**
 * Validate or throw, with every problem listed at once rather than the first.
 * @param {unknown} value
 * @param {string} [source] file path, for the message
 */
export function assertResults(value: unknown, source?: string): any;
export const RESULTS_SCHEMA: "webapp-agent-studio/results@1";
