/**
 * Declare a field that reads an environment variable at the point it is used.
 *
 * @param {string} name the environment variable
 * @param {string} [hint] how to set it — printed verbatim in the error, so write it for
 *   someone who has never seen this project before
 */
export function env(name: string, hint?: string): {
    [ENV_MARKER]: boolean;
    name: string;
    hint: string | undefined;
};
/**
 * Identity, for editor autocomplete and so a typo in a config field is a type error.
 *
 * @typedef {object} StudioConfig
 * @property {string} [name]
 * @property {string} baseURL the only required field
 * @property {string | {command: string, readyTimeout?: number, cwd?: string} | null} [start]
 *   how to boot the app when nothing answers at baseURL; an app already running is used
 *   as-is and never stopped
 * @property {string} [apiBase]
 * @property {string | null} [envFile] a file of environment variables to load before the
 *   run — usually '.env'. Sign-in nearly always needs a credential, and this is what
 *   lets `webapp-agent-studio` be invoked directly instead of through
 *   `node --env-file=...`. Note that Node never lets a file overwrite a variable the
 *   environment already has; the CLI reports any name that was shadowed that way
 * @property {string} [loopsDir] where loop directories live (default 'loops')
 * @property {string} [artifactsDir] scratch dir for `verify` (default '.studio-artifacts')
 * @property {{width: number, height: number}} [viewport]
 * @property {string | ((page: import('playwright').Page) => Promise<void>)} [settle]
 * @property {number} [settleTimeout]
 * @property {boolean} [headed]
 * @property {import('./auth/provider.mjs').AuthProvider | null} [auth]
 * @property {Record<string, Record<string, unknown>>} [identities]
 * @property {string} [defaultIdentity]
 * @property {string} [emailPrefix]
 * @property {{presets?: string[], patterns?: unknown[], maskSelectors?: string[]}} [redact]
 * @property {{beforeRun?: Function, afterRun?: Function, purge?: Function}} [hooks]
 * @property {{minScreenshotBytes?: number, plantedSecret?: string}} [verify]
 * @property {{keepRuns?: number}} [history]
 * @property {{supported?: string}} [playwright]
 */
/** @param {StudioConfig} config */
export function defineConfig(config: StudioConfig): StudioConfig;
/**
 * Load and normalize studio.config.mjs.
 *
 * @param {{ cwd?: string, path?: string, envFile?: string, overrides?: Partial<StudioConfig> }} [options]
 */
export function loadConfig(options?: {
    cwd?: string;
    path?: string;
    envFile?: string;
    overrides?: Partial<StudioConfig>;
}): Promise<{
    envFiles: {
        path: string;
        loaded: boolean;
        shadowed: string[];
    }[];
    root: string;
    baseURL: string;
    apiBase: string | undefined;
    headed: boolean;
    identities: Record<string, Record<string, unknown>>;
    defaultIdentity: string;
    maskSelectors: string[];
    redactText: (value: unknown) => string;
    redactJson: (value: unknown) => unknown;
    verify: NonNullable<StudioConfig["verify"]>;
    history: NonNullable<StudioConfig["history"]>;
    hooks: NonNullable<StudioConfig["hooks"]>;
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
}>;
/**
 * @param {StudioConfig} raw
 * @param {{ root?: string, overrides?: Partial<StudioConfig> }} [options]
 */
export function normalizeConfig(raw: StudioConfig, options?: {
    root?: string;
    overrides?: Partial<StudioConfig>;
}): {
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
    verify: NonNullable<StudioConfig["verify"]>;
    history: NonNullable<StudioConfig["history"]>;
    hooks: NonNullable<StudioConfig["hooks"]>;
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
/** @typedef {Awaited<ReturnType<typeof normalizeConfig>>} ResolvedConfig */
/**
 * The identity a loop asked for, by name.
 * @param {ResolvedConfig} config
 * @param {string | undefined} name
 */
export function identityFor(config: ResolvedConfig, name: string | undefined): {
    name: string;
} | undefined;
/**
 * Identity, for editor autocomplete and so a typo in a config field is a type error.
 */
export type StudioConfig = {
    name?: string | undefined;
    /**
     * the only required field
     */
    baseURL: string;
    /**
     * how to boot the app when nothing answers at baseURL; an app already running is used
     * as-is and never stopped
     */
    start?: string | {
        command: string;
        readyTimeout?: number;
        cwd?: string;
    } | null | undefined;
    apiBase?: string | undefined;
    /**
     * a file of environment variables to load before the
     * run — usually '.env'. Sign-in nearly always needs a credential, and this is what
     * lets `webapp-agent-studio` be invoked directly instead of through
     * `node --env-file=...`. Note that Node never lets a file overwrite a variable the
     * environment already has; the CLI reports any name that was shadowed that way
     */
    envFile?: string | null | undefined;
    /**
     * where loop directories live (default 'loops')
     */
    loopsDir?: string | undefined;
    /**
     * scratch dir for `verify` (default '.studio-artifacts')
     */
    artifactsDir?: string | undefined;
    viewport?: {
        width: number;
        height: number;
    } | undefined;
    settle?: string | ((page: import("playwright").Page) => Promise<void>) | undefined;
    settleTimeout?: number | undefined;
    headed?: boolean | undefined;
    auth?: import("./auth/provider.mjs").AuthProvider | null | undefined;
    identities?: Record<string, Record<string, unknown>> | undefined;
    defaultIdentity?: string | undefined;
    emailPrefix?: string | undefined;
    redact?: {
        presets?: string[];
        patterns?: unknown[];
        maskSelectors?: string[];
    } | undefined;
    hooks?: {
        beforeRun?: Function;
        afterRun?: Function;
        purge?: Function;
    } | undefined;
    verify?: {
        minScreenshotBytes?: number;
        plantedSecret?: string;
    } | undefined;
    history?: {
        keepRuns?: number;
    } | undefined;
    playwright?: {
        supported?: string;
    } | undefined;
};
export type ResolvedConfig = Awaited<ReturnType<typeof normalizeConfig>>;
declare const ENV_MARKER: unique symbol;
export {};
