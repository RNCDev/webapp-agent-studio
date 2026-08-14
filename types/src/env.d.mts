/**
 * The names a env file assigns, in order. Deliberately minimal: this is used only to
 * report which of them the environment already had, never to assign anything — Node does
 * the actual loading, so a disagreement between this parse and Node's cannot produce a
 * wrong value, only a slightly wrong report.
 *
 * @param {string} text
 */
export function envFileKeys(text: string): string[];
/**
 * Load `file` into `process.env`, once.
 *
 * A file named explicitly and then not found is an exit-2 problem, not a silent skip:
 * the operator asked for it, and continuing would fail later as a missing credential
 * whose real cause is a path typo. Discovery of the conventional `.env` passes
 * `required: false`, because absence there means "this project keeps no env file".
 *
 * @param {string} file
 * @param {{root?: string, required?: boolean}} [options]
 * @returns {{path: string, loaded: boolean, shadowed: string[]}}
 */
export function loadEnvFile(file: string, options?: {
    root?: string;
    required?: boolean;
}): {
    path: string;
    loaded: boolean;
    shadowed: string[];
};
/** Test seam: forget what has been loaded. */
export function resetLoadedEnvFiles(): void;
