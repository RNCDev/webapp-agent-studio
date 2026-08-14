/**
 * Should the harness visit baseURL before handing over to the auth provider?
 *
 * Normally yes. But a provider that navigates itself — a token in a URL fragment, an SSO
 * callback path — has that visit cancelled out from under it, and the cancelled page load
 * is collected as a genuine failed request and scored against `errorBudget`: a failure
 * caused by the test, in a package that never filters errors. Such a provider declares
 * `navigates`, and this is where that is honoured.
 *
 * ONLY A SESSION THAT IS SIGNING IN MAY SKIP IT. A signed-out session has nothing else to
 * navigate it and would settle against about:blank — which looks like a hanging app. An
 * explicit `goto` from the caller always wins over both.
 *
 * @param {{goto?: boolean, signIn: boolean, auth?: import('./auth/provider.mjs').AuthProvider | null}} args
 */
export function shouldVisitFirst({ goto, signIn, auth }: {
    goto?: boolean;
    signIn: boolean;
    auth?: import("./auth/provider.mjs").AuthProvider | null;
}): boolean;
/**
 * @param {object} options
 * @param {import('./config.mjs').ResolvedConfig} options.config
 * @param {string} options.outDir where screenshots and JSON land
 * @param {boolean} [options.headed]
 * @param {boolean} [options.trace] record a Playwright trace per context
 */
export function startStudio(options: {
    config: import("./config.mjs").ResolvedConfig;
    outDir: string;
    headed?: boolean | undefined;
    trace?: boolean | undefined;
}): Promise<{
    browser: import("playwright").Browser;
    session: (args?: {
        identity?: string | undefined;
        colorScheme?: "light" | "dark" | undefined;
        name?: string | undefined;
        signIn?: boolean | undefined;
        storageState?: string | undefined;
        goto?: boolean | undefined;
    }) => Promise<{
        name: string;
        page: import("playwright").Page;
        context: import("playwright").BrowserContext;
        errors: import("./errors.mjs").CollectedError[];
        screenshots: {
            name: string;
            path: string;
            seq: number;
            ts: string;
        }[];
        outDir: string;
        capture: (shotName: string, options?: {
            mask?: string[] | undefined;
            fullPage?: boolean | undefined;
            requireMask?: boolean | undefined;
            clip?: {
                x: number;
                y: number;
                width: number;
                height: number;
            } | undefined;
            element?: string | undefined;
            scale?: number | undefined;
            type?: "png" | "jpeg" | undefined;
            quality?: number | undefined;
        }) => Promise<string>;
        axe: (options?: {
            selector?: string;
        }) => Promise<{
            violations: {
                id: string;
            }[];
        }>;
        report: () => Promise<string>;
        close: () => Promise<void>;
        navTo: (label: string) => Promise<void>;
        settle: (options?: {
            timeout?: number;
        }) => Promise<void>;
    }>;
    client: (identityName?: string) => Promise<unknown>;
    close: (options?: {
        keepTraces?: boolean;
    }) => Promise<void>;
    sequence: {
        next: () => number;
        current: () => number;
    };
    errors: import("./errors.mjs").CollectedError[];
    screenshots: {
        name: string;
        path: string;
        seq: number;
        ts: string;
    }[];
    axeRuns: {
        file: string;
        violations: string[];
        session: string;
    }[];
    outDir: string;
    config: {
        root: string;
        baseURL: string;
        apiBase: string | undefined;
        headed: boolean;
        identities: Record<string, Record<string, unknown>>;
        envFiles: {
            path: string;
            loaded: boolean;
            shadowed: string[];
        }[];
        defaultIdentity: string;
        maskSelectors: string[];
        redactText: (value: unknown) => string;
        redactJson: (value: unknown) => unknown;
        verify: NonNullable<import("./config.mjs").StudioConfig["verify"]>;
        history: NonNullable<import("./config.mjs").StudioConfig["history"]>;
        hooks: NonNullable<import("./config.mjs").StudioConfig["hooks"]>;
        name: string;
        /**
         * how to boot the app when nothing answers at baseURL; an app already running is used
         * as-is and never stopped
         */
        start: string | {
            command: string;
            readyTimeout?: number;
            cwd?: string;
        } | null;
        /**
         * a file of environment variables to load before the
         * run — usually '.env'. Sign-in nearly always needs a credential, and this is what
         * lets `webapp-agent-studio` be invoked directly instead of through
         * `node --env-file=...`. Note that Node never lets a file overwrite a variable the
         * environment already has; the CLI reports any name that was shadowed that way
         */
        envFile: string | null | undefined;
        /**
         * where loop directories live (default 'loops')
         */
        loopsDir: string;
        /**
         * scratch dir for `verify` (default '.studio-artifacts')
         */
        artifactsDir: string;
        viewport: {
            width: number;
            height: number;
        };
        settle: string | ((page: import("playwright").Page) => Promise<void>);
        settleTimeout: number;
        auth: import("./auth/provider.mjs").AuthProvider | null;
        emailPrefix: string;
        redact?: {
            presets?: string[];
            patterns?: unknown[];
            maskSelectors?: string[];
        } | undefined;
        playwright?: {
            supported?: string;
        } | undefined;
    };
    /** Save a context's storage so a later run can skip the sign-in. Opt-in, off by default. */
    /** @param {import('./session.mjs').Session} s @param {string} path */
    saveStorageState: (s: import("./session.mjs").Session, path: string) => Promise<{
        cookies: Array<{
            name: string;
            value: string;
            domain: string;
            path: string;
            expires: number;
            httpOnly: boolean;
            secure: boolean;
            sameSite: "Strict" | "Lax" | "None";
        }>;
        origins: Array<{
            origin: string;
            localStorage: Array<{
                name: string;
                value: string;
            }>;
        }>;
    }>;
}>;
export type Studio = Awaited<ReturnType<typeof startStudio>>;
