// @ts-check
// Sign in by minting the token your app's own sign-in callback would mint, and handing it
// over in the URL the way that callback does.
//
// THE SHAPE THIS EXISTS FOR. A company app behind Entra, Okta or another corporate
// identity provider cannot be signed into by automation — the provider blocks it, and it
// is not what you are testing anyway. But such an app almost always ends its sign-in by
// redirecting to something like `/app/#token=<jwt>`, where the front end lifts the token
// out of the URL fragment into storage and scrubs the address bar. Minting that same
// token and driving that same URL lands you signed in as a REAL user, so the API
// authorizes exactly as it would in production — never a service account that can see
// everything.
//
// `tokenAuthProvider` almost covers this and deliberately does not: it injects into a
// cookie, a header, or localStorage. A fragment is different in kind — the app must
// perform its own navigation-time handoff, so the token has to arrive as part of a page
// load, not be planted before one.
//
// Being a navigating provider, it declares `navigates: true`, which stops the harness
// visiting baseURL first. Without that, sign-in cancels a page load already in flight and
// the cancelled request is collected as a genuine failed request — a test-caused entry
// against `errorBudget`, in a package that never filters errors.

import { defineAuthProvider } from './provider.mjs';

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
export function fragmentTokenAuthProvider(options) {
  const { obtain, param = 'token', path, after } = options;
  if (typeof obtain !== 'function') {
    throw new Error('fragmentTokenAuthProvider needs an `obtain` function that returns a token');
  }

  return defineAuthProvider({
    kind: 'token:fragment',
    navigates: true,
    async signIn({ page, identity, config }) {
      const token = await obtain(identity, config);
      if (typeof token !== 'string' || token === '') {
        throw new Error('fragmentTokenAuthProvider: `obtain` returned no token');
      }
      // Resolved against baseURL rather than concatenated, so a baseURL carrying a
      // sub-path ('http://host/studio/') keeps it and a caller passing an absolute URL
      // still wins. A fragment is never sent to the server, so nothing here reaches a log.
      const target = new URL(path ?? '', config.baseURL);
      target.hash = param === '' ? token : `${param}=${encodeURIComponent(token)}`;
      await page.goto(target.href);
      if (typeof after === 'function') await after(page, config);
    },
  });
}
