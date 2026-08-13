// @ts-check
// Sign in by obtaining a token and injecting it — as a cookie, a header, or a
// localStorage entry.
//
// For apps whose front door is not a form this studio can drive: an SSO redirect to a
// provider that will not accept automation, a machine-token flow, a preview environment
// behind a signed header. The token is obtained by project code (`obtain`), because only
// the project knows how.

import { defineAuthProvider } from './provider.mjs';

/**
 * @param {object} options
 * @param {(identity: Record<string, unknown>, config: import('../config.mjs').ResolvedConfig) => Promise<string>} options.obtain
 * @param {'cookie' | 'header' | 'localStorage'} [options.inject] default 'cookie'
 * @param {string} [options.name] cookie/header/storage key name
 * @param {(token: string) => string} [options.format] e.g. t => `Bearer ${t}`
 */
export function tokenAuthProvider(options) {
  const { obtain, inject = 'cookie', name = 'session', format = (t) => t } = options;
  if (typeof obtain !== 'function') {
    throw new Error('tokenAuthProvider needs an `obtain` function that returns a token');
  }

  return defineAuthProvider({
    kind: `token:${inject}`,
    async signIn({ page, context, identity, config }) {
      const token = await obtain(identity, config);
      if (typeof token !== 'string' || token === '') {
        throw new Error('tokenAuthProvider: `obtain` returned no token');
      }
      const value = format(token);
      const url = new URL(config.baseURL);

      if (inject === 'cookie') {
        // Same Secure trap the cookie jar guards: a Secure cookie on http:// is stored and
        // never sent, which renders signed out while the studio believes otherwise.
        const secure = url.protocol === 'https:';
        await context.addCookies([
          { name, value, domain: url.hostname, path: '/', httpOnly: false, secure, sameSite: 'Lax' },
        ]);
        return;
      }
      if (inject === 'header') {
        await context.setExtraHTTPHeaders({ [name]: value });
        return;
      }
      // localStorage is per-origin and the page must be on that origin before it exists,
      // so this runs as an init script rather than an evaluate — it must land before the
      // app's own first read, not after.
      await context.addInitScript(
        ([key, val]) => {
          window.localStorage.setItem(
            /** @type {string} */ (key),
            /** @type {string} */ (val),
          );
        },
        /** @type {[string, string]} */ ([name, value]),
      );
      await page.goto(config.baseURL);
    },
  });
}
