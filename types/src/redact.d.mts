/**
 * Build a redactor from config.
 *
 * @param {{ presets?: string[], patterns?: (RedactPattern | RegExp)[] }} [options]
 */
export function createRedactor(options?: {
    presets?: string[];
    patterns?: (RedactPattern | RegExp)[];
}): {
    redactText: (value: unknown) => string;
    redactJson: (value: unknown) => unknown;
    patterns: RedactPattern[];
};
/** @typedef {{ name: string, pattern: RegExp, replacement?: string }} RedactPattern */
/**
 * Shipped patterns, by name. A project picks from these and adds its own.
 *
 * `long-token` has the subtlest threshold. It is 43 characters and not lower because real
 * non-secrets live just under it: a git SHA is 40 hex characters and appears in findings
 * legitimately. Over-redaction of a 44+ character opaque string is deliberate — a long
 * opaque run of base64url in a log is far more likely to be a credential than something
 * worth reading. 43 is also exactly 32 random bytes as unpadded base64url, which is what
 * a great many token mints produce.
 */
export const PRESETS: Record<string, RedactPattern>;
/** On by default: the shapes that are a credential in every project, never a value to read. */
export const DEFAULT_PRESETS: string[];
/**
 * Masked on every screenshot unless a capture opts out and says why. A password input is
 * universal; anything project-shaped is added through `redact.maskSelectors`.
 */
export const DEFAULT_MASK_SELECTORS: string[];
export namespace defaultRedactor {
    export { redactText };
    export { redactJson };
    export { resolved as patterns };
}
export type RedactPattern = {
    name: string;
    pattern: RegExp;
    replacement?: string;
};
/** @param {unknown} value */
declare function redactText(value: unknown): string;
/**
 * Deep, non-mutating. Returns a new structure with every string redacted.
 * @param {unknown} value
 * @returns {unknown}
 */
declare function redactJson(value: unknown): unknown;
/** @type {RedactPattern[]} */
declare const resolved: RedactPattern[];
export {};
