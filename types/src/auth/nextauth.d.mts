/**
 * The HTTP client. Signs in and returns every cookie the flow set — the session cookie's
 * NAME is deliberately not looked up (it moves with `useSecureCookies` and between
 * next-auth v4 and authjs v5); the jar replays what the server set, verbatim.
 *
 * @param {{ baseURL: string, basePath?: string }} options
 */
export function nextAuthClient(options: {
    baseURL: string;
    basePath?: string;
}): {
    signIn: (credentials: Record<string, string>, signInOptions?: {
        providerId?: string;
    }) => Promise<{
        cookies: import("./cookie-jar.mjs").Cookie[];
    }>;
};
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
export function nextAuthProvider(options?: {
    basePath?: string | undefined;
    providerId?: string | undefined;
    emailField?: string | undefined;
    passwordField?: string | undefined;
    credentials?: ((identity: Record<string, unknown>) => Record<string, string>) | undefined;
}): import("./provider.mjs").AuthProvider;
