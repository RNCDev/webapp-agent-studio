/**
 * What framework this project is, read off its package.json — so `init` can pre-fill the
 * baseURL, the dev command, and nothing else. Remix is checked before Vite because a Remix
 * app depends on Vite too, and "Vite on port 5173" would be the wrong answer for it.
 *
 * @param {string} root
 * @returns {{framework: string, label: string, baseURL: string, start: string} | undefined}
 */
export function detectFramework(root: string): {
    framework: string;
    label: string;
    baseURL: string;
    start: string;
} | undefined;
/** @param {{name: string, baseURL: string, start?: string}} args */
export function configTemplate(args: {
    name: string;
    baseURL: string;
    start?: string;
}): string;
export function loopTemplate(name: string): string;
export function directivesTemplate(name: string): string;
/**
 * The block appended to CLAUDE.md / AGENTS.md.
 * @param {string} name @param {{loopsDir?: string}} [config]
 */
export function pointerBlock(name: string, config?: {
    loopsDir?: string;
}): string;
/**
 * Append a block to a file if it is not already there.
 * @param {string} path @param {string} block @param {string} marker
 * @param {{dryRun?: boolean}} [options]
 */
export function appendOnce(path: string, block: string, marker: string, options?: {
    dryRun?: boolean;
}): "already there" | "appended" | "created";
/**
 * The .gitignore lines for a config's ACTUAL layout.
 *
 * These must be derived, never assumed. `init` runs before anyone has customised
 * `loopsDir`, so a hardcoded `loops/*​/runs/` silently leaves the run artifacts of a
 * project that moved its loops untracked-but-not-ignored — which means screenshots of a
 * signed-in application sitting in `git status` waiting to be committed by accident. That
 * is the same harm "mask before the pixel" exists to prevent, arriving by a different
 * door, so `init` is re-runnable and reconciles these against the config as it now stands.
 *
 * @param {{loopsDir?: string, artifactsDir?: string}} [config]
 */
export function ignoreLinesFor(config?: {
    loopsDir?: string;
    artifactsDir?: string;
}): string[];
/**
 * Add lines to .gitignore that are not in it.
 * @param {string} root @param {string[]} lines @param {{dryRun?: boolean}} [options]
 */
export function ensureGitignore(root: string, lines: string[], options?: {
    dryRun?: boolean;
}): string[];
/**
 * Add the studio scripts to package.json without disturbing what is there.
 *
 * The scripts stay plain — no `node --env-file=...` wrapper — because `envFile` in
 * studio.config.mjs is what supplies credentials now, and a script that hardcoded a path
 * into node_modules would break the moment the package moved.
 *
 * @param {string} root @param {{dryRun?: boolean}} [options]
 */
export function ensureScripts(root: string, options?: {
    dryRun?: boolean;
}): string[];
/** @param {string} dir */
export function ensureDir(dir: string): string;
