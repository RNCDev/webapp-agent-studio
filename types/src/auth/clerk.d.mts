/**
 * @param {object} [options]
 * @param {string} [options.identifierField] which identity field holds the identifier
 * @param {string} [options.passwordField] which identity field holds the password
 * @param {string} [options.identifierInput] selector for Clerk's identifier input
 * @param {string} [options.passwordInput] selector for Clerk's password input
 * @param {string} [options.continueName] accessible name of the continue/submit button
 * @param {number} [options.timeout] per-step wait, ms
 */
export function clerkAuthProvider(options?: {
    identifierField?: string | undefined;
    passwordField?: string | undefined;
    identifierInput?: string | undefined;
    passwordInput?: string | undefined;
    continueName?: string | undefined;
    timeout?: number | undefined;
}): import("./provider.mjs").AuthProvider;
