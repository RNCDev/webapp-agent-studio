/**
 * @param {object} options
 * @param {(identity: Record<string, unknown>, config: import('../config.mjs').ResolvedConfig) => Promise<string> | string} options.obtain
 *   returns the token. Project code, because only the project knows how to mint it —
 *   typically signing the same claims its sign-in callback signs, with a secret from
 *   `env()` on the identity.
 * @param {string} [options.param] the fragment parameter name (default 'token'), so
 *   `#token=<jwt>`. Pass `null`-ish behaviour by setting it to '' for a bare `#<jwt>`.
 * @param {string} [options.path] where to land, resolved against baseURL. Defaults to
 *   baseURL itself — set it when the callback lands somewhere else.
 * @param {(page: import('playwright').Page, config: import('../config.mjs').ResolvedConfig) => Promise<void>} [options.after]
 *   anything the app needs after the handoff — a reload, a second hop. Most apps need
 *   nothing, because lifting the fragment is what their boot code already does.
 */
export function fragmentTokenAuthProvider(options: {
    obtain: (identity: Record<string, unknown>, config: import("../config.mjs").ResolvedConfig) => Promise<string> | string;
    param?: string | undefined;
    path?: string | undefined;
    after?: ((page: import("playwright").Page, config: import("../config.mjs").ResolvedConfig) => Promise<void>) | undefined;
}): import("./provider.mjs").AuthProvider;
