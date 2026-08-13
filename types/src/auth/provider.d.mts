/**
 * @typedef {object} SignInArgs
 * @property {import('playwright').Page} page
 * @property {import('playwright').BrowserContext} context
 * @property {Record<string, unknown>} identity the named identity from studio.config.mjs
 * @property {import('../config.mjs').ResolvedConfig} config
 *
 * @typedef {object} AuthProvider
 * @property {string} kind
 * @property {(args: SignInArgs) => Promise<void>} signIn
 * @property {(identity: Record<string, unknown>, config: import('../config.mjs').ResolvedConfig) => Promise<unknown>} [client]
 */
/** @param {AuthProvider} provider */
export function defineAuthProvider(provider: AuthProvider): AuthProvider;
/**
 * A field an identity must carry, read with a legible failure.
 *
 * Reading through the config's lazy `env()` getter can itself throw, naming the variable —
 * that error is better than anything this could say, so it is left to propagate.
 *
 * @param {Record<string, unknown>} identity
 * @param {string} field
 * @param {string} kind
 */
export function requireField(identity: Record<string, unknown>, field: string, kind: string): string;
export type SignInArgs = {
    page: import("playwright").Page;
    context: import("playwright").BrowserContext;
    /**
     * the named identity from studio.config.mjs
     */
    identity: Record<string, unknown>;
    config: import("../config.mjs").ResolvedConfig;
};
export type AuthProvider = {
    kind: string;
    signIn: (args: SignInArgs) => Promise<void>;
    client?: ((identity: Record<string, unknown>, config: import("../config.mjs").ResolvedConfig) => Promise<unknown>) | undefined;
};
