/** @param {{name: string, baseURL: string}} args */
export function configTemplate(args: {
    name: string;
    baseURL: string;
}): string;
export function loopTemplate(name: string): string;
export function directivesTemplate(name: string): string;
/** The block appended to CLAUDE.md / AGENTS.md. @param {string} name */
export function pointerBlock(name: string): string;
/**
 * Append a block to a file if it is not already there.
 * @param {string} path @param {string} block @param {string} marker
 */
export function appendOnce(path: string, block: string, marker: string): "already there" | "appended" | "created";
/**
 * Add lines to .gitignore that are not in it.
 * @param {string} root @param {string[]} lines
 */
export function ensureGitignore(root: string, lines: string[]): string[];
/**
 * Add the studio scripts to package.json without disturbing what is there.
 * @param {string} root
 */
export function ensureScripts(root: string): string[];
/** @param {string} dir */
export function ensureDir(dir: string): string;
