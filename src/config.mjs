// @ts-check
// Everything project-shaped lives in one file the consuming project writes:
// studio.config.mjs. This loads it, fills the defaults, and turns every `env()` marker
// into a lazy getter.
//
// WHY THE GETTERS ARE LAZY. Credentials are env-supplied and never committed, and several
// modules load the config for `baseURL` alone — a config that threw at import because a
// password was unset would make those unrunnable. So an `env()` field throws at the POINT
// OF USE, naming the variable and how to set it, and a run that never signs in never
// touches it.

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRedactor, DEFAULT_MASK_SELECTORS } from './redact.mjs';
import { loadEnvFile } from './env.mjs';

const ENV_MARKER = Symbol.for('webapp-agent-studio.env');

/**
 * Declare a field that reads an environment variable at the point it is used.
 *
 * @param {string} name the environment variable
 * @param {string} [hint] how to set it — printed verbatim in the error, so write it for
 *   someone who has never seen this project before
 */
export function env(name, hint) {
  return { [ENV_MARKER]: true, name, hint };
}

/** @param {unknown} value */
function isEnvMarker(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    ENV_MARKER in /** @type {Record<symbol, unknown>} */ (value)
  );
}

/**
 * Replace every `env()` marker in an object with a lazy getter that throws when read.
 * One level deep by design: identities are flat records, and a recursive walk would make
 * it unclear which field the error came from.
 *
 * @template {Record<string, unknown>} T
 * @param {T} source
 * @param {string} label used in the error, e.g. "identity 'admin'"
 */
function withEnvGetters(source, label) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isEnvMarker(value)) {
      out[key] = value;
      continue;
    }
    const marker = /** @type {{name: string, hint?: string}} */ (
      /** @type {unknown} */ (value)
    );
    Object.defineProperty(out, key, {
      enumerable: true,
      get() {
        const found = process.env[marker.name];
        if (found === undefined || found === '') {
          throw new Error(
            `${marker.name} is not set — needed for ${label}.${key}` +
              (marker.hint === undefined ? '' : ` — ${marker.hint}`),
          );
        }
        return found;
      },
    });
  }
  return /** @type {T} */ (out);
}

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
export function defineConfig(config) {
  return config;
}

const DEFAULTS = {
  name: 'app',
  start: null,
  apiBase: undefined,
  envFile: undefined,
  loopsDir: 'loops',
  artifactsDir: '.studio-artifacts',
  viewport: { width: 1280, height: 900 },
  settle: 'body',
  settleTimeout: 10_000,
  headed: false,
  auth: null,
  identities: {},
  defaultIdentity: undefined,
  emailPrefix: 'zz-e2e',
  hooks: {},
  verify: { minScreenshotBytes: 10 * 1024 },
  history: { keepRuns: 10 },
};

/**
 * @param {string} path
 * @param {string} [suffix] cache-buster, so a second import re-runs the module
 */
async function importConfig(path, suffix = '') {
  const module = await import(`${pathToFileURL(path).href}${suffix}`);
  const raw = module.default ?? module.config;
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${path} must export a config object as its default export`);
  }
  return /** @type {StudioConfig} */ (raw);
}

/**
 * Load and normalize studio.config.mjs.
 *
 * @param {{ cwd?: string, path?: string, envFile?: string, overrides?: Partial<StudioConfig> }} [options]
 */
export async function loadConfig(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const path = resolve(cwd, options.path ?? 'studio.config.mjs');
  if (!existsSync(path)) {
    // Exit code 2 territory — the studio cannot run. Say what to do, not merely what is
    // missing: `init` is one command away and writes an annotated file.
    throw new Error(
      `no studio.config.mjs at ${path} — run \`npx webapp-agent-studio init\` to write one`,
    );
  }
  const root = dirname(path);

  /** @type {{path: string, loaded: boolean, shadowed: string[]}[]} */
  const envFiles = [];
  // An env file named on the CLI is loaded BEFORE the config module is imported, so that
  // even a config reading `process.env` at its top level sees the values.
  if (typeof options.envFile === 'string' && options.envFile !== '') {
    envFiles.push(loadEnvFile(options.envFile, { root, required: true }));
  }

  let raw = await importConfig(path);

  // A config declaring its OWN `envFile` is a chicken-and-egg: the declaration lives
  // inside the very file we are trying to inform. So load it now and import the module a
  // SECOND time, cache-busted, so a top-level `process.env` read in it sees the values
  // too. Re-importing is safe and cheap here — a config module builds an object; it is
  // not a place for side effects. Skipped entirely when --env-file already named one.
  if (options.envFile === undefined && typeof raw.envFile === 'string' && raw.envFile !== '') {
    const result = loadEnvFile(raw.envFile, { root, required: true });
    if (result.loaded) {
      envFiles.push(result);
      raw = await importConfig(path, `?env=${envFiles.length}`);
    }
  }

  const config = normalizeConfig(raw, { root, overrides: options.overrides });
  return { ...config, envFiles };
}

/**
 * @param {StudioConfig} raw
 * @param {{ root?: string, overrides?: Partial<StudioConfig> }} [options]
 */
export function normalizeConfig(raw, options = {}) {
  const merged = { ...DEFAULTS, ...raw, ...(options.overrides ?? {}) };
  if (typeof merged.baseURL !== 'string' || merged.baseURL === '') {
    throw new Error('studio.config.mjs must set `baseURL` — it is the only required field');
  }

  // Env overrides, so a run can be pointed at another server without editing the file.
  const baseURL = process.env.STUDIO_BASE_URL ?? merged.baseURL;
  const apiBase = process.env.STUDIO_API_BASE ?? merged.apiBase;
  const headed = process.env.HEADED === '1' ? true : merged.headed;

  /** @type {Record<string, Record<string, unknown>>} */
  const identities = {};
  for (const [key, value] of Object.entries(merged.identities ?? {})) {
    identities[key] = withEnvGetters(value, `identity '${key}'`);
  }

  const redactOptions = merged.redact ?? {};
  const redactor = createRedactor({
    presets: redactOptions.presets,
    patterns: /** @type {never[]} */ (redactOptions.patterns ?? []),
  });

  return {
    ...merged,
    root: options.root ?? process.cwd(),
    baseURL,
    apiBase,
    headed,
    identities,
    // Filled in by loadConfig, which is the only thing that loads env files. Present here
    // so ResolvedConfig carries it and a caller never has to guard on undefined.
    envFiles: /** @type {{path: string, loaded: boolean, shadowed: string[]}[]} */ ([]),
    defaultIdentity:
      merged.defaultIdentity ?? Object.keys(identities)[0] ?? undefined,
    maskSelectors: redactOptions.maskSelectors ?? DEFAULT_MASK_SELECTORS,
    redactText: redactor.redactText,
    redactJson: redactor.redactJson,
    verify: /** @type {NonNullable<StudioConfig['verify']>} */ ({
      ...DEFAULTS.verify,
      ...(merged.verify ?? {}),
    }),
    history: /** @type {NonNullable<StudioConfig['history']>} */ ({
      ...DEFAULTS.history,
      ...(merged.history ?? {}),
    }),
    hooks: /** @type {NonNullable<StudioConfig['hooks']>} */ (merged.hooks ?? {}),
  };
}

/** @typedef {Awaited<ReturnType<typeof normalizeConfig>>} ResolvedConfig */

/**
 * The identity a loop asked for, by name.
 * @param {ResolvedConfig} config
 * @param {string | undefined} name
 */
export function identityFor(config, name) {
  const key = name ?? config.defaultIdentity;
  if (key === undefined) return undefined;
  const identity = config.identities[key];
  if (identity === undefined) {
    throw new Error(
      `no identity named '${key}' in studio.config.mjs — declared: ` +
        `${Object.keys(config.identities).join(', ') || '(none)'}`,
    );
  }
  return { name: key, ...identity };
}
