/** @typedef {{ name: string, value: string, attributes: Record<string, string> }} Cookie */
/**
 * Split one `Set-Cookie` line into its pair and its attributes.
 * @param {string} line
 * @returns {Cookie | undefined}
 */
export function parseSetCookie(line: string): Cookie | undefined;
/**
 * Every cookie a response set, parsed.
 *
 * `getSetCookie()` rather than `headers.get('set-cookie')`: the latter joins multiple
 * Set-Cookie headers with ', ', which is unparseable because `Expires` values contain a
 * comma. Node >= 22 (this package's floor) has `getSetCookie`.
 *
 * @param {Response} response
 */
export function cookiesFrom(response: Response): Cookie[];
/**
 * The `Cookie` request header for a set of cookies. Names and values only — the
 * attributes are the server's instructions to a browser, not part of what is sent back.
 *
 * @param {Cookie[]} cookies
 */
export function cookieHeaderFor(cookies: Cookie[]): string;
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
export function playwrightCookies(cookies: Cookie[], baseURL: string): {
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    /** @type {'Lax'} */
    sameSite: "Lax";
}[];
export type Cookie = {
    name: string;
    value: string;
    attributes: Record<string, string>;
};
