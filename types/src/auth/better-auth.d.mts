/**
 * The HTTP client. Provisioning hooks and data probes use this; it never touches a browser.
 *
 * @param {{ apiBase: string, baseURL: string, authPath?: string }} options
 */
export function betterAuthClient(options: {
    apiBase: string;
    baseURL: string;
    authPath?: string;
}): {
    signUp: (email: string, password: string, name?: string) => Promise<BetterAuthSession>;
    signIn: (email: string, password: string) => Promise<BetterAuthSession>;
    signOut: (session: BetterAuthSession) => Promise<void>;
    signInOrSignUp: (email: string, password: string, name?: string) => Promise<BetterAuthSession>;
    apiFetch: (session: BetterAuthSession, path: string, init?: {
        method?: string;
        body?: unknown;
    }) => Promise<{
        status: number;
        ok: boolean;
        body: any;
    }>;
    cookiesForBrowser: (session: BetterAuthSession) => {
        name: string;
        value: string;
        domain: string;
        path: string;
        httpOnly: boolean;
        secure: boolean;
        sameSite: "Lax";
    }[];
};
/**
 * The provider. Signs in over HTTP and hands the cookies to the browser context.
 *
 * Use this when the sign-in form is NOT what you are testing — a loop that needs a second
 * signed-in identity mid-run, or an admin-only screen reached every run. When the form
 * itself matters, use `formAuthProvider`, which is the default for that reason.
 *
 * @param {{ authPath?: string, emailField?: string, passwordField?: string, createIfMissing?: boolean }} [options]
 */
export function betterAuthProvider(options?: {
    authPath?: string;
    emailField?: string;
    passwordField?: string;
    createIfMissing?: boolean;
}): import("./provider.mjs").AuthProvider;
export type BetterAuthSession = {
    userId: string;
    email: string;
    cookies: import("./cookie-jar.mjs").Cookie[];
    cookieHeader: string;
};
