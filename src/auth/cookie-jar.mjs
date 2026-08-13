// @ts-check
// A cookie jar for Node's `fetch`, which has none.
//
// Deliberately NOT a lookup for a session cookie BY NAME. Cookie names move with server
// configuration — a `useSecureCookies` setting prefixes them `__Secure-`, and a plugin may
// set a second cookie beside the session one — so this replays whatever the server set,
// verbatim and in full. A harness that hardcodes a cookie name fails as a silent 401 the
// day the server's config changes, which is the failure mode this package exists to avoid.

/** @typedef {{ name: string, value: string, attributes: Record<string, string> }} Cookie */

/**
 * Split one `Set-Cookie` line into its pair and its attributes.
 * @param {string} line
 * @returns {Cookie | undefined}
 */
export function parseSetCookie(line) {
  const [pair, ...attributeParts] = line.split(';');
  const eq = pair.indexOf('=');
  if (eq === -1) return undefined;
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const part of attributeParts) {
    const i = part.indexOf('=');
    const key = (i === -1 ? part : part.slice(0, i)).trim().toLowerCase();
    if (key !== '') attributes[key] = i === -1 ? '' : part.slice(i + 1).trim();
  }
  return { name: pair.slice(0, eq).trim(), value: pair.slice(eq + 1).trim(), attributes };
}

/**
 * Every cookie a response set, parsed.
 *
 * `getSetCookie()` rather than `headers.get('set-cookie')`: the latter joins multiple
 * Set-Cookie headers with ', ', which is unparseable because `Expires` values contain a
 * comma. Node >= 22 (this package's floor) has `getSetCookie`.
 *
 * @param {Response} response
 */
export function cookiesFrom(response) {
  return response.headers
    .getSetCookie()
    .map(parseSetCookie)
    .filter((cookie) => cookie !== undefined);
}

/**
 * The `Cookie` request header for a set of cookies. Names and values only — the
 * attributes are the server's instructions to a browser, not part of what is sent back.
 *
 * @param {Cookie[]} cookies
 */
export function cookieHeaderFor(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

/**
 * Cookies in Playwright's `context.addCookies()` shape, so a browser context can be handed
 * an already-authenticated session instead of driving the sign-in form.
 *
 * `Secure` IS THE SHARP EDGE. A Secure cookie is simply not sent over http://, so
 * injecting one into a context pointed at a local dev server produces a browser that looks
 * signed in and behaves signed out — precisely the "green harness, dead app" failure this
 * package is built to prevent. Refused loudly rather than laundered.
 *
 * @param {Cookie[]} cookies
 * @param {string} baseURL
 */
export function playwrightCookies(cookies, baseURL) {
  const url = new URL(baseURL);
  const secure = cookies.filter((cookie) => 'secure' in cookie.attributes);
  if (url.protocol !== 'https:' && secure.length > 0) {
    throw new Error(
      `the API set ${secure.length} Secure cookie(s) but the browser will load ${baseURL}, ` +
        'which is not https — the browser would store them and never send them, and the ' +
        'page would render signed out while the studio believed otherwise. Either point ' +
        'baseURL at the https origin, or turn off secure cookies for local development.',
    );
  }
  return cookies.map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
    domain: url.hostname,
    path: cookie.attributes.path ?? '/',
    httpOnly: 'httponly' in cookie.attributes,
    secure: 'secure' in cookie.attributes,
    /** @type {'Lax'} */
    sameSite: 'Lax',
  }));
}
