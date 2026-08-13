// @ts-check
// Keeping bearer credentials out of the artifacts a run writes.
//
// TWO LAYERS, AND THE ORDER MATTERS. The primary defence is masking at capture time
// (session.capture() passes the configured mask selectors to Playwright's native `mask`
// option), which keeps a secret out of the PNG rather than scrubbing a PNG that briefly
// held it. This module is the SECOND layer, for the text artifacts — errors.json,
// results.json, the axe dumps — where a credential can arrive inside a URL or an error
// body that no selector covers.
//
// Patterns are configuration, not code: every project has its own shape of secret. The
// presets below are the ones that recur, and a project adds its own through
// `redact.patterns` in studio.config.mjs.

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
export const PRESETS = /** @type {Record<string, RedactPattern>} */ ({
  'long-token': {
    name: 'long-token',
    pattern: /[A-Za-z0-9_-]{43,}/g,
    replacement: '[REDACTED]',
  },
  jwt: {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replacement: '[REDACTED-JWT]',
  },
  // The header, not just the token: an `authorization: Basic …` value is short enough to
  // slip under `long-token` entirely.
  'auth-header': {
    name: 'auth-header',
    pattern: /\b(authorization|proxy-authorization)\s*[:=]\s*\S+/gi,
    replacement: '$1: [REDACTED]',
  },
  // Vendor key shapes that are shorter than `long-token` catches, or that would otherwise
  // be split by a punctuation character inside them.
  'vendor-key': {
    name: 'vendor-key',
    pattern: /\b(sk|pk|rk)-[A-Za-z0-9_-]{16,}|\bgh[pousr]_[A-Za-z0-9]{16,}|\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    replacement: '[REDACTED-KEY]',
  },
  'password-field': {
    name: 'password-field',
    pattern: /\b(password|passwd|secret|token)"?\s*[:=]\s*"?[^",\s}]+/gi,
    replacement: '$1: [REDACTED]',
  },
});

/** On by default: the shapes that are a credential in every project, never a value to read. */
export const DEFAULT_PRESETS = ['long-token', 'jwt', 'auth-header', 'vendor-key'];

/**
 * Masked on every screenshot unless a capture opts out and says why. A password input is
 * universal; anything project-shaped is added through `redact.maskSelectors`.
 */
export const DEFAULT_MASK_SELECTORS = ['input[type="password"]'];

/**
 * Build a redactor from config.
 *
 * @param {{ presets?: string[], patterns?: (RedactPattern | RegExp)[] }} [options]
 */
export function createRedactor(options = {}) {
  const { presets = DEFAULT_PRESETS, patterns = [] } = options;

  /** @type {RedactPattern[]} */
  const resolved = [];
  for (const name of presets) {
    const preset = PRESETS[name];
    if (preset === undefined) {
      throw new Error(
        `unknown redaction preset '${name}' — available: ${Object.keys(PRESETS).join(', ')}`,
      );
    }
    resolved.push(preset);
  }
  for (const entry of patterns) {
    const p = entry instanceof RegExp ? { name: 'custom', pattern: entry } : entry;
    if (!(p.pattern instanceof RegExp)) {
      throw new Error(`redact pattern '${p.name}' is not a RegExp`);
    }
    if (!p.pattern.global) {
      // A non-global pattern replaces only the FIRST match, which on a log line holding
      // two credentials leaks the second one. Caught here rather than at read time.
      throw new Error(
        `redact pattern '${p.name}' must carry the g flag, or only its first match is replaced`,
      );
    }
    resolved.push(p);
  }

  /** @param {unknown} value */
  function redactText(value) {
    let out = String(value);
    for (const { pattern, replacement } of resolved) {
      // lastIndex is per-RegExp state and these objects are shared across calls; reset so a
      // previous call cannot cause this one to start matching halfway through the string.
      pattern.lastIndex = 0;
      out = out.replace(pattern, replacement ?? '[REDACTED]');
    }
    return out;
  }

  /**
   * Deep, non-mutating. Returns a new structure with every string redacted.
   * @param {unknown} value
   * @returns {unknown}
   */
  function redactJson(value) {
    if (typeof value === 'string') return redactText(value);
    if (Array.isArray(value)) return value.map(redactJson);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, redactJson(v)]),
      );
    }
    return value;
  }

  return { redactText, redactJson, patterns: resolved };
}

/** The default redactor, for callers with no config in hand (tests, one-off scripts). */
export const defaultRedactor = createRedactor();
