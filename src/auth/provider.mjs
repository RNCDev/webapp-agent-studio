// @ts-check
// What an auth provider is.
//
// A provider does one thing: leave the browser context signed in as an identity. It may
// also expose a `client`, which is how HTTP-side project code (provisioning hooks, data
// probes) calls the app's API as that identity without re-solving authentication.

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
export function defineAuthProvider(provider) {
  if (typeof provider.signIn !== 'function') {
    throw new Error(`auth provider '${provider.kind}' has no signIn function`);
  }
  return provider;
}

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
export function requireField(identity, field, kind) {
  const value = identity[field];
  if (typeof value !== 'string' || value === '') {
    throw new Error(
      `the ${kind} auth provider needs a '${field}' on the identity, and it is missing — ` +
        'add it to the identity in studio.config.mjs',
    );
  }
  return value;
}
