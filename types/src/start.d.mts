/**
 * The config field, normalized: a bare string is a command, the object form adds a ready
 * timeout and a working directory.
 *
 * @param {unknown} start
 * @returns {{command: string, readyTimeout: number, cwd: string | undefined} | null}
 */
export function normalizeStart(start: unknown): {
    command: string;
    readyTimeout: number;
    cwd: string | undefined;
} | null;
/**
 * Make sure something answers at config.baseURL, starting the configured command if
 * nothing does. Callers must `await stop()` when the work is done — it is a no-op unless
 * this call actually started the app.
 *
 * @param {{baseURL: string, root?: string, start?: unknown}} config
 * @param {{log?: (line: string) => void}} [options]
 * @returns {Promise<{started: boolean, stop: () => Promise<void>}>}
 */
export function ensureAppRunning(config: {
    baseURL: string;
    root?: string;
    start?: unknown;
}, options?: {
    log?: (line: string) => void;
}): Promise<{
    started: boolean;
    stop: () => Promise<void>;
}>;
