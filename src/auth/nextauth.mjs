// @ts-check
// NextAuth / Auth.js credentials sign-in, over HTTP, from Node.
//
// THE FLOW IS TWO REQUESTS AND ONE TRAP. NextAuth's credentials callback demands the CSRF
// token twice — in the form body AND as the cookie the /csrf endpoint set — and rejects a
// request carrying only one with a redirect whose error names CSRF and explains nothing.
// So: GET `${basePath}/csrf` for the token and its cookie, then POST the callback with
// both, form-encoded (not JSON — the callback parses a form).
//
// Failure is a 302 to the sign-in page with `?error=<code>`, not a 4xx — a bare fetch that
// follows redirects would land on a 200 sign-in page and look like success. The client
// below never follows redirects and throws the error CODE alone, because the response
// chain can reflect the submitted credentials and a thrown Error ends up in logs.

import { defineAuthProvider, requireField } from './provider.mjs';
import { cookieHeaderFor, cookiesFrom, playwrightCookies } from './cookie-jar.mjs';

/**
 * The HTTP client. Signs in and returns every cookie the flow set — the session cookie's
 * NAME is deliberately not looked up (it moves with `useSecureCookies` and between
 * next-auth v4 and authjs v5); the jar replays what the server set, verbatim.
 *
 * @param {{ baseURL: string, basePath?: string }} options
 */
export function nextAuthClient(options) {
  const { baseURL, basePath = '/api/auth' } = options;
  const base = `${baseURL.replace(/\/$/, '')}${basePath}`;

  /**
   * @param {Record<string, string>} credentials the form fields the provider expects
   * @param {{ providerId?: string }} [signInOptions]
   * @returns {Promise<{cookies: import('./cookie-jar.mjs').Cookie[]}>}
   */
  async function signIn(credentials, signInOptions = {}) {
    const { providerId = 'credentials' } = signInOptions;

    const csrfResponse = await fetch(`${base}/csrf`, { redirect: 'manual' });
    if (!csrfResponse.ok) {
      throw new Error(
        `${base}/csrf answered HTTP ${csrfResponse.status} — is NextAuth mounted at ` +
          `basePath '${basePath}'?`,
      );
    }
    const { csrfToken } = /** @type {{csrfToken?: string}} */ (
      await csrfResponse.json().catch(() => ({}))
    );
    if (typeof csrfToken !== 'string' || csrfToken === '') {
      throw new Error(`${base}/csrf returned no csrfToken — the response shape changed`);
    }
    const jar = cookiesFrom(csrfResponse);

    const body = new URLSearchParams({
      ...credentials,
      csrfToken,
      callbackUrl: baseURL,
      json: 'true',
    });
    const response = await fetch(`${base}/callback/${providerId}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: cookieHeaderFor(jar),
        origin: new URL(baseURL).origin,
      },
      body: body.toString(),
    });
    await response.arrayBuffer().catch(() => {});

    // Success and failure are both often a 302 — the error rides in the Location.
    const location = response.headers.get('location') ?? '';
    const errorCode =
      location === '' ? null : new URL(location, baseURL).searchParams.get('error');
    if (errorCode !== null) {
      // THE MESSAGE IS THE CODE AND NOTHING ELSE — never the submitted credentials.
      throw new Error(errorCode);
    }
    if (response.status >= 400) {
      throw new Error(`the credentials callback answered HTTP ${response.status}`);
    }
    const set = cookiesFrom(response);
    if (set.length === 0) {
      throw new Error(
        'the credentials callback reported no error but set no cookie — nothing ' +
          'downstream can authenticate. Check the provider id and that the credentials ' +
          'provider is configured server-side.',
      );
    }
    return { cookies: [...jar, ...set] };
  }

  return { signIn };
}

/**
 * The provider. Signs in over HTTP and hands the cookies to the browser context.
 *
 * Use this when the sign-in form is NOT what you are testing; when it is, drive the real
 * form with `formAuthProvider` — fidelity is the default for a reason.
 *
 * @param {object} [options]
 * @param {string} [options.basePath] where NextAuth is mounted (default '/api/auth')
 * @param {string} [options.providerId] the credentials provider id (default 'credentials')
 * @param {string} [options.emailField] which identity field holds the email
 * @param {string} [options.passwordField] which identity field holds the password
 * @param {(identity: Record<string, unknown>) => Record<string, string>} [options.credentials]
 *   full override for the form fields the callback receives, when the provider's fields
 *   are not email/password
 */
export function nextAuthProvider(options = {}) {
  const {
    basePath = '/api/auth',
    providerId = 'credentials',
    emailField = 'email',
    passwordField = 'password',
    credentials,
  } = options;

  return defineAuthProvider({
    kind: 'nextauth',
    async signIn({ page, context, identity, config }) {
      const fields =
        credentials !== undefined
          ? credentials(identity)
          : {
              email: requireField(identity, emailField, 'nextauth'),
              password: requireField(identity, passwordField, 'nextauth'),
            };
      const client = nextAuthClient({ baseURL: config.baseURL, basePath });
      const { cookies } = await client.signIn(fields, { providerId });
      await context.addCookies(playwrightCookies(cookies, config.baseURL));
      await page.goto(config.baseURL);
    },
  });
}
