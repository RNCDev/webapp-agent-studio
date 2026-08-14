/**
 * The storage key supabase-js uses: `sb-<ref>-auth-token`, where <ref> is the project ref
 * off `<ref>.supabase.co`. A local stack (localhost, a custom domain) falls back to the
 * first hostname label, which matches supabase-js's derivation for those setups. An app
 * that overrides `storageKey` in its client passes the same override to this provider.
 *
 * @param {string} url the Supabase project URL
 */
export function supabaseStorageKey(url: string): string;
/**
 * The HTTP client. Provisioning hooks and data probes use this; it never touches a browser.
 *
 * @param {{ url: string, anonKey: string }} options
 */
export function supabaseClient(options: {
    url: string;
    anonKey: string;
}): {
    signIn: (email: string, password: string) => Promise<{
        access_token: string;
        refresh_token: string;
        user: {
            id: string;
        };
    } & Record<string, unknown>>;
    apiFetch: (session: {
        access_token: string;
    }, path: string, init?: {
        method?: string;
        body?: unknown;
        headers?: Record<string, string>;
    }) => Promise<{
        status: number;
        ok: boolean;
        body: any;
    }>;
};
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
export function supabaseAuthProvider(options: {
    url: string;
    anonKey: string;
    storageKey?: string | undefined;
    emailField?: string | undefined;
    passwordField?: string | undefined;
}): import("./provider.mjs").AuthProvider;
