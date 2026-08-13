/**
 * @param {object} options
 * @param {(identity: Record<string, unknown>, config: import('../config.mjs').ResolvedConfig) => Promise<string>} options.obtain
 * @param {'cookie' | 'header' | 'localStorage'} [options.inject] default 'cookie'
 * @param {string} [options.name] cookie/header/storage key name
 * @param {(token: string) => string} [options.format] e.g. t => `Bearer ${t}`
 */
export function tokenAuthProvider(options: {
    obtain: (identity: Record<string, unknown>, config: import("../config.mjs").ResolvedConfig) => Promise<string>;
    inject?: "header" | "cookie" | "localStorage" | undefined;
    name?: string | undefined;
    format?: ((token: string) => string) | undefined;
}): import("./provider.mjs").AuthProvider;
