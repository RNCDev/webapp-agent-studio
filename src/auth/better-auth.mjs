// @ts-check
// better-auth, over HTTP, from Node.
//
// THE TRAP THIS MODULE EXISTS TO ABSORB. better-auth rejects any non-GET request that
// carries a `Cookie` header without a matching `Origin`, with `403 MISSING_OR_NULL_ORIGIN`.
// Browsers always send `Origin`; **Node's `fetch` does not**, and Node's `fetch` has no
// cookie jar either. So every non-GET request made from Node has to supply BOTH by hand.
// That is what `apiFetch` below is for, and it is why project code should never call bare
// `fetch` against a better-auth API — a caller that does gets a 403 whose message names
// CSRF and points at nothing.
//
// This is the single most expensive thing to rediscover per project, which is why it ships
// as an adapter rather than being left to each consumer.

import { defineAuthProvider, requireField } from './provider.mjs';
import { cookiesFrom, cookieHeaderFor, playwrightCookies } from './cookie-jar.mjs';

/**
 * @typedef {object} BetterAuthSession
 * @property {string} userId
 * @property {string} email
 * @property {import('./cookie-jar.mjs').Cookie[]} cookies
 * @property {string} cookieHeader
 */

/**
 * The `Origin` every non-GET request must carry.
 *
 * Derived from the API base rather than the app's baseURL so that pointing the studio at a
 * deployed API moves the Origin with it. In the normal local setup the two are the same
 * origin anyway — a dev-server proxy forwards the API path, which is exactly the
 * same-origin arrangement the browser gets and the reason better-auth needs no CORS config.
 *
 * @param {string} apiBase
 */
function requestOrigin(apiBase) {
  return new URL(apiBase).origin;
}

/**
 * @param {string} authBase
 * @param {string} apiBase
 * @param {string} path
 * @param {unknown} body
 */
async function authPost(authBase, apiBase, path, body) {
  const response = await fetch(`${authBase}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Required on every non-GET, always — see the trap at the top of this file. Sending
      // it unconditionally (rather than only when a cookie is attached) costs nothing and
      // means there is no branch here that can be wrong.
      origin: requestOrigin(apiBase),
    },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => undefined);
  if (!response.ok) {
    // THE MESSAGE IS THE CODE AND NOTHING ELSE. `parsed` may contain the request's own
    // email and password reflected back by a misbehaving server, and a thrown Error ends
    // up in a log and a bug report. An unrecognised body degrades to UNKNOWN_ERROR rather
    // than leaking whatever else it happened to carry.
    const code =
      typeof parsed === 'object' && parsed !== null && typeof parsed.code === 'string'
        ? parsed.code
        : `UNKNOWN_ERROR (HTTP ${response.status})`;
    throw new Error(code);
  }
  return { body: parsed, cookies: cookiesFrom(response) };
}

/**
 * @param {{body: any, cookies: import('./cookie-jar.mjs').Cookie[]}} result
 * @param {string} email
 * @param {string} authBase
 * @returns {BetterAuthSession}
 */
function sessionFrom(result, email, authBase) {
  const userId = result.body?.user?.id;
  if (typeof userId !== 'string' || userId === '') {
    throw new Error(
      'better-auth returned 200 with no user.id — the response shape changed, or ' +
        `${authBase} is not better-auth`,
    );
  }
  if (result.cookies.length === 0) {
    // A 200 with no Set-Cookie is the one failure that would otherwise look like success
    // and then 401 on the NEXT call, several steps away from its cause.
    throw new Error(
      'sign-in succeeded for a user but set no cookie — nothing downstream can ' +
        'authenticate. Check the API mounted better-auth where the studio is looking and ' +
        'that no proxy is stripping Set-Cookie.',
    );
  }
  return {
    userId,
    email,
    cookies: result.cookies,
    cookieHeader: cookieHeaderFor(result.cookies),
  };
}

/**
 * The HTTP client. Provisioning hooks and data probes use this; it never touches a browser.
 *
 * @param {{ apiBase: string, baseURL: string, authPath?: string }} options
 */
export function betterAuthClient(options) {
  const { apiBase, baseURL, authPath = '/auth' } = options;
  const authBase = `${apiBase}${authPath}`;

  /**
   * Create an account. `name` IS REQUIRED by better-auth — a missing one is a 400
   * VALIDATION_ERROR, not a defaulted empty string.
   * @param {string} email @param {string} password @param {string} [name]
   */
  async function signUp(email, password, name) {
    return sessionFrom(
      await authPost(authBase, apiBase, '/sign-up/email', {
        email,
        password,
        name: name ?? email,
      }),
      email,
      authBase,
    );
  }

  /**
   * Sign in. An unknown email and a wrong password both come back
   * `401 INVALID_EMAIL_OR_PASSWORD` — deliberate on the server's side (email-enumeration
   * protection), and the reason signInOrSignUp cannot simply branch on the sign-in error.
   * @param {string} email @param {string} password
   */
  async function signIn(email, password) {
    return sessionFrom(
      await authPost(authBase, apiBase, '/sign-in/email', { email, password }),
      email,
      authBase,
    );
  }

  /** End the session server-side. Best-effort; nothing depends on it. */
  async function signOut(/** @type {BetterAuthSession} */ session) {
    await fetch(`${authBase}/sign-out`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: requestOrigin(apiBase),
        cookie: session.cookieHeader,
      },
      // `{}` rather than no body: better-auth parses a JSON body on this route and an
      // absent one is a 400.
      body: '{}',
    }).catch(() => {});
  }

  /**
   * Sign a stable identity in, creating it on the first run ever.
   *
   * THE PROBE IS THE SIGN-UP, NOT THE SIGN-IN. better-auth answers both "no such account"
   * and "wrong password" with the single code `INVALID_EMAIL_OR_PASSWORD`, so the sign-in
   * failure alone cannot tell them apart. Sign-up can: a `USER_ALREADY_EXISTS` back from
   * it means the account exists and the CONFIGURED password is wrong. That must be a loud,
   * named failure — silently signing up a variant account would fork the identity, and the
   * whole point of a stable identity is that it is the same one every run.
   *
   * @param {string} email @param {string} password @param {string} [name]
   */
  async function signInOrSignUp(email, password, name) {
    try {
      return await signIn(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/INVALID_EMAIL_OR_PASSWORD/.test(message)) throw err;
      try {
        return await signUp(email, password, name);
      } catch (signUpErr) {
        const signUpMessage =
          signUpErr instanceof Error ? signUpErr.message : String(signUpErr);
        if (/USER_ALREADY_EXISTS/.test(signUpMessage)) {
          throw new Error(
            `the account ${email} exists but the configured password does not match — ` +
              'fix the password in the environment; do NOT change the email, that would ' +
              'fork the stable identity this run depends on.',
          );
        }
        throw signUpErr;
      }
    }
  }

  /**
   * Call the API as a signed-in session, from Node.
   *
   * Returns `{ status, ok, body }` and never throws on a non-2xx, because callers branch
   * on the status. This is the only sanctioned way for Node-side project code to call a
   * better-auth-protected API: it supplies the cookie and, on every request, the `Origin`
   * header better-auth demands.
   *
   * @param {BetterAuthSession} session
   * @param {string} path relative to apiBase
   * @param {{ method?: string, body?: unknown }} [init]
   */
  async function apiFetch(session, path, init = {}) {
    const { method = 'GET', body } = init;
    const response = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        cookie: session.cookieHeader,
        // GET requests do not need it, but sending it on every request keeps this function
        // free of a branch whose wrong side is a 403 that names CSRF and explains nothing.
        origin: requestOrigin(apiBase),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = await response.json().catch(() => undefined);
    return { status: response.status, ok: response.ok, body: parsed };
  }

  /** @param {BetterAuthSession} session */
  function cookiesForBrowser(session) {
    return playwrightCookies(session.cookies, baseURL);
  }

  return { signUp, signIn, signOut, signInOrSignUp, apiFetch, cookiesForBrowser };
}

/**
 * The provider. Signs in over HTTP and hands the cookies to the browser context.
 *
 * Use this when the sign-in form is NOT what you are testing — a loop that needs a second
 * signed-in identity mid-run, or an admin-only screen reached every run. When the form
 * itself matters, use `formAuthProvider`, which is the default for that reason.
 *
 * @param {{ authPath?: string, emailField?: string, passwordField?: string, createIfMissing?: boolean }} [options]
 */
export function betterAuthProvider(options = {}) {
  const {
    authPath = '/auth',
    emailField = 'email',
    passwordField = 'password',
    createIfMissing = false,
  } = options;

  return defineAuthProvider({
    kind: 'better-auth',
    async signIn({ context, page, identity, config }) {
      if (config.apiBase === undefined) {
        throw new Error(
          'the better-auth provider needs `apiBase` in studio.config.mjs — it is where ' +
            'the auth endpoints are mounted',
        );
      }
      const email = requireField(identity, emailField, 'better-auth');
      const password = requireField(identity, passwordField, 'better-auth');
      const client = betterAuthClient({
        apiBase: config.apiBase,
        baseURL: config.baseURL,
        authPath,
      });
      const session = createIfMissing
        ? await client.signInOrSignUp(email, password)
        : await client.signIn(email, password);
      await context.addCookies(client.cookiesForBrowser(session));
      await page.goto(config.baseURL);
    },
    async client(identity, config) {
      if (config.apiBase === undefined) {
        throw new Error('the better-auth client needs `apiBase` in studio.config.mjs');
      }
      const client = betterAuthClient({
        apiBase: config.apiBase,
        baseURL: config.baseURL,
        authPath,
      });
      const email = requireField(identity, emailField, 'better-auth');
      const password = requireField(identity, passwordField, 'better-auth');
      const session = createIfMissing
        ? await client.signInOrSignUp(email, password)
        : await client.signIn(email, password);
      return { session, ...client };
    },
  });
}
