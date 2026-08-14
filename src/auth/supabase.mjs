// @ts-check
// Supabase sign-in: the GoTrue password grant, injected as the localStorage session
// supabase-js reads on boot.
//
// SUPABASE KEEPS ITS SESSION IN localStorage, NOT A COOKIE — under the key
// `sb-<project-ref>-auth-token`, holding the whole session JSON. So the browser side of
// this provider is an init script (it must land before the app's own first read, like the
// token provider's localStorage mode), not a cookie hand-off. The HTTP side is one POST to
// `${url}/auth/v1/token?grant_type=password` with the anon key as `apikey`.
//
// The anon key is a publishable key, not a secret — it ships in every Supabase frontend
// bundle — which is why it is a plain config option rather than an env() field.

import { defineAuthProvider, requireField } from './provider.mjs';

/**
 * The storage key supabase-js uses: `sb-<ref>-auth-token`, where <ref> is the project ref
 * off `<ref>.supabase.co`. A local stack (localhost, a custom domain) falls back to the
 * first hostname label, which matches supabase-js's derivation for those setups. An app
 * that overrides `storageKey` in its client passes the same override to this provider.
 *
 * @param {string} url the Supabase project URL
 */
export function supabaseStorageKey(url) {
  // For `<ref>.supabase.co` the first label IS the project ref; for a local stack or a
  // custom domain the first hostname label is what supabase-js derives too.
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

/**
 * The HTTP client. Provisioning hooks and data probes use this; it never touches a browser.
 *
 * @param {{ url: string, anonKey: string }} options
 */
export function supabaseClient(options) {
  const { url, anonKey } = options;
  const base = url.replace(/\/$/, '');

  /**
   * The password grant. Returns the WHOLE session object — supabase-js wants all of it in
   * storage, so nothing is picked out here.
   *
   * @param {string} email @param {string} password
   * @returns {Promise<{access_token: string, refresh_token: string, user: {id: string}} & Record<string, unknown>>}
   */
  async function signIn(email, password) {
    const response = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const parsed = await response.json().catch(() => undefined);
    if (!response.ok) {
      // THE MESSAGE IS THE CODE AND NOTHING ELSE — an error body must not put the
      // submitted password into a log by being thrown whole.
      const code =
        typeof parsed === 'object' && parsed !== null && typeof parsed.error_code === 'string'
          ? parsed.error_code
          : `UNKNOWN_ERROR (HTTP ${response.status})`;
      throw new Error(code);
    }
    if (typeof parsed?.access_token !== 'string') {
      throw new Error(
        `the token endpoint answered 200 with no access_token — is ${base} a Supabase URL?`,
      );
    }
    return parsed;
  }

  /**
   * Call PostgREST (or any project endpoint) as the signed-in user, from Node. Returns
   * `{ status, ok, body }` and never throws on a non-2xx, because callers branch on it.
   *
   * @param {{access_token: string}} session
   * @param {string} path relative to the project URL, e.g. '/rest/v1/rows'
   * @param {{ method?: string, body?: unknown, headers?: Record<string, string> }} [init]
   */
  async function apiFetch(session, path, init = {}) {
    const { method = 'GET', body, headers = {} } = init;
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${session.access_token}`,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = await response.json().catch(() => undefined);
    return { status: response.status, ok: response.ok, body: parsed };
  }

  return { signIn, apiFetch };
}

/**
 * The provider. Signs in over HTTP and plants the session where supabase-js looks.
 *
 * @param {object} options
 * @param {string} options.url the Supabase project URL (https://<ref>.supabase.co)
 * @param {string} options.anonKey the publishable anon key
 * @param {string} [options.storageKey] override when the app's client overrides it
 * @param {string} [options.emailField] which identity field holds the email
 * @param {string} [options.passwordField] which identity field holds the password
 */
export function supabaseAuthProvider(options) {
  const { url, anonKey, storageKey, emailField = 'email', passwordField = 'password' } = options;
  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') {
    throw new Error('supabaseAuthProvider needs `url` and `anonKey`');
  }

  return defineAuthProvider({
    kind: 'supabase',
    async signIn({ page, context, identity, config }) {
      const email = requireField(identity, emailField, 'supabase');
      const password = requireField(identity, passwordField, 'supabase');
      const session = await supabaseClient({ url, anonKey }).signIn(email, password);
      const key = storageKey ?? supabaseStorageKey(url);
      // An init script, not an evaluate: localStorage is per-origin and the value must be
      // there before the app's own first read on the next navigation.
      await context.addInitScript(
        ([k, v]) => {
          window.localStorage.setItem(
            /** @type {string} */ (k),
            /** @type {string} */ (v),
          );
        },
        /** @type {[string, string]} */ ([key, JSON.stringify(session)]),
      );
      await page.goto(config.baseURL);
    },
    async client(identity) {
      const email = requireField(identity, emailField, 'supabase');
      const password = requireField(identity, passwordField, 'supabase');
      const client = supabaseClient({ url, anonKey });
      const session = await client.signIn(email, password);
      return { session, ...client };
    },
  });
}
